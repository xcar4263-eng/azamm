#!/usr/bin/env python3
import sys
import os
from database import get_db, init_db

def create_or_update_admin(username, password, full_name="مدير النظام", phone=""):
    init_db()
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    existing = cursor.fetchone()

    if existing:
        cursor.execute('''
            UPDATE users 
            SET password = ?, full_name = ?, role = 'Admin', phone = ?
            WHERE username = ?
        ''', (password, full_name, phone, username))
        print(f"✅ تم تحديث كلمة مرور حساب المدير '{username}' بنجاح.")
    else:
        cursor.execute('''
            INSERT INTO users (username, password, full_name, role, phone)
            VALUES (?, ?, ?, 'Admin', ?)
        ''', (username, password, full_name, phone))
        print(f"✅ تم إنشاء حساب المدير '{username}' بنجاح بصلاحية Admin كاملة.")

    conn.commit()
    conn.close()

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("الاستخدام: python3 create_admin.py <username> <password> [full_name] [phone]")
        print("مثال: python3 create_admin.py admin mySecurePass123 'أبو فهد' '96599001122'")
        sys.exit(1)

    usr = sys.argv[1]
    pwd = sys.argv[2]
    name = sys.argv[3] if len(sys.argv) > 3 else "مدير النظام"
    phone = sys.argv[4] if len(sys.argv) > 4 else ""

    create_or_update_admin(usr, pwd, name, phone)
