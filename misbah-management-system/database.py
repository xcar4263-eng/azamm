import sqlite3
import os
import json
from datetime import datetime

# دعم مسار قاعدة البيانات عبر Environment Variable
DB_PATH = os.environ.get('DATABASE_PATH', os.path.join(os.path.dirname(__file__), 'misbah_system.db'))

def calculate_profit_and_selling_price(original_price):
    """
    حساب الربح وسعر البيع تلقائياً:
    - أقل من 100 د.ك -> الربح 5 د.ك
    - 100 د.ك أو أكثر -> الربح 5% من السعر الأصلي
    """
    try:
        orig = float(original_price)
    except (ValueError, TypeError):
        orig = 0.0

    if orig < 100.0:
        profit = 5.0
    else:
        profit = orig * 0.05

    # تقريب الأرقام لثلاث خانات عشرية (فلس كويتي)
    profit = round(profit, 3)
    selling_price = round(orig + profit, 3)
    return profit, selling_price

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    # تفعيل وضع WAL لتمكين استخدام أكثر من موظف في نفس الوقت بدون أخطاء قفل
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # 1. جدول المستخدمين والصلاحيات
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Employee', -- Admin, Manager, Employee, View Only
        phone TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 2. جدول العملاء
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        tiktok_username TEXT,
        phone TEXT,
        country TEXT DEFAULT 'الكويت',
        reliability TEXT DEFAULT 'معتمد', -- معتمد / محظور
        payment_method TEXT DEFAULT 'كي نت', -- كاش / كي نت / تحويل / رابط / أخرى
        payment_status TEXT DEFAULT 'غير مدفوع', -- مدفوع كامل / مدفوع جزئي / غير مدفوع
        payment_received TEXT DEFAULT 'لم يتم', -- تم / لم يتم
        misbah_received TEXT DEFAULT 'غير مستلم', -- مستلم / غير مستلم
        owner_name TEXT,
        owner_phone TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 3. جدول المسابيح / المخزون
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS misbahs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        status TEXT DEFAULT 'حالي', -- حالي / مباع / منتهي
        owner_name TEXT NOT NULL,
        owner_phone TEXT,
        weight_grams REAL DEFAULT 0,
        cut TEXT, -- القصة: برميلي، اسطواني، كروي، ذروي، تفاحي، زيتوني، إلخ
        material TEXT, -- الخامة: كهرمان، بكلايت، فاتوران، سندلوس، مستكة، إلخ
        bead_count INTEGER DEFAULT 33, -- عدد الخرز
        bead_size TEXT, -- مقاس الخرز مثل 12*14 ملم
        original_price REAL NOT NULL DEFAULT 0,
        profit REAL NOT NULL DEFAULT 0,
        selling_price REAL NOT NULL DEFAULT 0,
        sale_status TEXT DEFAULT 'غير مباع', -- تم البيع / غير مباع
        sale_date DATE,
        owner_payment_status TEXT DEFAULT 'لم يتم الدفع', -- تم الدفع / لم يتم الدفع
        owner_payment_date DATE,
        item_received_status TEXT DEFAULT 'تم الاستلام', -- تم الاستلام / لم يتم الاستلام
        item_received_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 4. جدول عمليات البيع
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_code TEXT UNIQUE,
        misbah_id INTEGER NOT NULL,
        customer_id INTEGER,
        customer_name TEXT,
        customer_phone TEXT,
        customer_tiktok TEXT,
        original_price REAL NOT NULL,
        profit REAL NOT NULL,
        selling_price REAL NOT NULL,
        payment_status TEXT DEFAULT 'مدفوع كامل', -- مدفوع كامل / مدفوع جزئي / غير مدفوع
        paid_amount REAL NOT NULL DEFAULT 0,
        remaining_amount REAL NOT NULL DEFAULT 0,
        sale_date DATE NOT NULL,
        payment_method TEXT DEFAULT 'كي نت', -- كاش / كي نت / تحويل / غير ذلك / أخرى
        notes TEXT,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (misbah_id) REFERENCES misbahs(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
    ''')

    # 5. جدول سجل دفعات أصحاب المسابيح
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS owner_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_name TEXT NOT NULL,
        owner_phone TEXT,
        misbah_id INTEGER,
        amount_paid REAL NOT NULL,
        payment_date DATE NOT NULL,
        payment_method TEXT DEFAULT 'تحويل بنكي',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (misbah_id) REFERENCES misbahs(id)
    )
    ''')

    # 6. جدول إعدادات النظام
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    ''')

    conn.commit()
    seed_initial_data(conn)
    conn.close()

def seed_initial_data(conn):
    cursor = conn.cursor()

    # المستخدمين الافتراضيين
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        default_users = [
            ('admin', 'admin123', 'مدير النظام (أبو فهد)', 'Admin', '96599001122'),
            ('manager', 'manager123', 'مشرف المبيعات (سعد)', 'Manager', '96599112233'),
            ('employee', 'emp123', 'موظف الاستقبال (محمد)', 'Employee', '96599223344'),
            ('viewer', 'view123', 'مدقق حسابات (خالد)', 'View Only', '96599334455')
        ]
        cursor.executemany(
            "INSERT INTO users (username, password, full_name, role, phone) VALUES (?, ?, ?, ?, ?)",
            default_users
        )

    # الإعدادات الافتراضية بنظام "عبق الكهرب"
    settings_data = {
        'store_name': 'عبق الكهرب',
        'currency': 'د.ك',
        'phone': '+965 99887766',
        'tiktok_account': '@abaq_alkahrab',
        'profit_rule_under_100': '5',
        'profit_rule_over_100_percent': '5',
        'invoice_footer': 'شكراً لتعاملكم مع عبق الكهرب. المسابيح المباعة أصلية ومفحوصة.'
    }
    for k, v in settings_data.items():
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, v))

    # عينات من العملاء
    cursor.execute("SELECT COUNT(*) FROM customers")
    if cursor.fetchone()[0] == 0:
        sample_customers = [
            ('عبدالله الشمري', '@abdullah_sh', '96598765432', 'الكويت', 'معتمد', 'كي نت', 'مدفوع كامل', 'تم', 'مستلم', 'أبو خالد الحصين', '96566778899', 'عميل مميز ومشتري دائم بالمزاد'),
            ('فيصل المطيري', '@faisal_m99', '96597711223', 'الكويت', 'معتمد', 'تحويل', 'مدفوع جزئي', 'تم', 'غير مستلم', 'بدر الصالح', '96555443322', 'متبقي عليه 20 د.ك يستلم غداً'),
            ('سلطان الدوسري', '@sultan_d', '966501234567', 'السعودية', 'معتمد', 'رابط دفع', 'مدفوع كامل', 'تم', 'مستلم', 'أبو فهد العازمي', '96599001122', 'شحن دي اتش ال للرياض'),
            ('جاسم الكندري', '@jassem_q8', '96594455667', 'الكويت', 'معتمد', 'كاش', 'غير مدفوع', 'لم يتم', 'غير مستلم', 'أحمد العلي', '96566112233', 'حجز مسباح كهرمان بولندي'),
            ('فهد العتيبي (محظور)', '@fahad_vip_fake', '96591122334', 'الكويت', 'محظور', 'كي نت', 'غير مدفوع', 'لم يتم', 'غير مستلم', 'أبو خالد الحصين', '96566778899', 'قام بإلغاء حجز المزاد مرتين متتاليتين')
        ]
        cursor.executemany('''
            INSERT INTO customers (name, tiktok_username, phone, country, reliability, payment_method, 
                                   payment_status, payment_received, misbah_received, owner_name, owner_phone, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', sample_customers)

    # عينات من المسابيح
    cursor.execute("SELECT COUNT(*) FROM misbahs")
    if cursor.fetchone()[0] == 0:
        sample_misbahs = [
            ('MSB-101', 'حالي', 'أبو خالد الحصين', '96566778899', 48.5, 'برميلي', 'كهرمان بولندي قديم', 33, '12*15 ملم', 80.0, 'غير مباع', None, 'لم يتم الدفع', None, 'تم الاستلام', '2026-08-15', 'خراطة راقية لون ليموني نخب أول'),
            ('MSB-102', 'حالي', 'بدر الصالح', '96555443322', 52.0, 'ذروي', 'فاتوران ألماني صب قديم', 45, '10*13 ملم', 150.0, 'غير مباع', None, 'لم يتم الدفع', None, 'تم الاستلام', '2026-08-20', 'رائحة فواحة مميزة وخراطة مشدودة'),
            ('MSB-103', 'مباع', 'أحمد العلي', '96566112233', 60.0, 'اسطواني', 'بكلايت بلجيكي مائل للكرزي', 33, '13*14 ملم', 50.0, 'تم البيع', '2026-08-28', 'تم الدفع', '2026-08-29', 'تم الاستلام', '2026-08-10', 'مباع للعميل عبدالله الشمري'),
            ('MSB-104', 'مباع', 'أبو فهد العازمي', '96599001122', 75.2, 'كروي', 'كهرمان دومينيكاني شفاف أزرق', 33, '14 ملم', 200.0, 'تم البيع', '2026-08-30', 'لم يتم الدفع', None, 'تم الاستلام', '2026-08-18', 'مباع للعميل سلطان الدوسري والمبلغ مستحق للمالك'),
            ('MSB-105', 'حالي', 'أحمد العلي', '96566112233', 38.0, 'تفاحي', 'سندلوس تركي قديم معرق', 33, '11*12 ملم', 95.0, 'غير مباع', None, 'لم يتم الدفع', None, 'تم الاستلام', '2026-08-25', 'شكة فضة عيار 925 متقنة'),
            ('MSB-106', 'حالي', 'بدر الصالح', '96555443322', 68.4, 'زيتوني', 'مستكة ألماني قديمة صب ملكي', 51, '9*12 ملم', 120.0, 'غير مباع', None, 'لم يتم الدفع', None, 'تم الاستلام', '2026-08-27', 'مسباح ناعم ومميز في اليد'),
            ('MSB-107', 'منتهي', 'طارق الشطي', '96599332211', 42.0, 'بيضاوي', 'عاج طبيعي قديم', 33, '11*13 ملم', 110.0, 'غير مباع', None, 'لم يتم الدفع', None, 'تم الاستلام', '2026-08-01', 'تم استرجاعه لصاحبه بناء على طلبه')
        ]

        for item in sample_misbahs:
            code, status, o_name, o_phone, weight, cut, mat, b_count, b_size, orig_price, s_status, s_date, o_pay_status, o_pay_date, rec_status, rec_date, notes = item
            profit, selling_price = calculate_profit_and_selling_price(orig_price)
            cursor.execute('''
                INSERT INTO misbahs (code, status, owner_name, owner_phone, weight_grams, cut, material,
                                     bead_count, bead_size, original_price, profit, selling_price,
                                     sale_status, sale_date, owner_payment_status, owner_payment_date,
                                     item_received_status, item_received_date, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (code, status, o_name, o_phone, weight, cut, mat, b_count, b_size, orig_price, profit, selling_price,
                  s_status, s_date, o_pay_status, o_pay_date, rec_status, rec_date, notes))

    # عينات من عمليات البيع
    cursor.execute("SELECT COUNT(*) FROM sales")
    if cursor.fetchone()[0] == 0:
        sample_sales = [
            ('INV-2026-001', 3, 1, 'عبدالله الشمري', '96598765432', '@abdullah_sh', 50.0, 5.0, 55.0, 'مدفوع كامل', 55.0, 0.0, '2026-08-28', 'كي نت', 'تم الاستلام بالمعرض', 'مدير النظام (أبو فهد)'),
            ('INV-2026-002', 4, 3, 'سلطان الدوسري', '966501234567', '@sultan_d', 200.0, 10.0, 210.0, 'مدفوع كامل', 210.0, 0.0, '2026-08-30', 'تحويل', 'شحن للرياض دي اتش ال', 'مشرف المبيعات (سعد)')
        ]
        cursor.executemany('''
            INSERT INTO sales (sale_code, misbah_id, customer_id, customer_name, customer_phone, customer_tiktok,
                               original_price, profit, selling_price, payment_status, paid_amount, remaining_amount,
                               sale_date, payment_method, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', sample_sales)

    # دفعات أصحاب المسابيح
    cursor.execute("SELECT COUNT(*) FROM owner_payments")
    if cursor.fetchone()[0] == 0:
        sample_owner_payments = [
            ('أحمد العلي', '96566112233', 3, 50.0, '2026-08-29', 'تحويل بنكي', 'سداد مستحق مسباح رقم MSB-103')
        ]
        cursor.executemany('''
            INSERT INTO owner_payments (owner_name, owner_phone, misbah_id, amount_paid, payment_date, payment_method, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', sample_owner_payments)

    conn.commit()

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully at:", DB_PATH)
