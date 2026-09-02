-- ==========================================================
-- ملف قاعدة البيانات SQL لنظام "عبق الكهرب"
-- متوافق مع MySQL / PostgreSQL / MariaDB / SQLite
-- ==========================================================

-- 1. جدول المستخدمين والصلاحيات
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Employee',
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. جدول العملاء
CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    tiktok_username VARCHAR(100),
    phone VARCHAR(50),
    country VARCHAR(100) DEFAULT 'الكويت',
    reliability VARCHAR(50) DEFAULT 'معتمد',
    payment_method VARCHAR(100) DEFAULT 'كي نت',
    payment_status VARCHAR(50) DEFAULT 'غير مدفوع',
    payment_received VARCHAR(50) DEFAULT 'لم يتم',
    misbah_received VARCHAR(50) DEFAULT 'غير مستلم',
    owner_name VARCHAR(255),
    owner_phone VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. جدول المسابيح والمخزون
CREATE TABLE IF NOT EXISTS misbahs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(100) UNIQUE,
    status VARCHAR(50) DEFAULT 'حالي',
    owner_name VARCHAR(255) NOT NULL,
    owner_phone VARCHAR(50),
    weight_grams DECIMAL(10, 2) DEFAULT 0,
    cut VARCHAR(100) DEFAULT 'برميلي',
    material VARCHAR(100),
    bead_count INT DEFAULT 33,
    bead_size VARCHAR(50),
    original_price DECIMAL(10, 3) NOT NULL DEFAULT 0,
    profit DECIMAL(10, 3) NOT NULL DEFAULT 0,
    selling_price DECIMAL(10, 3) NOT NULL DEFAULT 0,
    sale_status VARCHAR(50) DEFAULT 'غير مباع',
    sale_date DATE,
    owner_payment_status VARCHAR(50) DEFAULT 'لم يتم الدفع',
    owner_payment_date DATE,
    item_received_status VARCHAR(50) DEFAULT 'تم الاستلام',
    item_received_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. جدول عمليات البيع
CREATE TABLE IF NOT EXISTS sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_code VARCHAR(100) UNIQUE,
    misbah_id INT NOT NULL,
    customer_id INT,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),
    customer_tiktok VARCHAR(100),
    original_price DECIMAL(10, 3) NOT NULL,
    profit DECIMAL(10, 3) NOT NULL,
    selling_price DECIMAL(10, 3) NOT NULL,
    payment_status VARCHAR(50) DEFAULT 'مدفوع كامل',
    paid_amount DECIMAL(10, 3) NOT NULL DEFAULT 0,
    remaining_amount DECIMAL(10, 3) NOT NULL DEFAULT 0,
    sale_date DATE NOT NULL,
    payment_method VARCHAR(100) DEFAULT 'كي نت',
    notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. جدول سجل دفعات أصحاب المسابيح
CREATE TABLE IF NOT EXISTS owner_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_name VARCHAR(255) NOT NULL,
    owner_phone VARCHAR(50),
    misbah_id INT,
    amount_paid DECIMAL(10, 3) NOT NULL,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(100) DEFAULT 'تحويل بنكي',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. جدول إعدادات النظام
CREATE TABLE IF NOT EXISTS settings (
    key_name VARCHAR(100) PRIMARY KEY,
    value_text TEXT
);

-- البيانات الأولية للمستخدمين
INSERT INTO users (username, password, full_name, role, phone) VALUES
('admin', 'admin123', 'مدير النظام (أبو فهد)', 'Admin', '96599001122'),
('manager', 'manager123', 'مشرف المبيعات (سعد)', 'Manager', '96599112233'),
('employee', 'emp123', 'موظف الاستقبال (محمد)', 'Employee', '96599223344'),
('viewer', 'view123', 'مدقق حسابات (خالد)', 'View Only', '96599334455');

-- الإعدادات الافتراضية
INSERT INTO settings (key_name, value_text) VALUES
('store_name', 'عبق الكهرب'),
('currency', 'د.ك'),
('phone', '+965 99887766'),
('tiktok_account', '@abaq_alkahrab'),
('profit_rule_under_100', '5'),
('profit_rule_over_100_percent', '5'),
('invoice_footer', 'شكراً لتعاملكم مع عبق الكهرب. المسابيح المباعة أصلية ومفحوصة.');
