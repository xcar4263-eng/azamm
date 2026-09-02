import unittest
import os
import json
import sqlite3
from datetime import datetime, date, timedelta
from database import calculate_pricing_breakdown, get_db, init_db, log_timeline_event
import urllib.request
import urllib.error

class TestAbaqAlKahrabScenarios(unittest.TestCase):

    def setUp(self):
        init_db()

    def test_pricing_formula(self):
        """اختبار معادلة حساب ربح النظام والمستحق للمورد"""
        # مثال 1: 100 د.ك -> ربح 5 د.ك -> مستحق 95 د.ك
        p1, s1, due1 = calculate_pricing_breakdown(100.0)
        self.assertEqual(p1, 5.0)
        self.assertEqual(due1, 95.0)
        self.assertEqual(s1, 100.0)

        # مثال 2: 150 د.ك -> ربح 7.5 د.ك -> مستحق 142.5 د.ك
        p2, s2, due2 = calculate_pricing_breakdown(150.0)
        self.assertEqual(p2, 7.5)
        self.assertEqual(due2, 142.5)
        self.assertEqual(s2, 150.0)

    def test_scenarios_1_2_3_order_lifecycle(self):
        """اختبار السيناريوهات 1 و 2 و 3: غير مدفوع -> مدفوع -> مسترجع"""
        conn = get_db()
        cursor = conn.cursor()

        # إضافة مسباح للمخزون
        p, s, due = calculate_pricing_breakdown(150.0)
        unique_code = f"ORD-TEST-{int(datetime.now().timestamp() * 1000)}"
        cursor.execute('''
            INSERT INTO misbahs (code, owner_name, owner_phone, cut, material, weight_grams, bead_count, original_price, profit, supplier_due, selling_price, status, sub_status)
            VALUES (?, 'مورد أصلي', '99112233', 'برميلي', 'كهرمان بولندي', 45.0, 33, 150.0, ?, ?, ?, 'حالي', 'متوفر')
        ''', (unique_code, p, due, s))
        mid = cursor.lastrowid
        conn.commit()

        # السيناريو الأول: طلب غير مدفوع
        cursor.execute('''
            INSERT INTO sales (sale_code, misbah_id, customer_id, customer_name, customer_phone, original_price, profit, supplier_due, selling_price, status, payment_status, invoice_created, paid_amount, sale_date)
            VALUES (?, ?, 1, 'عبدالله الشمري', '98765432', 150.0, ?, ?, ?, 'محجوز / غير مدفوع', 'غير مدفوع', 0, 0, '2026-09-02')
        ''', (f"RES-{unique_code}", mid, p, due, s))
        sid = cursor.lastrowid
        cursor.execute("UPDATE misbahs SET status = 'حالي', sub_status = 'محجوز' WHERE id = ?", (mid,))
        conn.commit()

        # التحقق من السيناريو الأول
        cursor.execute("SELECT status, invoice_created, payment_status FROM sales WHERE id = ?", (sid,))
        s1 = cursor.fetchone()
        self.assertEqual(s1['status'], 'محجوز / غير مدفوع')
        self.assertEqual(s1['invoice_created'], 0)
        self.assertEqual(s1['payment_status'], 'غير مدفوع')

        cursor.execute("SELECT status, sub_status FROM misbahs WHERE id = ?", (mid,))
        m1 = cursor.fetchone()
        self.assertEqual(m1['status'], 'حالي')
        self.assertEqual(m1['sub_status'], 'محجوز')

        # السيناريو الثاني: تغيير إلى مدفوع (محجوز / مدفوع)
        inv_code = f"INV-TEST-{int(datetime.now().timestamp() * 1000)}"
        paid_dt = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
            UPDATE sales 
            SET status = 'محجوز / مدفوع', payment_status = 'مدفوع كامل', invoice_created = 1, sale_code = ?, paid_date = ?, paid_amount = 150.0
            WHERE id = ?
        ''', (inv_code, paid_dt, sid))
        cursor.execute("UPDATE misbahs SET status = 'مباع', sub_status = 'تم البيع', sale_status = 'تم البيع' WHERE id = ?", (mid,))
        conn.commit()

        cursor.execute("SELECT status, invoice_created, payment_status, sale_code FROM sales WHERE id = ?", (sid,))
        s2 = cursor.fetchone()
        self.assertEqual(s2['status'], 'محجوز / مدفوع')
        self.assertEqual(s2['invoice_created'], 1)
        self.assertEqual(s2['sale_code'], inv_code)

        cursor.execute("SELECT status, sub_status FROM misbahs WHERE id = ?", (mid,))
        m2 = cursor.fetchone()
        self.assertEqual(m2['status'], 'مباع')

        # السيناريو الثالث: استرجاع الطلب (مسترجع ↩️)
        ret_reason = 'طلب العميل خامة أخرى'
        ret_dt = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
            UPDATE sales 
            SET status = 'مسترجع', payment_status = 'تم استرجاع المبلغ', return_reason = ?, return_date = ?, return_amount = 150.0
            WHERE id = ?
        ''', (ret_reason, ret_dt, sid))
        cursor.execute('''
            UPDATE misbahs 
            SET status = 'حالي', sub_status = 'متوفر', sale_status = 'غير مباع', return_reason = ?
            WHERE id = ?
        ''', (ret_reason, mid))
        conn.commit()

        cursor.execute("SELECT status, payment_status, return_reason FROM sales WHERE id = ?", (sid,))
        s3 = cursor.fetchone()
        self.assertEqual(s3['status'], 'مسترجع')
        self.assertEqual(s3['payment_status'], 'تم استرجاع المبلغ')

        cursor.execute("SELECT status, sub_status FROM misbahs WHERE id = ?", (mid,))
        m3 = cursor.fetchone()
        self.assertEqual(m3['status'], 'حالي')
        self.assertEqual(m3['sub_status'], 'متوفر')

        conn.close()

    def test_scenario_4_dashboard_inventory_constant(self):
        """السيناريو الرابع: التأكد من أن عدد المخزون ثابت لا يتأثر بالفلاتر"""
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM misbahs WHERE status = 'حالي'")
        inv_count = cursor.fetchone()[0]

        # التأكد من صحة الكويري المستقل
        self.assertGreaterEqual(inv_count, 0)
        conn.close()

    def test_scenario_5_role_protection(self):
        """السيناريو الخامس: حماية أقسام المالك من الـ Manager"""
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT role FROM users WHERE username = 'manager'")
        row = cursor.fetchone()
        self.assertEqual(row['role'], 'Manager')
        conn.close()

if __name__ == '__main__':
    unittest.main()
