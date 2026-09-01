import unittest
import sqlite3
import os
import json
from database import get_db, init_db, calculate_profit_and_selling_price

class TestMisbahSystem(unittest.TestCase):
    def setUp(self):
        init_db()
        self.conn = get_db()

    def tearDown(self):
        self.conn.close()

    def test_profit_calculation_rule(self):
        # قاعدة حساب الربح:
        # أقل من 100 د.ك -> 5 د.ك
        profit_50, sell_50 = calculate_profit_and_selling_price(50)
        self.assertEqual(profit_50, 5.0)
        self.assertEqual(sell_50, 55.0)

        profit_80, sell_80 = calculate_profit_and_selling_price(80)
        self.assertEqual(profit_80, 5.0)
        self.assertEqual(sell_80, 85.0)

        profit_99, sell_99 = calculate_profit_and_selling_price(99.5)
        self.assertEqual(profit_99, 5.0)
        self.assertEqual(sell_99, 104.5)

        # 100 د.ك أو أكثر -> 5%
        profit_100, sell_100 = calculate_profit_and_selling_price(100)
        self.assertEqual(profit_100, 5.0)
        self.assertEqual(sell_100, 105.0)

        profit_150, sell_150 = calculate_profit_and_selling_price(150)
        self.assertEqual(profit_150, 7.5)
        self.assertEqual(sell_150, 157.5)

        profit_200, sell_200 = calculate_profit_and_selling_price(200)
        self.assertEqual(profit_200, 10.0)
        self.assertEqual(sell_200, 210.0)

    def test_database_tables_exist(self):
        cursor = self.conn.cursor()
        tables = ['users', 'customers', 'misbahs', 'sales', 'owner_payments', 'settings']
        for table in tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            self.assertGreaterEqual(count, 0, f"Table {table} should exist")

    def test_misbah_sale_flow(self):
        cursor = self.conn.cursor()
        # إضافة مسباح جديد
        orig_price = 120.0
        profit, sell_price = calculate_profit_and_selling_price(orig_price) # 6 KD profit, 126 KD sell
        
        cursor.execute('''
            INSERT INTO misbahs (code, status, owner_name, owner_phone, weight_grams, cut, original_price, profit, selling_price, sale_status)
            VALUES ('TEST-999', 'حالي', 'مالك تجريبي', '96590000000', 50.0, 'برميلي', ?, ?, ?, 'غير مباع')
        ''', (orig_price, profit, sell_price))
        self.conn.commit()
        misbah_id = cursor.lastrowid

        # التحقق من إضافته
        cursor.execute("SELECT status, selling_price FROM misbahs WHERE id = ?", (misbah_id,))
        row = cursor.fetchone()
        self.assertEqual(row['status'], 'حالي')
        self.assertEqual(row['selling_price'], 126.0)

        # بيع المسباح
        paid_amount = 126.0
        remaining = 0.0
        cursor.execute('''
            INSERT INTO sales (sale_code, misbah_id, customer_name, original_price, profit, selling_price, payment_status, paid_amount, remaining_amount, sale_date)
            VALUES ('INV-TEST-999', ?, 'عميل تجريبي', ?, ?, ?, 'مدفوع كامل', ?, ?, '2026-09-01')
        ''', (misbah_id, orig_price, profit, sell_price, paid_amount, remaining))
        
        # تحديث المسباح لمباع
        cursor.execute("UPDATE misbahs SET status = 'مباع', sale_status = 'تم البيع', sale_date = '2026-09-01' WHERE id = ?", (misbah_id,))
        self.conn.commit()

        # التحقق من حالة المسباح
        cursor.execute("SELECT status, sale_status FROM misbahs WHERE id = ?", (misbah_id,))
        row_after = cursor.fetchone()
        self.assertEqual(row_after['status'], 'مباع')
        self.assertEqual(row_after['sale_status'], 'تم البيع')

    def test_owner_dues_calculation(self):
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT 
                SUM(CASE WHEN status = 'مباع' THEN original_price ELSE 0 END) as total_due,
                SUM(CASE WHEN status = 'مباع' AND owner_payment_status = 'تم الدفع' THEN original_price ELSE 0 END) as total_paid,
                SUM(CASE WHEN status = 'مباع' AND owner_payment_status != 'تم الدفع' THEN original_price ELSE 0 END) as total_pending
            FROM misbahs
        ''')
        row = cursor.fetchone()
        self.assertIsNotNone(row['total_due'])
        self.assertIsNotNone(row['total_paid'])
        self.assertIsNotNone(row['total_pending'])
        # التحقق من صحة المعادلة: المستحق الكلي = المدفوع + المتبقي
        self.assertAlmostEqual(row['total_due'], row['total_paid'] + row['total_pending'], places=2)

if __name__ == '__main__':
    unittest.main()
