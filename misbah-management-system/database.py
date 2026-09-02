import os
import json
import psycopg2
import psycopg2.extras
from datetime import datetime, date, timedelta

DATABASE_URL = os.environ.get('DATABASE_URL', '')

def calculate_pricing_breakdown(original_price):
    try:
        orig = float(original_price)
    except (ValueError, TypeError):
        orig = 0.0
    orig = round(orig, 3)
    selling_price = orig
    if orig <= 100.0:
        profit = 5.0 if orig > 0 else 0.0
    else:
        profit = orig * 0.05
    profit = round(profit, 3)
    supplier_due = round(orig - profit, 3)
    if supplier_due < 0:
        supplier_due = 0.0
    return profit, selling_price, supplier_due

def calculate_profit_and_selling_price(original_price):
    profit, selling_price, _ = calculate_pricing_breakdown(original_price)
    return profit, selling_price

def get_default_permissions(role):
    if role in ('Admin', 'Owner'):
        return {'dashboard':'view','misbahs':'edit','sales':'edit','customers':'edit','owners':'edit','reports':'view','users':'edit','settings':'edit'}
    elif role == 'Manager':
        return {'dashboard':'view','misbahs':'edit','sales':'edit','customers':'edit','owners':'edit','reports':'view','users':'none','settings':'none'}
    elif role == 'Employee':
        return {'dashboard':'view','misbahs':'edit','sales':'edit','customers':'edit','owners':'view','reports':'none','users':'none','settings':'none'}
    else:
        return {'dashboard':'view','misbahs':'view','sales':'view','customers':'view','owners':'view','reports':'view','users':'none','settings':'none'}

