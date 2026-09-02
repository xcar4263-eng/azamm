import http.server
import socketserver
import json
import urllib.parse
import os
import sys
from datetime import datetime, date, timedelta
import psycopg2
from database import get_db, init_db, calculate_pricing_breakdown, log_timeline_event, get_default_permissions

HOST = os.environ.get('HOST', '0.0.0.0')
PORT = int(os.environ.get('PORT', 8080))
STATIC_DIR = os.path.join(os.path.dirname(__file__), 'static')

def row_to_dict(cursor, row):
    if row is None:
        return None
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

def rows_to_list(cursor, rows):
    if not rows:
        return []
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in rows]

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return super().default(obj)

class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

def get_date_range_for_filter(filter_name, custom_from=None, custom_to=None):
    today = date.today()
    if filter_name == 'today':
        return today.isoformat(), today.isoformat()
    elif filter_name == 'yesterday':
        yest = today - timedelta(days=1)
        return yest.isoformat(), yest.isoformat()
    elif filter_name == 'this_week':
        start = today - timedelta(days=(today.weekday() + 2) % 7)
        return start.isoformat(), today.isoformat()
    elif filter_name == 'last_week':
        start_curr = today - timedelta(days=(today.weekday() + 2) % 7)
        start_last = start_curr - timedelta(days=7)
        end_last = start_curr - timedelta(days=1)
        return start_last.isoformat(), end_last.isoformat()
    elif filter_name == 'this_month':
        start = today.replace(day=1)
        return start.isoformat(), today.isoformat()
    elif filter_name == 'last_month':
        first_of_curr = today.replace(day=1)
        last_of_prev = first_of_curr - timedelta(days=1)
        first_of_prev = last_of_prev.replace(day=1)
        return first_of_prev.isoformat(), last_of_prev.isoformat()
    elif filter_name == 'custom':
        return custom_from, custom_to
    return None, None

class MisbahRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Role')
        self.end_headers()

    def send_json_response(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.end_headers()
        json_str = json.dumps(data, ensure_ascii=False, cls=CustomJSONEncoder)
        self.wfile.write(json_str.encode('utf-8'))

    def read_json_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            return {}
        body = self.rfile.read(content_length).decode('utf-8')
        try:
            return json.loads(body)
        except Exception:
            return {}

    def parse_path(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        return path, query

    def check_manager_or_admin_authorization(self):
        role = self.headers.get('X-User-Role', '').strip()
        auth = self.headers.get('Authorization', '').strip()
        if role in ('Admin', 'Manager') or 'Admin' in auth or 'Manager' in auth:
            return True
        return False

    def check_admin_authorization(self):
        role = self.headers.get('X-User-Role', '').strip()
        auth = self.headers.get('Authorization', '').strip()
        if role == 'Admin' or 'Admin' in auth:
            return True
        return False

    def do_GET(self):
        path, query = self.parse_path()
        if path.startswith('/api/'):
            try:
                self.handle_api_get(path, query)
            except Exception as e:
                self.send_json_response({'error': str(e)}, status=500)
        else:
            if path == '/' or path == '':
                self.path = '/index.html'
            return super().do_GET()

    def do_POST(self):
        path, query = self.parse_path()
        if path.startswith('/api/'):
            try:
                self.handle_api_post(path, query)
            except Exception as e:
                self.send_json_response({'error': str(e)}, status=500)
        else:
            self.send_error(404, "Endpoint not found")

    def do_PUT(self):
        path, query = self.parse_path()
        if path.startswith('/api/'):
            try:
                self.handle_api_put(path, query)
            except Exception as e:
                self.send_json_response({'error': str(e)}, status=500)
        else:
            self.send_error(404, "Endpoint not found")

    def do_DELETE(self):
        path, query = self.parse_path()
        if path.startswith('/api/'):
            try:
                self.handle_api_delete(path, query)
            except Exception as e:
                self.send_json_response({'error': str(e)}, status=500)
        else:
            self.send_error(404, "Endpoint not found")

    # ==================== API GET ====================
    def handle_api_get(self, path, query):
        conn = get_db()
        cursor = conn.cursor()

        # فحص صلاحية إدارة المستخدمين للمدير والمالك
        if path.startswith('/api/users'):
            if not self.check_manager_or_admin_authorization():
                self.send_json_response({'error': 'غير مصرح لك بالوصول. هذه الصلاحية للإدارة فقط.'}, status=403)
                conn.close()
                return

        if path == '/api/backup':
            if not self.check_manager_or_admin_authorization():
                self.send_json_response({'error': 'غير مصرح لك بالوصول. هذه الصلاحية للإدارة فقط.'}, status=403)
                conn.close()
                return

        # 1. إحصائيات لوحة التحكم Dashboard
        if path == '/api/stats':
            filter_name = query.get('filter', [''])[0].strip()
            custom_from = query.get('from', [''])[0].strip() or None
            custom_to = query.get('to', [''])[0].strip() or None
            start_date, end_date = get_date_range_for_filter(filter_name, custom_from, custom_to)

            # 1. المخزون الحالي فقط
            cursor.execute("SELECT COUNT(*) FROM misbahs WHERE status = 'حالي'")
            current_misbahs = cursor.fetchone()[0]

            # 2. المبيعات المدفوعة
            sales_date_clause = "s.status IN ('محجوز / مدفوع', 'مدفوع') AND s.payment_status = 'مدفوع كامل'"
            sales_params = []
            if start_date and end_date:
                sales_date_clause += " AND s.sale_date >= %s AND s.sale_date <= %s"
                sales_params.extend([start_date, end_date])
            elif start_date:
                sales_date_clause += " AND s.sale_date >= %s"
                sales_params.append(start_date)

            cursor.execute(f"SELECT COUNT(*) FROM sales s WHERE {sales_date_clause}", sales_params)
            sold_misbahs = cursor.fetchone()[0]

            cursor.execute(f"SELECT COUNT(*) FROM sales s WHERE 1=1 {(' AND s.sale_date >= %s AND s.sale_date <= %s' if start_date and end_date else '')}", sales_params if start_date and end_date else [])
            orders_count = cursor.fetchone()[0]

            cursor.execute(f"SELECT COALESCE(SUM(s.selling_price), 0), COALESCE(SUM(s.profit), 0), COALESCE(SUM(s.supplier_due), 0) FROM sales s WHERE {sales_date_clause}", sales_params)
            s_row = cursor.fetchone()
            total_sales = s_row[0]
            total_profit = s_row[1]

            # المستحق والمسدد للملاك (شرط: الطلب 'مدفوع' وليس 'مسترجع')
            cursor.execute(f'''
                SELECT COALESCE(SUM(CASE WHEN m.status = 'مسترجع' OR s.status = 'مسترجع' THEN 0 ELSE m.supplier_due END), 0) 
                FROM misbahs m
                JOIN sales s ON s.misbah_id = m.id
                WHERE s.status = 'مدفوع' 
                  AND m.owner_payment_status = 'تم الدفع' 
                  {(' AND s.sale_date >= %s AND s.sale_date <= %s' if start_date and end_date else '')}
            ''', sales_params if start_date and end_date else [])
            paid_to_owners = cursor.fetchone()[0]

            cursor.execute(f'''
                SELECT COALESCE(SUM(CASE WHEN m.status = 'مسترجع' OR s.status = 'مسترجع' THEN 0 ELSE m.supplier_due END), 0) 
                FROM misbahs m
                JOIN sales s ON s.misbah_id = m.id
                WHERE s.status = 'مدفوع' 
                  AND m.owner_payment_status != 'تم الدفع' 
                  {(' AND s.sale_date >= %s AND s.sale_date <= %s' if start_date and end_date else '')}
            ''', sales_params if start_date and end_date else [])
            due_to_owners = cursor.fetchone()[0]

            cursor.execute(f'''
                SELECT s.*, m.code as misbah_code, m.cut, m.material 
                FROM sales s 
                LEFT JOIN misbahs m ON s.misbah_id = m.id 
                WHERE {sales_date_clause}
                ORDER BY s.id DESC LIMIT 5
            ''', sales_params)
            recent_sales = rows_to_list(cursor, cursor.fetchall())

            self.send_json_response({
                'current_misbahs': current_misbahs,
                'sold_misbahs': sold_misbahs,
                'orders_count': orders_count,
                'total_sales': round(total_sales, 3),
                'total_profit': round(total_profit, 3),
                'paid_to_owners': round(paid_to_owners, 3),
                'due_to_owners': round(due_to_owners, 3),
                'recent_sales': recent_sales
            })

        # 2. سجل المسباح Timeline
        elif path.startswith('/api/misbahs/') and path.endswith('/timeline'):
            mid = path.split('/')[3]
            cursor.execute('''
                SELECT * FROM misbah_timeline 
                WHERE misbah_id = %s 
                ORDER BY id ASC
            ''', (mid,))
            events = rows_to_list(cursor, cursor.fetchall())
            self.send_json_response(events)

        # 3. قائمة طلبات أصحاب المسابيح والمستحقات التفصيلية
        # إذا كان المسباح / الطلب مسترجع فإن المستحق للمورد يكون 0.000!
        elif path == '/api/owners/items':
            tab = query.get('tab', ['all'])[0].strip()
            sql = '''
                SELECT 
                    m.id, m.code, m.owner_name, m.owner_phone, m.cut, m.material,
                    m.original_price, m.profit, 
                    CASE WHEN s.status = 'مسترجع' OR m.status = 'مسترجع' THEN 0 ELSE m.supplier_due END as supplier_due,
                    m.status as misbah_status, m.receipt_status,
                    m.owner_payment_status, m.owner_payment_date, s.status as sale_status,
                    CASE WHEN m.owner_payment_status = 'تم الدفع' AND s.status != 'مسترجع' AND m.status != 'مسترجع' THEN m.supplier_due ELSE 0 END as amount_paid,
                    CASE WHEN s.status = 'مدفوع' AND m.owner_payment_status != 'تم الدفع' AND s.status != 'مسترجع' AND m.status != 'مسترجع' THEN m.supplier_due ELSE 0 END as amount_pending
                FROM misbahs m
                JOIN sales s ON s.misbah_id = m.id
                WHERE s.status = 'مدفوع'
            '''
            params = []
            if tab == 'pending':
                sql += " AND m.owner_payment_status != 'تم الدفع'"
            elif tab == 'settled':
                sql += " AND m.owner_payment_status = 'تم الدفع'"

            sql += " ORDER BY m.id DESC"
            cursor.execute(sql, params)
            items = rows_to_list(cursor, cursor.fetchall())
            self.send_json_response(items)

        # 4. إحصائيات مستحقات الموردين (المستحق للمورد للقطع المسترجعة = 0.000)
        elif path == '/api/owners/stats':
            cursor.execute("SELECT COALESCE(SUM(CASE WHEN s.status = 'مسترجع' OR m.status = 'مسترجع' THEN 0 ELSE m.supplier_due END), 0) FROM misbahs m JOIN sales s ON s.misbah_id = m.id WHERE s.status = 'مدفوع'")
            total_dues = cursor.fetchone()[0]

            cursor.execute("SELECT COALESCE(SUM(CASE WHEN s.status = 'مسترجع' OR m.status = 'مسترجع' THEN 0 ELSE m.supplier_due END), 0) FROM misbahs m JOIN sales s ON s.misbah_id = m.id WHERE s.status = 'مدفوع' AND m.owner_payment_status != 'تم الدفع'")
            pending_dues = cursor.fetchone()[0]

            cursor.execute("SELECT COALESCE(SUM(CASE WHEN status = 'مسترجع' THEN 0 ELSE supplier_due END), 0) FROM misbahs WHERE owner_payment_status = 'تم الدفع'")
            paid_dues = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM misbahs WHERE status = 'حالي'")
            current_count = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM misbahs WHERE owner_payment_status = 'تم الدفع'")
            settled_count = cursor.fetchone()[0]

            self.send_json_response({
                'total_dues': round(total_dues, 3),
                'pending_dues': round(pending_dues, 3),
                'paid_dues': round(paid_dues, 3),
                'current_misbahs_count': current_count,
                'settled_misbahs_count': settled_count
            })

        # 5. البحث عن عميل معتمد
        elif path == '/api/customers/lookup':
            q = query.get('query', [''])[0].strip()
            clean_q = q.replace('+', '').replace(' ', '').replace('-', '')
            tiktok_q = q if q.startswith('@') else f"@{q}"

            cursor.execute('''
                SELECT * FROM customers 
                WHERE phone = %s 
                   OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = %s
                   OR (country_code || phone) = %s
                   OR (country_code || ' ' || phone) = %s
                   OR tiktok_username = %s 
                   OR tiktok_username = %s
                   OR name = %s
                LIMIT 1
            ''', (q, clean_q, q, q, q, tiktok_q, q))
            cust = row_to_dict(cursor, cursor.fetchone())

            if cust:
                self.send_json_response({'found': True, 'customer': cust})
            else:
                self.send_json_response({'found': False})

        # 6. قائمة العملاء
        elif path == '/api/customers':
            search = query.get('search', [''])[0].strip()
            reliability = query.get('reliability', [''])[0].strip()

            sql = "SELECT * FROM customers WHERE 1=1"
            params = []
            if search:
                sql += " AND (name LIKE %s OR tiktok_username LIKE %s OR phone LIKE %s OR country LIKE %s)"
                wild = f"%{search}%"
                params.extend([wild, wild, wild, wild])
            if reliability:
                sql += " AND reliability = %s"
                params.append(reliability)

            sql += " ORDER BY id DESC"
            cursor.execute(sql, params)
            customers = rows_to_list(cursor, cursor.fetchall())
            self.send_json_response(customers)

        elif path.startswith('/api/customers/'):
            cid = path.split('/')[-1]
            cursor.execute("SELECT * FROM customers WHERE id = %s", (cid,))
            customer = row_to_dict(cursor, cursor.fetchone())
            if customer:
                # سجل المشتريات
                cursor.execute('''
                    SELECT DISTINCT ON (s.misbah_id) s.*, m.code as misbah_code, m.cut, m.material, m.weight_grams, m.bead_count 
                    FROM sales s
                    LEFT JOIN misbahs m ON s.misbah_id = m.id
                    WHERE (s.customer_id = %s OR s.customer_phone LIKE %s OR (s.customer_tiktok != \'\' AND s.customer_tiktok = %s))
                      AND s.invoice_created = 1
                    ORDER BY s.misbah_id, s.id DESC
                ''', (customer['id'], f"%{customer['phone']}%", customer['tiktok_username']))
                customer['sales_history'] = rows_to_list(cursor, cursor.fetchall())

                # سجل الحجوزات
                cursor.execute('''
                    SELECT DISTINCT ON (s.misbah_id) s.*, m.code as misbah_code, m.cut, m.material, m.weight_grams 
                    FROM sales s
                    LEFT JOIN misbahs m ON s.misbah_id = m.id
                    WHERE (s.customer_id = %s OR s.customer_phone LIKE %s) AND s.status LIKE 'محجوز%'
                    ORDER BY s.misbah_id, s.id DESC
                ''', (customer['id'], f"%{customer['phone']}%"))
                customer['reserved_orders'] = rows_to_list(cursor, cursor.fetchall())

                # المسابيح الموردة
                cursor.execute('''
                    SELECT * FROM misbahs 
                    WHERE owner_id = %s OR owner_name = %s OR owner_phone LIKE %s
                    ORDER BY id DESC
                ''', (customer['id'], customer['name'], f"%{customer['phone']}%"))
                customer['supplied_misbahs'] = rows_to_list(cursor, cursor.fetchall())

                # ملخص مستحقات المورد
                cursor.execute('''
                    SELECT 
                        COALESCE(SUM(CASE WHEN s.status = 'مدفوع' AND m.status != 'مسترجع' THEN m.supplier_due ELSE 0 END), 0) as total_dues,
                        COALESCE(SUM(CASE WHEN m.owner_payment_status = 'تم الدفع' AND m.status != 'مسترجع' THEN m.supplier_due ELSE 0 END), 0) as total_paid,
                        COALESCE(SUM(CASE WHEN s.status = 'مدفوع' AND m.owner_payment_status != 'تم الدفع' AND m.status != 'مسترجع' THEN m.supplier_due ELSE 0 END), 0) as pending_dues
                    FROM misbahs m
                    LEFT JOIN sales s ON s.misbah_id = m.id
                    WHERE m.owner_id = %s OR m.owner_name = %s OR m.owner_phone LIKE %s
                ''', (customer['id'], customer['name'], f"%{customer['phone']}%"))
                dues_row = cursor.fetchone()
                customer['dues_summary'] = {
                    'total_dues': round(dues_row[0], 3),
                    'total_paid': round(dues_row[1], 3),
                    'pending_dues': round(dues_row[2], 3)
                }

                self.send_json_response(customer)
            else:
                self.send_json_response({'error': 'العميل غير موجود'}, status=404)

        # 7. المسابيح / المخزون
        elif path == '/api/misbahs':
            tab = query.get('tab', [''])[0].strip()
            status = query.get('status', [''])[0].strip()
            search = query.get('search', [''])[0].strip()
            cut = query.get('cut', [''])[0].strip()

            sql = "SELECT * FROM misbahs WHERE 1=1"
            params = []

            if tab == 'stock' or not tab:
                sql += " AND status = 'حالي'"
            elif tab == 'returned':
                sql += " AND status = 'مسترجع'"
            elif status:
                sql += " AND status = %s"
                params.append(status)

            if cut:
                sql += " AND cut = %s"
                params.append(cut)

            if search:
                sql += " AND (code LIKE %s OR owner_name LIKE %s OR owner_phone LIKE %s OR cut LIKE %s OR material LIKE %s OR notes LIKE %s)"
                wild = f"%{search}%"
                params.extend([wild, wild, wild, wild, wild, wild])

            sql += " ORDER BY id DESC"
            cursor.execute(sql, params)
            misbahs = rows_to_list(cursor, cursor.fetchall())
            for m in misbahs:
                if m.get('status') == 'مسترجع':
                    m['supplier_due'] = 0.0
            self.send_json_response(misbahs)

        elif path.startswith('/api/misbahs/'):
            mid = path.split('/')[-1]
            cursor.execute("SELECT * FROM misbahs WHERE id = %s", (mid,))
            misbah = row_to_dict(cursor, cursor.fetchone())
            if misbah:
                if misbah.get('status') == 'مسترجع':
                    misbah['supplier_due'] = 0.0
                cursor.execute("SELECT * FROM sales WHERE misbah_id = %s ORDER BY id DESC LIMIT 1", (mid,))
                misbah['sale_info'] = row_to_dict(cursor, cursor.fetchone())
                self.send_json_response(misbah)
            else:
                self.send_json_response({'error': 'المسباح غير موجود'}, status=404)

        # 8. المبيعات والطلبات
        elif path == '/api/sales':
            search = query.get('search', [''])[0].strip()
            status_filter = query.get('status', [''])[0].strip()

            params = []
            where_clauses = ['1=1']
            if search:
                where_clauses.append("(s.sale_code ILIKE %s OR s.customer_name ILIKE %s OR s.customer_phone ILIKE %s OR s.customer_tiktok ILIKE %s OR m.code ILIKE %s)")
                wild = f"%{search}%"
                params.extend([wild, wild, wild, wild, wild])
            if status_filter:
                where_clauses.append("s.status = %s")
                params.append(status_filter)

            where_str = ' AND '.join(where_clauses)
            inner_sql = f'''
                SELECT DISTINCT ON (s.misbah_id)
                    s.*, m.code as misbah_code, m.cut, m.material, m.weight_grams, m.bead_count,
                    m.owner_name as misbah_owner_name, m.owner_phone as misbah_owner_phone
                FROM sales s
                LEFT JOIN misbahs m ON s.misbah_id = m.id
                WHERE {where_str}
                ORDER BY s.misbah_id, s.id DESC
            '''
            cursor.execute(f"SELECT * FROM ({inner_sql}) sub ORDER BY id DESC", params)
            sales = rows_to_list(cursor, cursor.fetchall())
            for s in sales:
                if s.get('status') == 'مسترجع':
                    s['supplier_due'] = 0.0
            self.send_json_response(sales)

        elif path.startswith('/api/sales/'):
            sid = path.split('/')[-1]
            cursor.execute('''
                SELECT s.*, m.code as misbah_code, m.cut, m.material, m.weight_grams, m.bead_count, m.bead_size, m.owner_name, m.owner_phone
                FROM sales s
                LEFT JOIN misbahs m ON s.misbah_id = m.id
                WHERE s.id = %s
            ''', (sid,))
            sale = row_to_dict(cursor, cursor.fetchone())
            if sale:
                if sale.get('status') == 'مسترجع':
                    sale['supplier_due'] = 0.0
                self.send_json_response(sale)
            else:
                self.send_json_response({'error': 'عملية البيع غير موجودة'}, status=404)

        # 9. أصحاب المسابيح والمستحقات
        elif path == '/api/owners':
            cursor.execute('''
                SELECT 
                    m.owner_name, 
                    m.owner_phone,
                    COUNT(m.id) as total_pieces,
                    SUM(CASE WHEN m.status = 'حالي' THEN 1 ELSE 0 END) as active_pieces,
                    SUM(CASE WHEN m.status = 'مباع' THEN 1 ELSE 0 END) as sold_pieces,
                    SUM(m.original_price) as total_value,
                    SUM(CASE WHEN s.status = 'مدفوع' AND m.status != 'مسترجع' THEN m.supplier_due ELSE 0 END) as sold_due_total,
                    SUM(CASE WHEN m.owner_payment_status = 'تم الدفع' AND m.status != 'مسترجع' THEN m.supplier_due ELSE 0 END) as total_paid,
                    SUM(CASE WHEN s.status = 'مدفوع' AND m.owner_payment_status != 'تم الدفع' AND m.status != 'مسترجع' THEN m.supplier_due ELSE 0 END) as total_pending
                FROM misbahs m
                JOIN sales s ON s.misbah_id = m.id
                WHERE s.status = 'مدفوع'
                GROUP BY m.owner_name, m.owner_phone
                ORDER BY total_pending DESC, total_pieces DESC
            ''')
            owners_summary = rows_to_list(cursor, cursor.fetchall())
            self.send_json_response({'owners': owners_summary})

        # 10. المستخدمين والصلاحيات
        elif path == '/api/users':
            cursor.execute("SELECT id, username, full_name, role, phone, permissions, is_active, created_at FROM users ORDER BY id ASC")
            users = rows_to_list(cursor, cursor.fetchall())
            for u in users:
                if u.get('permissions'):
                    try:
                        u['permissions'] = json.loads(u['permissions'])
                    except:
                        u['permissions'] = get_default_permissions(u['role'])
                else:
                    u['permissions'] = get_default_permissions(u['role'])
            self.send_json_response(users)

        # 11. الإعدادات والهوية
        elif path == '/api/settings':
            cursor.execute("SELECT key, value FROM settings")
            settings = {r[0]: r[1] for r in cursor.fetchall()}
            self.send_json_response(settings)

        # 12. النسخ الاحتياطي
        elif path == '/api/backup':
            tables = ['users', 'customers', 'misbahs', 'misbah_timeline', 'sales', 'owner_payments', 'settings']
            backup_data = {}
            for table in tables:
                cursor.execute(f"SELECT * FROM {table}")
                backup_data[table] = rows_to_list(cursor, cursor.fetchall())
            self.send_json_response({
                'exported_at': datetime.now().isoformat(),
                'system_name': 'عبق الكهرب',
                'version': '13.0',
                'data': backup_data
            })

        else:
            self.send_json_response({'error': 'Not found'}, status=404)

        conn.close()

    # ==================== API POST ====================
    def handle_api_post(self, path, query):
        conn = get_db()
        cursor = conn.cursor()
        body = self.read_json_body()

        # فحص صلاحيات الإدارة للعمليات الحساسة
        if path.startswith('/api/users') or path == '/api/restore':
            if not self.check_manager_or_admin_authorization():
                self.send_json_response({'error': 'غير مصرح لك بتنفيذ هذا الإجراء. هذه الصلاحية للإدارة فقط.'}, status=403)
                conn.close()
                return

        if path.startswith('/api/settings'):
            if not self.check_manager_or_admin_authorization():
                self.send_json_response({'error': 'غير مصرح لك بتعديل الإعدادات.'}, status=403)
                conn.close()
                return

        # تسجيل الدخول
        if path == '/api/auth/login':
            username = body.get('username', '').strip()
            password = body.get('password', '').strip()

            cursor.execute("SELECT id, username, full_name, role, phone, permissions, is_active FROM users WHERE username = %s AND password = %s", (username, password))
            user = row_to_dict(cursor, cursor.fetchone())
            if user:
                if user.get('is_active') == 0:
                    self.send_json_response({'success': False, 'error': 'هذا الحساب معطل حالياً من قبل الإدارة'}, status=403)
                    conn.close()
                    return

                if user.get('permissions'):
                    try:
                        user['permissions'] = json.loads(user['permissions'])
                    except:
                        user['permissions'] = get_default_permissions(user['role'])
                else:
                    user['permissions'] = get_default_permissions(user['role'])

                self.send_json_response({
                    'success': True,
                    'user': user,
                    'token': f"session-{user['id']}-{user['role']}"
                })
            else:
                self.send_json_response({'success': False, 'error': 'اسم المستخدم أو كلمة المرور غير صحيحة'}, status=401)

        # إضافة عميل معتمد
        elif path == '/api/customers':
            name = body.get('name', '').strip()
            phone = body.get('phone', '').strip()
            tiktok = body.get('tiktok_username', '').strip()

            if not name:
                self.send_json_response({'error': 'الاسم الكامل مطلوب'}, status=400)
                conn.close()
                return

            now_ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute('''
                INSERT INTO customers (name, tiktok_username, phone, country_code, country, reliability, notes, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ''', (
                name,
                tiktok,
                phone,
                body.get('country_code', '+965'),
                body.get('country', 'الكويت'),
                body.get('reliability', 'معتمد'),
                body.get('notes', ''),
                now_ts
            ))
            cursor.execute("SELECT lastval()")
            new_id = cursor.fetchone()[0]
            conn.commit()
            cursor.execute("SELECT * FROM customers WHERE id = %s", (new_id,))
            created = row_to_dict(cursor, cursor.fetchone())
            self.send_json_response(created, status=201)

        # استيراد العملاء من Excel
        elif path == '/api/customers/import':
            rows = body.get('rows', [])
            if not rows:
                self.send_json_response({'error': 'الملف فارغ أو لا يحتوي على صفوف بيانات'}, status=400)
                conn.close()
                return

            imported_count = 0
            errors = []
            duplicates = []

            for idx, r in enumerate(rows):
                row_num = idx + 2
                name = str(r.get('name') or r.get('الاسم الكامل') or r.get('الاسم') or '').strip()
                phone_raw = str(r.get('phone') or r.get('الهاتف ومفتاح الدولة') or r.get('الهاتف') or r.get('رقم الهاتف') or '').strip()
                tiktok = str(r.get('tiktok') or r.get('Username TikTok') or r.get('تيك توك') or '').strip()
                country = str(r.get('country') or r.get('الدولة') or 'الكويت').strip()
                reliability = str(r.get('reliability') or r.get('حالة الاعتماد') or 'معتمد').strip()

                if not name:
                    errors.append({
                        'row': row_num,
                        'field': 'الاسم الكامل',
                        'error': 'الاسم الكامل مطلوب ومفقود في هذا الصف'
                    })
                    continue

                country_code = '+965'
                phone = phone_raw
                if phone_raw.startswith('+'):
                    parts = phone_raw.split(' ')
                    if len(parts) > 1:
                        country_code = parts[0]
                        phone = ' '.join(parts[1:])
                    else:
                        phone = phone_raw

                cursor.execute('''
                    SELECT id, name FROM customers 
                    WHERE (phone != '' AND phone = %s) 
                       OR (tiktok_username != '' AND tiktok_username = %s)
                ''', (phone, tiktok))
                existing = cursor.fetchone()
                if existing:
                    duplicates.append({
                        'row': row_num,
                        'name': name,
                        'existing_name': existing[1],
                        'message': f'العميل مسجل مسبقاً باسم ({existing[1]})'
                    })
                    continue

                now_ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                cursor.execute('''
                    INSERT INTO customers (name, tiktok_username, phone, country_code, country, reliability, notes, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ''', (name, tiktok, phone, country_code, country, reliability, 'مستورد عبر Excel', now_ts))
                imported_count += 1

            conn.commit()
            self.send_json_response({
                'success': True,
                'imported_count': imported_count,
                'errors': errors,
                'duplicates': duplicates,
                'message': f'تم استيراد {imported_count} عميل بنجاح'
            })

        # إضافة مسباح للمخزون
        elif path == '/api/misbahs':
            owner_id = body.get('owner_id')
            owner_name = body.get('owner_name', '').strip()
            owner_phone = body.get('owner_phone', '').strip()

            cut = body.get('cut', '').strip()
            material = body.get('material', '').strip()
            weight = body.get('weight_grams')
            bead_count = body.get('bead_count')
            orig_price = body.get('original_price')

            if not cut:
                self.send_json_response({'error': 'حقل القصة إلزامي *'}, status=400)
                conn.close()
                return
            if not material:
                self.send_json_response({'error': 'حقل الخامة / المادة إلزامي *'}, status=400)
                conn.close()
                return
            if weight is None or str(weight).strip() == '':
                self.send_json_response({'error': 'حقل الوزن بالجرام إلزامي *'}, status=400)
                conn.close()
                return
            if bead_count is None or str(bead_count).strip() == '':
                self.send_json_response({'error': 'حقل عدد الخرز إلزامي *'}, status=400)
                conn.close()
                return
            if orig_price is None or str(orig_price).strip() == '':
                self.send_json_response({'error': 'حقل السعر الأصلي إلزامي *'}, status=400)
                conn.close()
                return
            if not owner_name:
                self.send_json_response({'error': 'يرجى اختيار صاحب المسباح / المورد'}, status=400)
                conn.close()
                return

            cursor.execute("SELECT MAX(id) FROM misbahs")
            max_id = cursor.fetchone()[0] or 0
            code = f"ORD-{100 + max_id + 1}"

            original_price = float(orig_price)
            profit, selling_price, supplier_due = calculate_pricing_breakdown(original_price)

            cursor.execute('''
                INSERT INTO misbahs (code, owner_id, owner_name, owner_phone, status, sub_status,
                                     cut, material, weight_grams, bead_count, bead_size, original_price, 
                                     profit, supplier_due, selling_price, sale_status, owner_payment_status, notes)
                VALUES (%s, %s, %s, %s, 'حالي', 'متوفر', %s, %s, %s, %s, %s, %s, %s, %s, %s, 'غير مباع', 'لم يتم الدفع', %s)
            ''', (
                code,
                owner_id,
                owner_name,
                owner_phone,
                cut,
                material,
                float(weight),
                int(bead_count),
                body.get('bead_size', ''),
                original_price,
                profit,
                supplier_due,
                selling_price,
                body.get('notes', '')
            ))
            cursor.execute("SELECT lastval()")
            new_id = cursor.fetchone()[0]
            conn.commit()

            created_by = body.get('created_by', 'موظف النظام')
            log_timeline_event(conn, new_id, 'إضافة للمخزون', f'تمت إضافة المسباح للمخزون برقم ({code})', f'القصة: {cut} | الخامة: {material} | المستحق للمورد: {supplier_due} د.ك', created_by)

            cursor.execute("SELECT * FROM misbahs WHERE id = %s", (new_id,))
            created = row_to_dict(cursor, cursor.fetchone())
            self.send_json_response(created, status=201)

        # تسجيل حدث في الـ Timeline
        elif path.startswith('/api/misbahs/') and path.endswith('/timeline'):
            mid = path.split('/')[3]
            event_type = body.get('event_type', 'ملاحظة')
            title = body.get('title', 'تحديث يدوي')
            desc = body.get('description', '')
            emp = body.get('employee_name', 'موظف النظام')

            log_timeline_event(conn, int(mid), event_type, title, desc, emp)
            self.send_json_response({'success': True, 'message': 'تم تسجيل الحدث بنجاح'})

        # تسجيل طلب جديد
        elif path == '/api/sales':
            misbah_id = body.get('misbah_id')
            if not misbah_id:
                self.send_json_response({'error': 'يرجى اختيار المسباح'}, status=400)
                conn.close()
                return

            cursor.execute("SELECT * FROM misbahs WHERE id = %s", (misbah_id,))
            misbah = row_to_dict(cursor, cursor.fetchone())
            if not misbah:
                self.send_json_response({'error': 'المسباح غير موجود'}, status=404)
                conn.close()
                return

            if misbah['status'] == 'مباع':
                self.send_json_response({'error': 'هذا المسباح مباع بالفعل مسبقاً!'}, status=400)
                conn.close()
                return

            customer_identifier = (body.get('customer_phone') or body.get('customer_tiktok') or body.get('customer_name') or '').strip()
            clean_ident = customer_identifier.replace('+', '').replace(' ', '').replace('-', '')
            tiktok_ident = customer_identifier if customer_identifier.startswith('@') else f"@{customer_identifier}"

            cursor.execute('''
                SELECT * FROM customers 
                WHERE phone = %s 
                   OR REPLACE(REPLACE(phone, '+', ''), ' ', '') = %s
                   OR (country_code || phone) = %s
                   OR tiktok_username = %s 
                   OR tiktok_username = %s
                   OR name = %s
                LIMIT 1
            ''', (customer_identifier, clean_ident, customer_identifier, customer_identifier, tiktok_ident, customer_identifier))
            customer = row_to_dict(cursor, cursor.fetchone())

            if not customer or customer.get('reliability') != 'معتمد':
                self.send_json_response({
                    'error': 'هذا الشخص غير معتمد، يرجى إضافة صاحب الاعتماد في قائمة العملاء أولاً.'
                }, status=400)
                conn.close()
                return

            payment_status_input = body.get('payment_status', 'غير مدفوع')
            selling_price = float(misbah['selling_price'])
            original_price = float(misbah['original_price'])
            profit = float(misbah['profit'])
            supplier_due = float(misbah.get('supplier_due') or (original_price - profit))

            sale_date = body.get('sale_date') or datetime.now().strftime('%Y-%m-%d')
            payment_method = body.get('payment_method', 'كي نت')
            recipient_name = body.get('recipient_name', '').strip()
            delivery_country = body.get('delivery_country', 'الكويت 🇰🇼').strip()
            notes = body.get('notes', '')
            created_by = body.get('created_by', 'موظف النظام')

            if payment_status_input == 'غير مدفوع':
                status = 'محجوز / غير مدفوع'
                payment_status = 'غير مدفوع'
                invoice_created = 0
                sale_code = f"RES-{misbah['code']}"
                paid_amount = 0.0
                remaining_amount = selling_price
                paid_date = None

                cursor.execute('''
                    UPDATE misbahs 
                    SET status = 'حالي', sub_status = 'محجوز'
                    WHERE id = %s
                ''', (misbah_id,))

                log_timeline_event(conn, misbah_id, 'حجز', f'تم تسجيل الطلب كـ (محجوز / غير مدفوع) للعميل ({customer["name"]})', f'حالة الدفع: غير مدفوع (محجوز في المخزون)', created_by)

            else:
                status = 'محجوز / مدفوع'
                payment_status = 'مدفوع كامل'
                invoice_created = 1
                cursor.execute("SELECT MAX(id) FROM sales WHERE invoice_created = 1")
                max_sale_id = cursor.fetchone()[0] or 0
                sale_code = f"INV-{datetime.now().year}-{1000 + max_sale_id + 1}"
                paid_amount = float(body.get('paid_amount', selling_price))
                remaining_amount = round(selling_price - paid_amount, 3)
                if remaining_amount < 0: remaining_amount = 0.0
                paid_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

                cursor.execute('''
                    UPDATE misbahs 
                    SET status = 'مباع', sub_status = 'تم البيع', sale_status = 'تم البيع', sale_date = %s
                    WHERE id = %s
                ''', (sale_date, misbah_id))

                log_timeline_event(conn, misbah_id, 'دفع وبيع', f'تم الدفع وإصدار الفاتورة ({sale_code}) كـ (محجوز / مدفوع)', f'طريقة الدفع: {payment_method} | السعر: {selling_price} د.ك | تاريخ ووقت الدفع: {paid_date}', created_by)

            customer_phone = f"{customer.get('country_code', '+965')} {customer.get('phone', '')}".strip()

            cursor.execute("SELECT id FROM sales WHERE misbah_id = %s ORDER BY id DESC LIMIT 1", (misbah_id,))
            existing_sale = cursor.fetchone()

            if existing_sale:
                sale_id_to_update = existing_sale[0]
                cursor.execute('''
                    UPDATE sales 
                    SET sale_code = %s, customer_id = %s, customer_name = %s, customer_phone = %s, customer_tiktok = %s,
                        original_price = %s, profit = %s, supplier_due = %s, selling_price = %s, status = %s, payment_status = %s,
                        invoice_created = %s, paid_amount = %s, remaining_amount = %s, sale_date = %s, paid_date = %s,
                        payment_method = %s, recipient_name = %s, delivery_country = %s, notes = %s, created_by = %s
                    WHERE id = %s
                ''', (
                    sale_code, customer['id'], customer['name'], customer_phone, customer.get('tiktok_username', ''),
                    original_price, profit, supplier_due, selling_price, status, payment_status,
                    invoice_created, paid_amount, remaining_amount, sale_date, paid_date,
                    payment_method, recipient_name, delivery_country, notes, created_by,
                    sale_id_to_update
                ))
                new_sale_id = sale_id_to_update
            else:
                cursor.execute('''
                    INSERT INTO sales (sale_code, misbah_id, customer_id, customer_name, customer_phone, customer_tiktok,
                                       original_price, profit, supplier_due, selling_price, status, payment_status, invoice_created,
                                       paid_amount, remaining_amount, sale_date, paid_date, payment_method,
                                       recipient_name, delivery_country, notes, created_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''', (
                    sale_code, misbah_id, customer['id'], customer['name'], customer_phone, customer.get('tiktok_username', ''),
                    original_price, profit, supplier_due, selling_price, status, payment_status, invoice_created,
                    paid_amount, remaining_amount, sale_date, paid_date, payment_method,
                    recipient_name, delivery_country, notes, created_by
                ))
                cursor.execute("SELECT lastval()")
                new_sale_id = cursor.fetchone()[0]

            conn.commit()

            cursor.execute('''
                SELECT s.*, m.code as misbah_code, m.cut, m.material, m.weight_grams, m.bead_count, m.owner_name, m.owner_phone
                FROM sales s
                LEFT JOIN misbahs m ON s.misbah_id = m.id
                WHERE s.id = %s
            ''', (new_sale_id,))
            created_sale = row_to_dict(cursor, cursor.fetchone())
            self.send_json_response(created_sale, status=201)

        # سداد مستحقات المورد
        elif path == '/api/owners/pay-batch':
            misbah_ids = body.get('misbah_ids', [])
            pay_date = body.get('payment_date') or datetime.now().strftime('%Y-%m-%d')
            pay_method = body.get('payment_method', 'تحويل بنكي')
            notes = body.get('notes', '')
            emp = body.get('employee_name', 'موظف النظام')

            if not misbah_ids:
                self.send_json_response({'error': 'لم يتم تحديد أي مسباح للسداد'}, status=400)
                conn.close()
                return

            placeholders = ', '.join(['%s'] * len(misbah_ids))
            cursor.execute(f"SELECT id, owner_name, owner_phone, supplier_due, original_price, code FROM misbahs WHERE id IN ({placeholders})", misbah_ids)
            items = rows_to_list(cursor, cursor.fetchall())

            for item in items:
                due_amount = float(item.get('supplier_due') or item.get('original_price'))
                cursor.execute('''
                    UPDATE misbahs 
                    SET owner_payment_status = 'تم الدفع', owner_payment_date = %s
                    WHERE id = %s
                ''', (pay_date, item['id']))

                cursor.execute('''
                    INSERT INTO owner_payments (owner_name, owner_phone, misbah_id, amount_paid, payment_date, payment_method, notes)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                ''', (item['owner_name'], item['owner_phone'], item['id'], due_amount, pay_date, pay_method, f"سداد مستحقات طلب {item['code']} {notes}"))

                log_timeline_event(conn, item['id'], 'سداد المورد', f'تم سداد مستحقات المورد ({item["owner_name"]}) بمبلغ {due_amount} د.ك', f'طريقة السداد: {pay_method}', emp)

            conn.commit()
            self.send_json_response({'success': True, 'count': len(items), 'message': f"تم تسجيل سداد {len(items)} مسباح بنجاح"})

        # حفظ إعدادات الهوية
        elif path == '/api/settings/identity':
            for k in ['system_logo', 'invoice_logo', 'primary_color', 'secondary_color']:
                if k in body:
                    cursor.execute("INSERT INTO settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (k, str(body[k])))
            conn.commit()
            self.send_json_response({'success': True, 'message': 'تم حفظ وتحديث الشعار على السيرفر بنجاح'})

        # حفظ الإعدادات العامة
        elif path == '/api/settings':
            for k, v in body.items():
                cursor.execute("INSERT INTO settings (key, value) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (k, str(v)))
            conn.commit()
            self.send_json_response({'success': True, 'message': 'تم حفظ الإعدادات بنجاح'})

        # استعادة نسخة احتياطية
        elif path == '/api/restore':
            backup_data = body.get('data', {})
            if not backup_data:
                self.send_json_response({'error': 'بيانات النسخة الاحتياطية غير صالحة'}, status=400)
                conn.close()
                return

            for table, rows in backup_data.items():
                if table in ['users', 'customers', 'misbahs', 'misbah_timeline', 'sales', 'owner_payments', 'settings']:
                    cursor.execute(f"DELETE FROM {table}")
                    if rows:
                        columns = list(rows[0].keys())
                        placeholders = ', '.join(['%s'] * len(columns))
                        col_names = ', '.join(columns)
                        query = f"INSERT INTO {table} ({col_names}) VALUES ({placeholders})"
                        for r in rows:
                            values = [r[c] for c in columns]
                            cursor.execute(query, values)
            conn.commit()
            self.send_json_response({'success': True, 'message': 'تمت استعادة البيانات بنجاح'})

        # إضافة مستخدم بصلاحيات مخصصة
        elif path == '/api/users':
            username = body.get('username', '').strip()
            password = body.get('password', '').strip()
            full_name = body.get('full_name', '').strip()
            role = body.get('role', 'Employee')
            phone = body.get('phone', '')
            perms = body.get('permissions')
            if isinstance(perms, dict):
                perms_str = json.dumps(perms, ensure_ascii=False)
            else:
                perms_str = json.dumps(get_default_permissions(role), ensure_ascii=False)

            if not username or not password or not full_name:
                self.send_json_response({'error': 'جميع الحقول الأساسية مطلوبة'}, status=400)
                conn.close()
                return

            try:
                cursor.execute('''
                    INSERT INTO users (username, password, full_name, role, phone, permissions, is_active)
                    VALUES (%s, %s, %s, %s, %s, %s, 1)
                ''', (username, password, full_name, role, phone, perms_str))
                cursor.execute("SELECT lastval()")
                new_uid = cursor.fetchone()[0]
                conn.commit()
                cursor.execute("SELECT id, username, full_name, role, phone, permissions, is_active, created_at FROM users WHERE id = %s", (new_uid,))
                created_user = row_to_dict(cursor, cursor.fetchone())
                if created_user.get('permissions'):
                    created_user['permissions'] = json.loads(created_user['permissions'])
                self.send_json_response(created_user, status=201)
            except psycopg2.errors.UniqueViolation:
                self.send_json_response({'error': 'اسم المستخدم مسجل مسبقاً'}, status=400)

        else:
            self.send_json_response({'error': 'Not found'}, status=404)

        conn.close()

    # ==================== API PUT ====================
    def handle_api_put(self, path, query):
        conn = get_db()
        cursor = conn.cursor()
        body = self.read_json_body()
        emp = body.get('employee_name', 'موظف النظام')

        # تعديل حالة سداد المورد لقطعة معينة
        if path.startswith('/api/owners/toggle-payment/'):
            mid = path.split('/')[-1]
            cursor.execute("SELECT * FROM misbahs WHERE id = %s", (mid,))
            misbah = row_to_dict(cursor, cursor.fetchone())
            if not misbah:
                self.send_json_response({'error': 'المسباح غير موجود'}, status=404)
                conn.close()
                return

            new_status = 'لم يتم الدفع' if misbah['owner_payment_status'] == 'تم الدفع' else 'تم الدفع'
            pay_date = datetime.now().strftime('%Y-%m-%d') if new_status == 'تم الدفع' else None

            cursor.execute('''
                UPDATE misbahs 
                SET owner_payment_status = %s, owner_payment_date = %s
                WHERE id = %s
            ''', (new_status, pay_date, mid))

            if new_status == 'لم يتم الدفع':
                log_timeline_event(conn, int(mid), 'تعديل سداد المورد', f'تغيير حالة سداد المورد ({misbah["owner_name"]}) من (تم الدفع) إلى (غير مدفوع ↩️)', 'تم إلغاء السداد وإعادة المبلغ للمستحقات المتبقية', emp)
            else:
                log_timeline_event(conn, int(mid), 'سداد المورد', f'تم سداد مستحقات المورد ({misbah["owner_name"]}) بمبلغ {misbah["supplier_due"]} د.ك', f'تاريخ السداد: {pay_date}', emp)

            conn.commit()
            self.send_json_response({'success': True, 'new_status': new_status, 'message': f'تم تعديل حالة السداد إلى: {new_status} وتوثيق الحدث في السجل'})
            conn.close()
            return

        # 1. تعديل شامل لأي طلب (المستحق للمورد يصبح 0.000 عند اختيار حالة مسترجع!)
        elif path.startswith('/api/sales/') and not path.endswith('/receipt-status') and not path.endswith('/cancel-reservation') and not path.endswith('/return') and not path.endswith('/pay'):
            sid = path.split('/')[-1]
            cursor.execute("SELECT * FROM sales WHERE id = %s", (sid,))
            sale = row_to_dict(cursor, cursor.fetchone())
            if not sale:
                self.send_json_response({'error': 'الطلب غير موجود'}, status=404)
                conn.close()
                return

            new_status = body.get('status', sale['status'])
            new_payment_status = body.get('payment_status', sale['payment_status'])
            new_selling_price = float(body.get('selling_price', sale['selling_price']))
            new_customer_name = body.get('customer_name', sale['customer_name'])
            new_payment_method = body.get('payment_method', sale['payment_method'])
            new_recipient_name = body.get('recipient_name', sale['recipient_name'])
            new_delivery_country = body.get('delivery_country', sale['delivery_country'])
            new_receipt_status = body.get('receipt_status', sale['receipt_status'])
            new_notes = body.get('notes', sale['notes'])

            invoice_created = sale['invoice_created']
            sale_code = sale['sale_code']
            paid_amount = float(body.get('paid_amount', sale['paid_amount']))
            new_supplier_due = sale['supplier_due']

            if (new_status in ('محجوز / مدفوع', 'مدفوع')) and new_receipt_status == 'تم الاستلام':
                new_status = 'مدفوع'
                new_payment_status = 'مدفوع كامل'
                paid_amount = new_selling_price
                invoice_created = 1
                if not sale_code or sale_code.startswith('RES-'):
                    cursor.execute("SELECT MAX(id) FROM sales WHERE invoice_created = 1")
                    max_id = cursor.fetchone()[0] or 0
                    sale_code = f"INV-{datetime.now().year}-{1000 + max_id + 1}"
                cursor.execute("UPDATE misbahs SET status = 'مباع', sub_status = 'تم البيع', sale_status = 'تم البيع', receipt_status = 'تم الاستلام' WHERE id = %s", (sale['misbah_id'],))

            elif new_status in ('محجوز / مدفوع', 'مدفوع') and new_receipt_status != 'تم الاستلام':
                new_status = 'محجوز / مدفوع'
                new_payment_status = 'مدفوع كامل'
                paid_amount = new_selling_price
                invoice_created = 1
                if not sale_code or sale_code.startswith('RES-'):
                    cursor.execute("SELECT MAX(id) FROM sales WHERE invoice_created = 1")
                    max_id = cursor.fetchone()[0] or 0
                    sale_code = f"INV-{datetime.now().year}-{1000 + max_id + 1}"
                cursor.execute("UPDATE misbahs SET status = 'مباع', sub_status = 'تم البيع', sale_status = 'تم البيع', receipt_status = %s WHERE id = %s", (new_receipt_status, sale['misbah_id']))

            elif new_status == 'محجوز / غير مدفوع':
                new_payment_status = 'غير مدفوع'
                paid_amount = 0.0
                cursor.execute("UPDATE misbahs SET status = 'حالي', sub_status = 'محجوز', receipt_status = %s WHERE id = %s", (new_receipt_status, sale['misbah_id']))

            elif new_status == 'مسترجع':
                new_payment_status = 'تم استرجاع المبلغ'
                new_supplier_due = 0.0 # المستحق للمورد يصبح 0.000 عند الاسترجاع!
                cursor.execute("UPDATE misbahs SET status = 'مسترجع', sub_status = 'مسترجع', supplier_due = 0, sale_status = 'غير مباع', receipt_status = %s WHERE id = %s", (new_receipt_status, sale['misbah_id']))

            cursor.execute('''
                UPDATE sales 
                SET status = %s, payment_status = %s, selling_price = %s, paid_amount = %s, supplier_due = %s,
                    customer_name = %s, payment_method = %s, recipient_name = %s,
                    delivery_country = %s, receipt_status = %s, notes = %s,
                    invoice_created = %s, sale_code = %s
                WHERE id = %s
            ''', (
                new_status, new_payment_status, new_selling_price, paid_amount, new_supplier_due,
                new_customer_name, new_payment_method, new_recipient_name,
                new_delivery_country, new_receipt_status, new_notes,
                invoice_created, sale_code, sid
            ))

            log_timeline_event(conn, sale['misbah_id'], 'تعديل الطلب', f'تم تعديل بيانات وحالة الطلب إلى ({new_status}) وحالة الاستلام إلى ({new_receipt_status})', f'حالة الدفع: {new_payment_status} | السعر: {new_selling_price} د.ك', emp)
            conn.commit()

            cursor.execute("SELECT * FROM sales WHERE id = %s", (sid,))
            updated_sale = row_to_dict(cursor, cursor.fetchone())
            self.send_json_response(updated_sale)
            conn.close()
            return

        # 2. تحويل الطلب من (محجوز / غير مدفوع) إلى (محجوز / مدفوع) أو (مدفوع)
        elif path.endswith('/pay') and '/api/sales/' in path:
            sid = path.split('/')[-2]
            cursor.execute("SELECT * FROM sales WHERE id = %s", (sid,))
            sale = row_to_dict(cursor, cursor.fetchone())
            if not sale:
                self.send_json_response({'error': 'الطلب غير موجود'}, status=404)
                conn.close()
                return

            cursor.execute("SELECT MAX(id) FROM sales WHERE invoice_created = 1")
            max_inv_id = cursor.fetchone()[0] or 0
            sale_code = f"INV-{datetime.now().year}-{1000 + max_inv_id + 1}"
            paid_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            pay_method = body.get('payment_method') or sale['payment_method'] or 'كي نت'
            recipient_name = body.get('recipient_name') or sale['recipient_name'] or ''

            target_status = 'مدفوع' if sale.get('receipt_status') == 'تم الاستلام' else 'محجوز / مدفوع'

            cursor.execute('''
                UPDATE sales 
                SET status = %s, payment_status = 'مدفوع كامل', invoice_created = 1,
                    sale_code = %s, paid_date = %s, paid_amount = selling_price, remaining_amount = 0,
                    payment_method = %s, recipient_name = %s
                WHERE id = %s
            ''', (target_status, sale_code, paid_date, pay_method, recipient_name, sid))

            cursor.execute('''
                UPDATE misbahs 
                SET status = 'مباع', sub_status = 'تم البيع', sale_status = 'تم البيع', sale_date = %s
                WHERE id = %s
            ''', (datetime.now().strftime('%Y-%m-%d'), sale['misbah_id']))

            log_timeline_event(conn, sale['misbah_id'], 'دفع وبيع', f'تم تسجيل الدفع وإصدار الفاتورة ({sale_code}) كـ ({target_status})', f'طريقة الدفع: {pay_method} | تاريخ ووقت الدفع: {paid_date}', emp)

            conn.commit()
            cursor.execute("SELECT * FROM sales WHERE id = %s", (sid,))
            updated_sale = row_to_dict(cursor, cursor.fetchone())
            self.send_json_response(updated_sale)

        # 3. تعديل حالة الاستلام
        elif path.endswith('/receipt-status') and '/api/sales/' in path:
            sid = path.split('/')[-2]
            cursor.execute("SELECT * FROM sales WHERE id = %s", (sid,))
            sale = row_to_dict(cursor, cursor.fetchone())
            if not sale:
                self.send_json_response({'error': 'الطلب غير موجود'}, status=404)
                conn.close()
                return

            receipt_status = body.get('receipt_status', 'تم الاستلام')
            receipt_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S') if receipt_status == 'تم الاستلام' else None

            current_status = sale['status']
            if current_status in ('محجوز / مدفوع', 'مدفوع'):
                if receipt_status == 'تم الاستلام':
                    new_status = 'مدفوع'
                else:
                    new_status = 'محجوز / مدفوع'
            else:
                new_status = current_status

            cursor.execute('''
                UPDATE sales 
                SET status = %s, receipt_status = %s, receipt_date = %s
                WHERE id = %s
            ''', (new_status, receipt_status, receipt_date, sid))

            cursor.execute('''
                UPDATE misbahs 
                SET receipt_status = %s, receipt_date = %s
                WHERE id = %s
            ''', (receipt_status, receipt_date, sale['misbah_id']))

            log_timeline_event(conn, sale['misbah_id'], 'حالة الاستلام والتسليم', f'تمت تحديث حالة الاستلام إلى ({receipt_status}) وتحديث حالة الطلب أوتوماتيكياً إلى ({new_status})', f'تاريخ التحديث: {receipt_date or "لم يتم التوصيل"}', emp)

            conn.commit()
            cursor.execute("SELECT * FROM sales WHERE id = %s", (sid,))
            updated_sale = row_to_dict(cursor, cursor.fetchone())
            self.send_json_response(updated_sale)

        # 4. إلغاء الحجز
        elif path.endswith('/cancel-reservation') and '/api/sales/' in path:
            sid = path.split('/')[-2]
            cursor.execute("SELECT * FROM sales WHERE id = %s", (sid,))
            sale = row_to_dict(cursor, cursor.fetchone())
            if not sale:
                self.send_json_response({'error': 'الطلب غير موجود'}, status=404)
                conn.close()
                return

            cancel_date = datetime.now().isoformat()
            cancel_reason = body.get('cancel_reason', 'إلغاء الحجز بطلب من العميل').strip()

            cursor.execute('''
                UPDATE sales 
                SET status = 'مسترجع', payment_status = 'تم استرجاع المبلغ', supplier_due = 0, cancel_date = %s, cancel_reason = %s
                WHERE id = %s
            ''', (cancel_date, cancel_reason, sid))

            cursor.execute('''
                UPDATE misbahs 
                SET status = 'حالي', sub_status = 'متوفر', sale_status = 'غير مباع'
                WHERE id = %s
            ''', (sale['misbah_id'],))

            log_timeline_event(conn, sale['misbah_id'], 'إلغاء حجز', f'تم إلغاء حجز المسباح للعميل ({sale["customer_name"]}) وإعادته للمخزون كمتوفر', f'سبب الإلغاء: {cancel_reason}', emp)

            conn.commit()
            self.send_json_response({'success': True, 'message': 'تم إلغاء الحجز وإعادة المسباح للمخزون كمتوفر مع حفظ السجل'})

        # 5. استرجاع الطلب (المستحق للمورد يكون 0.000)
        elif path.endswith('/return') and '/api/sales/' in path:
            sid = path.split('/')[-2]
            cursor.execute("SELECT * FROM sales WHERE id = %s", (sid,))
            sale = row_to_dict(cursor, cursor.fetchone())
            if not sale:
                self.send_json_response({'error': 'الطلب غير موجود'}, status=404)
                conn.close()
                return

            return_reason = body.get('return_reason', '').strip()
            if not return_reason:
                self.send_json_response({'error': 'سبب الاسترجاع إلزامي *'}, status=400)
                conn.close()
                return

            return_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            return_amount = float(body.get('return_amount', sale['paid_amount']))
            payment_status = 'تم استرجاع المبلغ'

            cursor.execute('''
                UPDATE sales 
                SET status = 'مسترجع', payment_status = %s, supplier_due = 0, return_date = %s, return_reason = %s, return_amount = %s
                WHERE id = %s
            ''', (payment_status, return_date, return_reason, return_amount, sid))

            cursor.execute('''
                UPDATE misbahs 
                SET status = 'مسترجع', sub_status = 'مسترجع', supplier_due = 0, sale_status = 'غير مباع',
                    return_reason = %s, return_date = %s, return_amount = %s
                WHERE id = %s
            ''', (return_reason, return_date[:10], return_amount, sale['misbah_id']))

            log_timeline_event(conn, sale['misbah_id'], 'استرجاع', f'تم استرجاع المسباح من العميل ({sale["customer_name"]}) وتحويل حالته إلى (مسترجع ↩️) والمستحق للمورد (0.000 د.ك)', f'سبب الاسترجاع: {return_reason} | المبلغ المسترجع: {return_amount} د.ك', emp)

            conn.commit()
            self.send_json_response({'success': True, 'message': 'تم استرجاع الطلب وتحويل المسباح إلى مسترجع ↩️ بنجاح'})

        # 6. تعديل بيانات مسباح موجود بالمخزون (عند الاسترجاع المستحق للمورد يكون 0.000)
        elif path.startswith('/api/misbahs/'):
            mid = path.split('/')[-1]

            orig_price = body.get('original_price')
            if orig_price is not None:
                profit, selling_price, supplier_due = calculate_pricing_breakdown(orig_price)
                body['profit'] = profit
                body['selling_price'] = selling_price
                body['supplier_due'] = supplier_due

            status_val = body.get('status')
            if status_val == 'مسترجع':
                return_reason = body.get('return_reason', '').strip()
                if not return_reason:
                    self.send_json_response({'error': 'سبب الاسترجاع إلزامي * عند اختيار حالة مسترجع'}, status=400)
                    conn.close()
                    return
                body['status'] = 'مسترجع'
                body['sub_status'] = 'مسترجع'
                body['sale_status'] = 'غير مباع'
                body['supplier_due'] = 0.0 # المستحق للمورد دام مسترجع يكون 0.000!
                body['return_reason'] = return_reason
                body['return_date'] = datetime.now().strftime('%Y-%m-%d')

                # تحديث كافة طلبات المبيعات المرتبطة بهذا المسباح إلى مسترجع
                cursor.execute('''
                    UPDATE sales 
                    SET status = 'مسترجع', payment_status = 'تم استرجاع المبلغ', supplier_due = 0,
                        return_reason = %s, return_date = %s
                    WHERE misbah_id = %s
                ''', (return_reason, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), mid))

                log_timeline_event(conn, int(mid), 'استرجاع', 'تم تسجيل استرجاع المسباح وتحويل حالته إلى (مسترجع ↩️) والمستحق للمورد (0.000 د.ك)', f'سبب الاسترجاع: {return_reason}', emp)

            fields = ['owner_id', 'owner_name', 'owner_phone', 'status', 'sub_status',
                      'cancel_reason', 'return_reason', 'return_amount', 'return_date',
                      'weight_grams', 'cut', 'material', 'bead_count', 'bead_size', 'original_price',
                      'profit', 'supplier_due', 'selling_price', 'sale_status', 'sale_date', 'receipt_status', 'receipt_date',
                      'owner_payment_status', 'owner_payment_date', 'item_received_status',
                      'item_received_date', 'notes']
            updates = []
            values = []
            for f in fields:
                if f in body:
                    updates.append(f"{f} = %s")
                    values.append(body[f])

            if updates:
                values.append(mid)
                cursor.execute(f"UPDATE misbahs SET {', '.join(updates)} WHERE id = %s", values)
                log_timeline_event(conn, int(mid), 'تعديل بيانات', 'تم تعديل بيانات ومواصفات المسباح', f'القصة: {body.get("cut", "")} | السعر: {body.get("original_price", "")} د.ك', emp)
                conn.commit()

            cursor.execute("SELECT * FROM misbahs WHERE id = %s", (mid,))
            updated = row_to_dict(cursor, cursor.fetchone())
            self.send_json_response(updated)

        # 7. تعديل عميل
        elif path.startswith('/api/customers/'):
            cid = path.split('/')[-1]
            fields = ['name', 'tiktok_username', 'phone', 'country_code', 'country', 'reliability', 'notes']
            updates = []
            values = []
            for f in fields:
                if f in body:
                    updates.append(f"{f} = %s")
                    values.append(body[f])

            if updates:
                values.append(cid)
                cursor.execute(f"UPDATE customers SET {', '.join(updates)} WHERE id = %s", values)
                conn.commit()

            cursor.execute("SELECT * FROM customers WHERE id = %s", (cid,))
            updated = row_to_dict(cursor, cursor.fetchone())
            self.send_json_response(updated)

        # 8. تعديل مستخدم وتحديث الصلاحيات
        elif path.startswith('/api/users/'):
            if not self.check_manager_or_admin_authorization():
                self.send_json_response({'error': 'غير مصرح لك بتعديل المستخدمين.'}, status=403)
                conn.close()
                return

            uid = path.split('/')[-1]
            fields = ['username', 'password', 'full_name', 'role', 'phone', 'is_active']
            updates = []
            values = []
            for f in fields:
                if f in body and body[f] is not None:
                    updates.append(f"{f} = %s")
                    values.append(body[f])

            if 'permissions' in body:
                perms_val = body['permissions']
                perms_str = json.dumps(perms_val, ensure_ascii=False) if isinstance(perms_val, dict) else str(perms_val)
                updates.append("permissions = %s")
                values.append(perms_str)

            if updates:
                values.append(uid)
                cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = %s", values)
                conn.commit()

            cursor.execute("SELECT id, username, full_name, role, phone, permissions, is_active, created_at FROM users WHERE id = %s", (uid,))
            updated = row_to_dict(cursor, cursor.fetchone())
            if updated.get('permissions'):
                try:
                    updated['permissions'] = json.loads(updated['permissions'])
                except:
                    pass
            self.send_json_response(updated)

        else:
            self.send_json_response({'error': 'Not found'}, status=404)

        conn.close()

    # ==================== API DELETE ====================
    def handle_api_delete(self, path, query):
        conn = get_db()
        cursor = conn.cursor()

        if path.startswith('/api/users/'):
            if not self.check_manager_or_admin_authorization():
                self.send_json_response({'error': 'غير مصرح لك بحذف المستخدمين.'}, status=403)
                conn.close()
                return

            uid = path.split('/')[-1]
            if str(uid) == '1':
                self.send_json_response({'error': 'لا يمكن حذف حساب المالك الرئيسي!'}, status=400)
            else:
                cursor.execute("DELETE FROM users WHERE id = %s", (uid,))
                conn.commit()
                self.send_json_response({'success': True, 'message': 'تم حذف المستخدم بنجاح'})

        elif path.startswith('/api/customers/'):
            cid = path.split('/')[-1]
            cursor.execute("DELETE FROM customers WHERE id = %s", (cid,))
            conn.commit()
            self.send_json_response({'success': True, 'message': 'تم حذف العميل بنجاح'})

        elif path.startswith('/api/misbahs/'):
            mid = path.split('/')[-1]
            cursor.execute("DELETE FROM misbah_timeline WHERE misbah_id = %s", (mid,))
            cursor.execute("DELETE FROM sales WHERE misbah_id = %s", (mid,))
            cursor.execute("DELETE FROM misbahs WHERE id = %s", (mid,))
            conn.commit()
            self.send_json_response({'success': True, 'message': 'تم حذف المسباح وسجله بنجاح'})

        # حذف أي طلب من قبل المدير / الإدارة
        elif path.startswith('/api/sales/'):
            sid = path.split('/')[-1]
            cursor.execute("SELECT misbah_id FROM sales WHERE id = %s", (sid,))
            row = cursor.fetchone()
            if row:
                misbah_id = row[0]
                cursor.execute("UPDATE misbahs SET status = 'حالي', sub_status = 'متوفر', sale_status = 'غير مباع', sale_date = NULL WHERE id = %s", (misbah_id,))
                cursor.execute("DELETE FROM sales WHERE id = %s", (sid,))
                log_timeline_event(conn, misbah_id, 'حذف طلب', f'تم حذف عملية البيع / الطلب رقم ({sid}) وإعادة المسباح للمخزون كمتوفر', '', 'الإدارة')
                conn.commit()
                self.send_json_response({'success': True, 'message': 'تم حذف الطلب بنجاح وإعادة المسباح للمخزون كمتوفر'})
            else:
                self.send_json_response({'error': 'الطلب غير موجود'}, status=404)

        else:
            self.send_json_response({'error': 'Not found'}, status=404)

        conn.close()

def run_server(host=HOST, port=PORT):
    init_db()
    with ThreadingTCPServer((host, port), MisbahRequestHandler) as httpd:
        print(f"==================================================")
        print(f"  نظام عبق الكهرب - إدارة المسابيح والمبيعات (v13.0)")
        print(f"  الموقع: http://{host if host != '0.0.0.0' else 'localhost'}:{port}")
        print(f"==================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nتم إيقاف الخادم.")

if __name__ == '__main__':
    port = PORT
    host = HOST
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    if len(sys.argv) > 2:
        host = sys.argv[2]
    run_server(host, port)
