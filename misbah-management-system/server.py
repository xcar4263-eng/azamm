import http.server
import socketserver
import json
import urllib.parse
import os
import sys
from datetime import datetime, date
import sqlite3
from database import get_db, init_db, calculate_profit_and_selling_price

# المتغيرات البيئية لاستضافة السيرفر والتشغيل المتعدد
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
    """خادم يدعم اتصالات متعددة متزامنة لمختلف الأجهزة في نفس الوقت"""
    allow_reuse_address = True
    daemon_threads = True

class MisbahRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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

        # 1. إحصائيات لوحة التحكم
        if path == '/api/stats':
            # إجمالي المسابيح
            cursor.execute("SELECT COUNT(*) FROM misbahs")
            total_misbahs = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM misbahs WHERE status = 'حالي'")
            current_misbahs = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM misbahs WHERE status = 'مباع'")
            sold_misbahs = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM misbahs WHERE status = 'منتهي'")
            ended_misbahs = cursor.fetchone()[0]

            # إجمالي المبيعات والأرباح
            cursor.execute("SELECT COALESCE(SUM(selling_price), 0), COALESCE(SUM(profit), 0), COALESCE(SUM(paid_amount), 0), COALESCE(SUM(remaining_amount), 0) FROM sales")
            sales_row = cursor.fetchone()
            total_sales = sales_row[0]
            total_profit = sales_row[1]
            total_sales_paid = sales_row[2]
            total_sales_remaining = sales_row[3]

            # مبالغ أصحاب المسابيح
            cursor.execute("SELECT COALESCE(SUM(original_price), 0) FROM misbahs WHERE status = 'مباع' AND owner_payment_status = 'تم الدفع'")
            paid_to_owners = cursor.fetchone()[0]

            cursor.execute("SELECT COALESCE(SUM(original_price), 0) FROM misbahs WHERE status = 'مباع' AND owner_payment_status != 'تم الدفع'")
            due_to_owners = cursor.fetchone()[0]

            # مبيعات اليوم
            today_str = datetime.now().strftime('%Y-%m-%d')
            cursor.execute("SELECT COUNT(*), COALESCE(SUM(selling_price), 0), COALESCE(SUM(profit), 0) FROM sales WHERE sale_date = ?", (today_str,))
            today_row = cursor.fetchone()
            sales_today_count = today_row[0]
            sales_today_amount = today_row[1]
            profit_today = today_row[2]

            # مبيعات الشهر الحالي
            month_prefix = datetime.now().strftime('%Y-%m')
            cursor.execute("SELECT COUNT(*), COALESCE(SUM(selling_price), 0), COALESCE(SUM(profit), 0) FROM sales WHERE sale_date LIKE ?", (f"{month_prefix}%",))
            month_row = cursor.fetchone()
            sales_month_count = month_row[0]
            sales_month_amount = month_row[1]
            profit_month = month_row[2]

            # إجمالي العملاء
            cursor.execute("SELECT COUNT(*) FROM customers")
            total_customers = cursor.fetchone()[0]

            # آخر 5 عمليات بيع
            cursor.execute('''
                SELECT s.*, m.code as misbah_code, m.cut, m.material 
                FROM sales s 
                LEFT JOIN misbahs m ON s.misbah_id = m.id 
                ORDER BY s.id DESC LIMIT 5
            ''')
            recent_sales = rows_to_list(cursor, cursor.fetchall())

            # إحصائيات القصات (Cuts breakdown)
            cursor.execute("SELECT cut, COUNT(*) as count FROM misbahs WHERE cut IS NOT NULL AND cut != '' GROUP BY cut ORDER BY count DESC LIMIT 6")
            cuts_stats = rows_to_list(cursor, cursor.fetchall())

            # إحصائيات طرق الدفع
            cursor.execute("SELECT payment_method, COUNT(*) as count, SUM(selling_price) as total FROM sales GROUP BY payment_method")
            payment_methods_stats = rows_to_list(cursor, cursor.fetchall())

            self.send_json_response({
                'total_misbahs': total_misbahs,
                'current_misbahs': current_misbahs,
                'sold_misbahs': sold_misbahs,
                'ended_misbahs': ended_misbahs,
                'total_sales': round(total_sales, 3),
                'total_profit': round(total_profit, 3),
                'total_sales_paid': round(total_sales_paid, 3),
                'total_sales_remaining': round(total_sales_remaining, 3),
                'paid_to_owners': round(paid_to_owners, 3),
                'due_to_owners': round(due_to_owners, 3),
                'sales_today_count': sales_today_count,
                'sales_today_amount': round(sales_today_amount, 3),
                'profit_today': round(profit_today, 3),
                'sales_month_count': sales_month_count,
                'sales_month_amount': round(sales_month_amount, 3),
                'profit_month': round(profit_month, 3),
                'total_customers': total_customers,
                'recent_sales': recent_sales,
                'cuts_stats': cuts_stats,
                'payment_methods_stats': payment_methods_stats
            })

        # 2. العملاء
        elif path == '/api/customers':
            search = query.get('search', [''])[0].strip()
            reliability = query.get('reliability', [''])[0].strip()
            payment_status = query.get('payment_status', [''])[0].strip()

            sql = "SELECT * FROM customers WHERE 1=1"
            params = []
            if search:
                sql += " AND (name LIKE ? OR tiktok_username LIKE ? OR phone LIKE ? OR owner_name LIKE ? OR country LIKE ?)"
                wild = f"%{search}%"
                params.extend([wild, wild, wild, wild, wild])
            if reliability:
                sql += " AND reliability = ?"
                params.append(reliability)
            if payment_status:
                sql += " AND payment_status = ?"
                params.append(payment_status)

            sql += " ORDER BY id DESC"
            cursor.execute(sql, params)
            customers = rows_to_list(cursor, cursor.fetchall())
            self.send_json_response(customers)

        elif path.startswith('/api/customers/'):
            cid = path.split('/')[-1]
            cursor.execute("SELECT * FROM customers WHERE id = ?", (cid,))
            customer = row_to_dict(cursor, cursor.fetchone())
            if customer:
                cursor.execute('''
                    SELECT s.*, m.code as misbah_code, m.cut, m.material 
                    FROM sales s
                    LEFT JOIN misbahs m ON s.misbah_id = m.id
                    WHERE s.customer_id = ? OR s.customer_phone = ?
                    ORDER BY s.id DESC
                ''', (customer['id'], customer['phone']))
                customer['sales_history'] = rows_to_list(cursor, cursor.fetchall())
                self.send_json_response(customer)
            else:
                self.send_json_response({'error': 'العميل غير موجود'}, status=404)

        # 3. المسابيح / المخزون
        elif path == '/api/misbahs':
            status = query.get('status', [''])[0].strip()
            search = query.get('search', [''])[0].strip()
            cut = query.get('cut', [''])[0].strip()
            sale_status = query.get('sale_status', [''])[0].strip()
            owner_payment_status = query.get('owner_payment_status', [''])[0].strip()

            sql = "SELECT * FROM misbahs WHERE 1=1"
            params = []
            if status:
                sql += " AND status = ?"
                params.append(status)
            if cut:
                sql += " AND cut = ?"
                params.append(cut)
            if sale_status:
                sql += " AND sale_status = ?"
                params.append(sale_status)
            if owner_payment_status:
                sql += " AND owner_payment_status = ?"
                params.append(owner_payment_status)
            if search:
                sql += " AND (code LIKE ? OR owner_name LIKE ? OR owner_phone LIKE ? OR cut LIKE ? OR material LIKE ? OR notes LIKE ?)"
                wild = f"%{search}%"
                params.extend([wild, wild, wild, wild, wild, wild])

            sql += " ORDER BY id DESC"
            cursor.execute(sql, params)
            misbahs = rows_to_list(cursor, cursor.fetchall())
            self.send_json_response(misbahs)

        elif path.startswith('/api/misbahs/'):
            mid = path.split('/')[-1]
            cursor.execute("SELECT * FROM misbahs WHERE id = ?", (mid,))
            misbah = row_to_dict(cursor, cursor.fetchone())
            if misbah:
                cursor.execute("SELECT * FROM sales WHERE misbah_id = ? ORDER BY id DESC LIMIT 1", (mid,))
                misbah['sale_info'] = row_to_dict(cursor, cursor.fetchone())
                self.send_json_response(misbah)
            else:
                self.send_json_response({'error': 'المسباح غير موجود'}, status=404)

        # 4. المبيعات
        elif path == '/api/sales':
            search = query.get('search', [''])[0].strip()
            date_from = query.get('from', [''])[0].strip()
            date_to = query.get('to', [''])[0].strip()
            payment_status = query.get('payment_status', [''])[0].strip()

            sql = '''
                SELECT s.*, m.code as misbah_code, m.cut, m.material, m.weight_grams, m.owner_name as misbah_owner_name, m.owner_phone as misbah_owner_phone
                FROM sales s
                LEFT JOIN misbahs m ON s.misbah_id = m.id
                WHERE 1=1
            '''
            params = []
            if search:
                sql += " AND (s.sale_code LIKE ? OR s.customer_name LIKE ? OR s.customer_phone LIKE ? OR s.customer_tiktok LIKE ? OR m.code LIKE ?)"
                wild = f"%{search}%"
                params.extend([wild, wild, wild, wild, wild])
            if date_from:
                sql += " AND s.sale_date >= ?"
                params.append(date_from)
            if date_to:
                sql += " AND s.sale_date <= ?"
                params.append(date_to)
            if payment_status:
                sql += " AND s.payment_status = ?"
                params.append(payment_status)

            sql += " ORDER BY s.id DESC"
            cursor.execute(sql, params)
            sales = rows_to_list(cursor, cursor.fetchall())
            self.send_json_response(sales)

        elif path.startswith('/api/sales/'):
            sid = path.split('/')[-1]
            cursor.execute('''
                SELECT s.*, m.code as misbah_code, m.cut, m.material, m.weight_grams, m.bead_count, m.bead_size, m.owner_name, m.owner_phone
                FROM sales s
                LEFT JOIN misbahs m ON s.misbah_id = m.id
                WHERE s.id = ?
            ''', (sid,))
            sale = row_to_dict(cursor, cursor.fetchone())
            if sale:
                self.send_json_response(sale)
            else:
                self.send_json_response({'error': 'عملية البيع غير موجودة'}, status=404)

        # 5. مستحقات أصحاب المسابيح
        elif path == '/api/owners':
            cursor.execute('''
                SELECT 
                    owner_name, 
                    owner_phone,
                    COUNT(id) as total_pieces,
                    SUM(CASE WHEN status = 'حالي' THEN 1 ELSE 0 END) as active_pieces,
                    SUM(CASE WHEN status = 'مباع' THEN 1 ELSE 0 END) as sold_pieces,
                    SUM(CASE WHEN status = 'منتهي' THEN 1 ELSE 0 END) as ended_pieces,
                    SUM(original_price) as total_value,
                    SUM(CASE WHEN status = 'مباع' THEN original_price ELSE 0 END) as sold_due_total,
                    SUM(CASE WHEN status = 'مباع' AND owner_payment_status = 'تم الدفع' THEN original_price ELSE 0 END) as total_paid,
                    SUM(CASE WHEN status = 'مباع' AND owner_payment_status != 'تم الدفع' THEN original_price ELSE 0 END) as total_pending
                FROM misbahs
                GROUP BY owner_name, owner_phone
                ORDER BY total_pending DESC, total_pieces DESC
            ''')
            owners_summary = rows_to_list(cursor, cursor.fetchall())

            cursor.execute("SELECT * FROM misbahs ORDER BY id DESC")
            all_misbahs = rows_to_list(cursor, cursor.fetchall())

            cursor.execute("SELECT * FROM owner_payments ORDER BY id DESC")
            payments = rows_to_list(cursor, cursor.fetchall())

            self.send_json_response({
                'owners': owners_summary,
                'misbahs': all_misbahs,
                'payments': payments
            })

        # 6. المستخدمين والصلاحيات
        elif path == '/api/users':
            cursor.execute("SELECT id, username, full_name, role, phone, created_at FROM users ORDER BY id ASC")
            users = rows_to_list(cursor, cursor.fetchall())
            self.send_json_response(users)

        # 7. الإعدادات
        elif path == '/api/settings':
            cursor.execute("SELECT key, value FROM settings")
            settings = {row['key']: row['value'] for row in cursor.fetchall()}
            self.send_json_response(settings)

        # 8. تصدير قاعدة البيانات Backup
        elif path == '/api/backup':
            tables = ['users', 'customers', 'misbahs', 'sales', 'owner_payments', 'settings']
            backup_data = {}
            for table in tables:
                cursor.execute(f"SELECT * FROM {table}")
                backup_data[table] = rows_to_list(cursor, cursor.fetchall())
            self.send_json_response({
                'exported_at': datetime.now().isoformat(),
                'system_name': 'عبق الكهرب',
                'version': '2.0',
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

        # تسجيل الدخول
        if path == '/api/auth/login':
            username = body.get('username', '').strip()
            password = body.get('password', '').strip()

            cursor.execute("SELECT id, username, full_name, role, phone FROM users WHERE username = ? AND password = ?", (username, password))
            user = row_to_dict(cursor, cursor.fetchone())
            if user:
                self.send_json_response({
                    'success': True,
                    'user': user,
                    'token': f"session-{user['id']}-{user['role']}"
                })
            else:
                self.send_json_response({'success': False, 'error': 'اسم المستخدم أو كلمة المرور غير صحيحة'}, status=401)

        # إضافة عميل جديد
        elif path == '/api/customers':
            name = body.get('name', '').strip()
            if not name:
                self.send_json_response({'error': 'اسم العميل مطلوب'}, status=400)
                conn.close()
                return

            cursor.execute('''
                INSERT INTO customers (name, tiktok_username, phone, country, reliability, 
                                       payment_method, payment_status, payment_received, 
                                       misbah_received, owner_name, owner_phone, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                name,
                body.get('tiktok_username', ''),
                body.get('phone', ''),
                body.get('country', 'الكويت'),
                body.get('reliability', 'معتمد'),
                body.get('payment_method', 'كي نت'),
                body.get('payment_status', 'غير مدفوع'),
                body.get('payment_received', 'لم يتم'),
                body.get('misbah_received', 'غير مستلم'),
                body.get('owner_name', ''),
                body.get('owner_phone', ''),
                body.get('notes', '')
            ))
            conn.commit()
            new_id = cursor.lastrowid
            cursor.execute("SELECT * FROM customers WHERE id = ?", (new_id,))
            created = row_to_dict(cursor, cursor.fetchone())
            self.send_json_response(created, status=201)

        # إضافة مسباح جديد للمخزون
        elif path == '/api/misbahs':
            owner_name = body.get('owner_name', '').strip()
            if not owner_name:
                self.send_json_response({'error': 'اسم صاحب المسباح مطلوب'}, status=400)
                conn.close()
                return

            code = body.get('code', '').strip()
            if not code:
                cursor.execute("SELECT MAX(id) FROM misbahs")
                max_id = cursor.fetchone()[0] or 0
                code = f"MSB-{100 + max_id + 1}"

            original_price = float(body.get('original_price', 0))
            profit, selling_price = calculate_profit_and_selling_price(original_price)

            status = body.get('status', 'حالي')
            sale_status = body.get('sale_status', 'غير مباع')
            if status == 'مباع':
                sale_status = 'تم البيع'

            item_rec_status = body.get('item_received_status', 'تم الاستلام')
            item_rec_date = body.get('item_received_date') or (datetime.now().strftime('%Y-%m-%d') if item_rec_status == 'تم الاستلام' else None)

            cursor.execute('''
                INSERT INTO misbahs (code, status, owner_name, owner_phone, weight_grams, 
                                     cut, material, bead_count, bead_size, original_price, 
                                     profit, selling_price, sale_status, sale_date, 
                                     owner_payment_status, owner_payment_date, item_received_status, 
                                     item_received_date, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                code,
                status,
                owner_name,
                body.get('owner_phone', ''),
                float(body.get('weight_grams', 0)),
                body.get('cut', 'برميلي'),
                body.get('material', ''),
                int(body.get('bead_count', 33) or 33),
                body.get('bead_size', ''),
                original_price,
                profit,
                selling_price,
                sale_status,
                body.get('sale_date', None),
                body.get('owner_payment_status', 'لم يتم الدفع'),
                body.get('owner_payment_date', None),
                item_rec_status,
                item_rec_date,
                body.get('notes', '')
            ))
            conn.commit()
            new_id = cursor.lastrowid
            cursor.execute("SELECT * FROM misbahs WHERE id = ?", (new_id,))
            created = row_to_dict(cursor, cursor.fetchone())
            self.send_json_response(created, status=201)

        # إضافة عملية بيع جديدة
        elif path == '/api/sales':
            misbah_id = body.get('misbah_id')
            if not misbah_id:
                self.send_json_response({'error': 'رقم المسباح مطلوب'}, status=400)
                conn.close()
                return

            cursor.execute("SELECT * FROM misbahs WHERE id = ?", (misbah_id,))
            misbah = row_to_dict(cursor, cursor.fetchone())
            if not misbah:
                self.send_json_response({'error': 'المسباح غير موجود'}, status=404)
                conn.close()
                return

            if misbah['status'] == 'مباع':
                self.send_json_response({'error': 'هذا المسباح مباع بالفعل مسبقاً!'}, status=400)
                conn.close()
                return

            customer_id = body.get('customer_id')
            customer_name = body.get('customer_name', '').strip()
            customer_phone = body.get('customer_phone', '').strip()
            customer_tiktok = body.get('customer_tiktok', '').strip()

            if not customer_id and customer_name:
                cursor.execute("SELECT id FROM customers WHERE name = ? OR (phone != '' AND phone = ?)", (customer_name, customer_phone))
                exist_c = cursor.fetchone()
                if exist_c:
                    customer_id = exist_c[0]
                else:
                    cursor.execute('''
                        INSERT INTO customers (name, phone, tiktok_username, reliability, notes)
                        VALUES (?, ?, ?, 'معتمد', 'تمت إضافته تلقائياً عبر عملية البيع')
                    ''', (customer_name, customer_phone, customer_tiktok))
                    customer_id = cursor.lastrowid

            original_price = float(misbah['original_price'])
            profit = float(misbah['profit'])
            selling_price = float(misbah['selling_price'])

            paid_amount = float(body.get('paid_amount', selling_price))
            remaining_amount = round(selling_price - paid_amount, 3)
            if remaining_amount < 0:
                remaining_amount = 0.0

            if paid_amount >= selling_price:
                payment_status = 'مدفوع كامل'
            elif paid_amount > 0:
                payment_status = 'مدفوع جزئي'
            else:
                payment_status = 'غير مدفوع'

            sale_date = body.get('sale_date') or datetime.now().strftime('%Y-%m-%d')
            payment_method = body.get('payment_method', 'كي نت')
            notes = body.get('notes', '')
            created_by = body.get('created_by', 'موظف النظام')

            cursor.execute("SELECT MAX(id) FROM sales")
            max_sale_id = cursor.fetchone()[0] or 0
            sale_code = f"INV-{datetime.now().year}-{1000 + max_sale_id + 1}"

            cursor.execute('''
                INSERT INTO sales (sale_code, misbah_id, customer_id, customer_name, 
                                   customer_phone, customer_tiktok, original_price, 
                                   profit, selling_price, payment_status, paid_amount, 
                                   remaining_amount, sale_date, payment_method, notes, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                sale_code, misbah_id, customer_id, customer_name, customer_phone, customer_tiktok,
                original_price, profit, selling_price, payment_status, paid_amount, remaining_amount,
                sale_date, payment_method, notes, created_by
            ))
            new_sale_id = cursor.lastrowid

            cursor.execute('''
                UPDATE misbahs 
                SET status = 'مباع', sale_status = 'تم البيع', sale_date = ?
                WHERE id = ?
            ''', (sale_date, misbah_id))

            if customer_id:
                cursor.execute('''
                    UPDATE customers 
                    SET payment_status = ?, payment_received = 'تم', misbah_received = 'مستلم'
                    WHERE id = ?
                ''', (payment_status, customer_id))

            conn.commit()

            cursor.execute('''
                SELECT s.*, m.code as misbah_code, m.cut, m.material, m.weight_grams, m.bead_count, m.bead_size, m.owner_name, m.owner_phone
                FROM sales s
                LEFT JOIN misbahs m ON s.misbah_id = m.id
                WHERE s.id = ?
            ''', (new_sale_id,))
            created_sale = row_to_dict(cursor, cursor.fetchone())
            self.send_json_response(created_sale, status=201)

        # تسجيل دفعة لصاحب مسباح
        elif path == '/api/owners/pay':
            owner_name = body.get('owner_name')
            misbah_id = body.get('misbah_id')
            amount = float(body.get('amount', 0))
            pay_date = body.get('payment_date') or datetime.now().strftime('%Y-%m-%d')
            pay_method = body.get('payment_method', 'تحويل بنكي')
            notes = body.get('notes', '')

            if misbah_id:
                cursor.execute('''
                    UPDATE misbahs 
                    SET owner_payment_status = 'تم الدفع', owner_payment_date = ?
                    WHERE id = ?
                ''', (pay_date, misbah_id))

                cursor.execute("SELECT owner_name, owner_phone, original_price FROM misbahs WHERE id = ?", (misbah_id,))
                m_row = cursor.fetchone()
                if m_row:
                    owner_name = m_row[0]
                    if amount <= 0:
                        amount = m_row[2]

            cursor.execute('''
                INSERT INTO owner_payments (owner_name, owner_phone, misbah_id, amount_paid, payment_date, payment_method, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (owner_name, body.get('owner_phone', ''), misbah_id, amount, pay_date, pay_method, notes))

            conn.commit()
            self.send_json_response({'success': True, 'message': 'تم تسجيل الدفعة بنجاح'})

        # إضافة مستخدم جديد
        elif path == '/api/users':
            username = body.get('username', '').strip()
            password = body.get('password', '').strip()
            full_name = body.get('full_name', '').strip()
            role = body.get('role', 'Employee')
            phone = body.get('phone', '')

            if not username or not password or not full_name:
                self.send_json_response({'error': 'جميع الحقول الأساسية مطلوبة'}, status=400)
                conn.close()
                return

            try:
                cursor.execute('''
                    INSERT INTO users (username, password, full_name, role, phone)
                    VALUES (?, ?, ?, ?, ?)
                ''', (username, password, full_name, role, phone))
                conn.commit()
                new_uid = cursor.lastrowid
                cursor.execute("SELECT id, username, full_name, role, phone, created_at FROM users WHERE id = ?", (new_uid,))
                created_user = row_to_dict(cursor, cursor.fetchone())
                self.send_json_response(created_user, status=201)
            except sqlite3.IntegrityError:
                self.send_json_response({'error': 'اسم المستخدم مسجل مسبقاً'}, status=400)

        # حفظ الإعدادات
        elif path == '/api/settings':
            for k, v in body.items():
                cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, str(v)))
            conn.commit()
            self.send_json_response({'success': True, 'message': 'تم حفظ الإعدادات بنجاح'})

        # استعادة نسخة احتياطية Restore
        elif path == '/api/restore':
            backup_data = body.get('data', {})
            if not backup_data:
                self.send_json_response({'error': 'بيانات النسخة الاحتياطية غير صالحة'}, status=400)
                conn.close()
                return

            for table, rows in backup_data.items():
                if table in ['users', 'customers', 'misbahs', 'sales', 'owner_payments', 'settings']:
                    cursor.execute(f"DELETE FROM {table}")
                    if rows:
                        columns = list(rows[0].keys())
                        placeholders = ', '.join(['?'] * len(columns))
                        col_names = ', '.join(columns)
                        query = f"INSERT INTO {table} ({col_names}) VALUES ({placeholders})"
                        for r in rows:
                            values = [r[c] for c in columns]
                            cursor.execute(query, values)
            conn.commit()
            self.send_json_response({'success': True, 'message': 'تمت استعادة البيانات بنجاح'})

        else:
            self.send_json_response({'error': 'Not found'}, status=404)

        conn.close()

    # ==================== API PUT ====================
    def handle_api_put(self, path, query):
        conn = get_db()
        cursor = conn.cursor()
        body = self.read_json_body()

        if path.startswith('/api/customers/'):
            cid = path.split('/')[-1]
            fields = ['name', 'tiktok_username', 'phone', 'country', 'reliability',
                      'payment_method', 'payment_status', 'payment_received',
                      'misbah_received', 'owner_name', 'owner_phone', 'notes']
            updates = []
            values = []
            for f in fields:
                if f in body:
                    updates.append(f"{f} = ?")
                    values.append(body[f])

            if updates:
                values.append(cid)
                cursor.execute(f"UPDATE customers SET {', '.join(updates)} WHERE id = ?", values)
                conn.commit()

            cursor.execute("SELECT * FROM customers WHERE id = ?", (cid,))
            updated = row_to_dict(cursor, cursor.fetchone())
            self.send_json_response(updated)

        elif path.startswith('/api/misbahs/'):
            mid = path.split('/')[-1]

            orig_price = body.get('original_price')
            if orig_price is not None:
                profit, selling_price = calculate_profit_and_selling_price(orig_price)
                body['profit'] = profit
                body['selling_price'] = selling_price

            if body.get('status') == 'مباع' and not body.get('sale_status'):
                body['sale_status'] = 'تم البيع'
            elif body.get('status') == 'حالي' and not body.get('sale_status'):
                body['sale_status'] = 'غير مباع'

            fields = ['code', 'status', 'owner_name', 'owner_phone', 'weight_grams',
                      'cut', 'material', 'bead_count', 'bead_size', 'original_price',
                      'profit', 'selling_price', 'sale_status', 'sale_date',
                      'owner_payment_status', 'owner_payment_date', 'item_received_status',
                      'item_received_date', 'notes']
            updates = []
            values = []
            for f in fields:
                if f in body:
                    updates.append(f"{f} = ?")
                    values.append(body[f])

            if updates:
                values.append(mid)
                cursor.execute(f"UPDATE misbahs SET {', '.join(updates)} WHERE id = ?", values)
                conn.commit()

            cursor.execute("SELECT * FROM misbahs WHERE id = ?", (mid,))
            updated = row_to_dict(cursor, cursor.fetchone())
            self.send_json_response(updated)

        elif path.startswith('/api/sales/'):
            sid = path.split('/')[-1]
            cursor.execute("SELECT * FROM sales WHERE id = ?", (sid,))
            curr_sale = row_to_dict(cursor, cursor.fetchone())
            if not curr_sale:
                self.send_json_response({'error': 'عملية البيع غير موجودة'}, status=404)
                conn.close()
                return

            selling_price = float(curr_sale['selling_price'])
            paid_amount = float(body.get('paid_amount', curr_sale['paid_amount']))
            remaining_amount = round(selling_price - paid_amount, 3)
            if remaining_amount < 0:
                remaining_amount = 0.0

            if paid_amount >= selling_price:
                payment_status = 'مدفوع كامل'
            elif paid_amount > 0:
                payment_status = 'مدفوع جزئي'
            else:
                payment_status = 'غير مدفوع'

            body['payment_status'] = payment_status
            body['paid_amount'] = paid_amount
            body['remaining_amount'] = remaining_amount

            fields = ['customer_name', 'customer_phone', 'customer_tiktok',
                      'payment_status', 'paid_amount', 'remaining_amount',
                      'sale_date', 'payment_method', 'notes']
            updates = []
            values = []
            for f in fields:
                if f in body:
                    updates.append(f"{f} = ?")
                    values.append(body[f])

            if updates:
                values.append(sid)
                cursor.execute(f"UPDATE sales SET {', '.join(updates)} WHERE id = ?", values)
                conn.commit()

            cursor.execute('''
                SELECT s.*, m.code as misbah_code, m.cut, m.material 
                FROM sales s
                LEFT JOIN misbahs m ON s.misbah_id = m.id
                WHERE s.id = ?
            ''', (sid,))
            updated = row_to_dict(cursor, cursor.fetchone())
            self.send_json_response(updated)

        elif path.startswith('/api/users/'):
            uid = path.split('/')[-1]
            fields = ['username', 'password', 'full_name', 'role', 'phone']
            updates = []
            values = []
            for f in fields:
                if f in body and body[f]:
                    updates.append(f"{f} = ?")
                    values.append(body[f])

            if updates:
                values.append(uid)
                cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", values)
                conn.commit()

            cursor.execute("SELECT id, username, full_name, role, phone, created_at FROM users WHERE id = ?", (uid,))
            updated = row_to_dict(cursor, cursor.fetchone())
            self.send_json_response(updated)

        else:
            self.send_json_response({'error': 'Not found'}, status=404)

        conn.close()

    # ==================== API DELETE ====================
    def handle_api_delete(self, path, query):
        conn = get_db()
        cursor = conn.cursor()

        if path.startswith('/api/customers/'):
            cid = path.split('/')[-1]
            cursor.execute("DELETE FROM customers WHERE id = ?", (cid,))
            conn.commit()
            self.send_json_response({'success': True, 'message': 'تم حذف العميل بنجاح'})

        elif path.startswith('/api/misbahs/'):
            mid = path.split('/')[-1]
            cursor.execute("SELECT COUNT(*) FROM sales WHERE misbah_id = ?", (mid,))
            if cursor.fetchone()[0] > 0:
                self.send_json_response({'error': 'لا يمكن حذف المسباح لأنه مرتبط بعمليات بيع مسجلة! يمكنك تعديل حالته إلى منتهي بدلاً من الحذف.'}, status=400)
            else:
                cursor.execute("DELETE FROM misbahs WHERE id = ?", (mid,))
                conn.commit()
                self.send_json_response({'success': True, 'message': 'تم حذف المسباح بنجاح'})

        elif path.startswith('/api/sales/'):
            sid = path.split('/')[-1]
            cursor.execute("SELECT misbah_id FROM sales WHERE id = ?", (sid,))
            row = cursor.fetchone()
            if row:
                misbah_id = row[0]
                cursor.execute("UPDATE misbahs SET status = 'حالي', sale_status = 'غير مباع', sale_date = NULL WHERE id = ?", (misbah_id,))
                cursor.execute("DELETE FROM sales WHERE id = ?", (sid,))
                conn.commit()
                self.send_json_response({'success': True, 'message': 'تم إلغاء وحذف عملية البيع وإعادة المسباح إلى المخزون كمتوفر'})
            else:
                self.send_json_response({'error': 'عملية البيع غير موجودة'}, status=404)

        elif path.startswith('/api/users/'):
            uid = path.split('/')[-1]
            if str(uid) == '1':
                self.send_json_response({'error': 'لا يمكن حذف حساب مدير النظام الرئيسي!'}, status=400)
            else:
                cursor.execute("DELETE FROM users WHERE id = ?", (uid,))
                conn.commit()
                self.send_json_response({'success': True, 'message': 'تم حذف المستخدم بنجاح'})

        else:
            self.send_json_response({'error': 'Not found'}, status=404)

        conn.close()

def run_server(host=HOST, port=PORT):
    init_db()
    with ThreadingTCPServer((host, port), MisbahRequestHandler) as httpd:
        print(f"==================================================")
        print(f"  نظام عبق الكهرب - إدارة المسابيح والمبيعات")
        print(f"  الموقع: http://{host if host != '0.0.0.0' else 'localhost'}:{port}")
        print(f"  جاهز لاستقبال اتصالات المتصفح من كافة الأجهزة")
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