def get_db():
    conn = psycopg2.connect(DATABASE_URL, sslmode='require')
    conn.autocommit = False
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Employee',
        phone TEXT,
        permissions TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW()
    )''')

    cursor.execute('''CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        tiktok_username TEXT,
        phone TEXT,
        country_code TEXT DEFAULT '+965',
        country TEXT DEFAULT 'الكويت',
        reliability TEXT DEFAULT 'معتمد',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    )''')

    cursor.execute('''CREATE TABLE IF NOT EXISTS misbahs (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE,
        owner_id INTEGER,
        owner_name TEXT NOT NULL,
        owner_phone TEXT NOT NULL,
        status TEXT DEFAULT 'حالي',
        sub_status TEXT DEFAULT 'متوفر',
        cancel_reason TEXT,
        return_reason TEXT,
        return_amount DOUBLE PRECISION DEFAULT 0,
        return_date DATE,
        weight_grams DOUBLE PRECISION NOT NULL DEFAULT 0,
        cut TEXT NOT NULL DEFAULT 'برميلي',
        material TEXT NOT NULL DEFAULT 'كهرمان',
        bead_count INTEGER NOT NULL DEFAULT 33,
        bead_size TEXT,
        original_price DOUBLE PRECISION NOT NULL DEFAULT 0,
        profit DOUBLE PRECISION NOT NULL DEFAULT 0,
        supplier_due DOUBLE PRECISION NOT NULL DEFAULT 0,
        selling_price DOUBLE PRECISION NOT NULL DEFAULT 0,
        sale_status TEXT DEFAULT 'غير مباع',
        sale_date DATE,
        receipt_status TEXT DEFAULT 'لم يتم الاستلام',
        receipt_date TIMESTAMP,
        owner_payment_status TEXT DEFAULT 'لم يتم الدفع',
        owner_payment_date DATE,
        item_received_status TEXT DEFAULT 'تم الاستلام',
        item_received_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (owner_id) REFERENCES customers(id)
    )''')

    cursor.execute('''CREATE TABLE IF NOT EXISTS misbah_timeline (
        id SERIAL PRIMARY KEY,
        misbah_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        employee_name TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (misbah_id) REFERENCES misbahs(id)
    )''')

    cursor.execute('''CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        sale_code TEXT,
        misbah_id INTEGER NOT NULL,
        customer_id INTEGER NOT NULL,
        customer_name TEXT,
        customer_phone TEXT,
        customer_tiktok TEXT,
        original_price DOUBLE PRECISION NOT NULL,
        profit DOUBLE PRECISION NOT NULL,
        supplier_due DOUBLE PRECISION NOT NULL DEFAULT 0,
        selling_price DOUBLE PRECISION NOT NULL,
        status TEXT DEFAULT 'محجوز / غير مدفوع',
        payment_status TEXT DEFAULT 'غير مدفوع',
        invoice_created INTEGER DEFAULT 0,
        paid_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        remaining_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        sale_date DATE NOT NULL,
        paid_date TIMESTAMP,
        receipt_status TEXT DEFAULT 'لم يتم الاستلام',
        receipt_date TIMESTAMP,
        return_date TIMESTAMP,
        return_reason TEXT,
        return_amount DOUBLE PRECISION DEFAULT 0,
        cancel_date TIMESTAMP,
        cancel_reason TEXT,
        payment_method TEXT DEFAULT 'كي نت',
        recipient_name TEXT,
        delivery_country TEXT DEFAULT 'الكويت',
        notes TEXT,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (misbah_id) REFERENCES misbahs(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
    )''')

    cursor.execute('''CREATE TABLE IF NOT EXISTS owner_payments (
        id SERIAL PRIMARY KEY,
        owner_name TEXT NOT NULL,
        owner_phone TEXT,
        misbah_id INTEGER,
        amount_paid DOUBLE PRECISION NOT NULL,
        payment_date DATE NOT NULL,
        payment_method TEXT DEFAULT 'تحويل بنكي',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (misbah_id) REFERENCES misbahs(id)
    )''')

    cursor.execute('''CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )''')

    conn.commit()
    seed_initial_data(conn)
    conn.close()

def seed_initial_data(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        default_users = [
            ('admin','admin123','المالك (أبو فهد)','Admin','+965 99001122',json.dumps(get_default_permissions('Admin'),ensure_ascii=False),1),
            ('manager','manager123','المدير العام (سعد)','Manager','+965 99112233',json.dumps(get_default_permissions('Manager'),ensure_ascii=False),1),
            ('employee','emp123','موظف المبيعات (محمد)','Employee','+965 99223344',json.dumps(get_default_permissions('Employee'),ensure_ascii=False),1),
            ('viewer','view123','مدقق حسابات (خالد)','View Only','+965 99334455',json.dumps(get_default_permissions('View Only'),ensure_ascii=False),1),
        ]
        for u in default_users:
            cursor.execute("INSERT INTO users (username,password,full_name,role,phone,permissions,is_active) VALUES (%s,%s,%s,%s,%s,%s,%s)", u)

    default_logo = 'https://k.top4top.io/p_38967jw2l0.png?utm_source=chatgpt.com'
    settings_data = {
        'store_name':'عبق الكهرب','system_logo':default_logo,'invoice_logo':default_logo,
        'currency':'د.ك','phone':'+965 99887766','tiktok_account':'@abaq_alkahrab',
        'primary_color':'#f59e0b','secondary_color':'#18181b',
        'invoice_footer':'شكراً لتعاملكم مع عبق الكهرب. المسابيح المباعة أصلية ومفحوصة مخبرياً.'
    }
    for k, v in settings_data.items():
        cursor.execute("INSERT INTO settings (key,value) VALUES (%s,%s) ON CONFLICT (key) DO NOTHING", (k,v))

    conn.commit()

def log_timeline_event(conn, misbah_id, event_type, title, description='', employee_name=''):
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO misbah_timeline (misbah_id,event_type,title,description,employee_name) VALUES (%s,%s,%s,%s,%s)",
            (misbah_id, event_type, title, description, employee_name)
        )
        conn.commit()
    except Exception as e:
        print("Timeline logging error:", e)

if __name__ == '__main__':
    init_db()
    print("Database initialized with PostgreSQL (Supabase) successfully.")
