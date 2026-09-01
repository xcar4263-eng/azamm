# دليل النشر والتشغيل على السيرفر | نظام "عبق الكهرب"

نظام **عبق الكهرب** مبني ليكون **Production-Ready Web Application** يعمل على سيرفر مركزي بقاعدة بيانات حقيقية متعددة المستخدمين (Multi-User)، تدعم دخول عدة موظفين في نفس الوقت من مختلف الأجهزة (كمبيوتر، لابتوب، تابلت، وهاتف محمول) مع مزامنة فورية للبيانات.

---

## 1. ما هو نوع Backend المستخدم؟
- **لغة البرمجة**: Python 3 (الإصدار 3.8 أو أحدث).
- **الخادم**: `ThreadingTCPServer` مدمج مع `RESTful JSON API Engine` لمعالجة الطلبات المتزامنة من عدة أجهزة دون تأخير.
- **الواجهة**: Single Page Application متجاوبة بالكامل (HTML5, Tailwind CSS, JavaScript Vanilla, Lucide Icons, Chart.js, SheetJS).

---

## 2. ما هي قاعدة البيانات المستخدمة؟
- **قاعدة البيانات**: Server-Side **SQLite 3** مع تفعيل وضع **WAL (Write-Ahead Logging)** و `busy_timeout = 5000ms`.
- **مزايا هذا الإعداد**:
  - يتيح قراءة وكتابة متزامنة بدون أخطاء قفل (Locking).
  - آمنة 100% ويتم حفظ كافة التعديلات والمبيعات فورياً على القرص الصلب للسيرفر.
  - لا تتطلب تثبيت خادم قواعد بيانات معقد أو إعداد منافذ إضافية.
  - سهلة النسخ الاحتياطي والنقل.

---

## 3. طريقة إنشاء وتهيئة Database
يتم إنشاء قاعدة البيانات وجداولها وإعداداتها والبيانات الافتراضية تلقائياً بمجرد تشغيل السيرفر لأول مرة، أو يمكن تهيئتها يدوياً عبر الأمر:
```bash
python3 database.py
```
سيتولد ملف قاعدة البيانات `misbah_system.db` تلقائياً في مجلد المشروع.

---

## 4. جميع المتغيرات البيئية (Environment Variables) المطلوبة

| المتغير | القيمة الافتراضية | الوصف |
| :--- | :--- | :--- |
| `PORT` | `8080` | المنفذ الذي يستمع إليه السيرفر |
| `HOST` | `0.0.0.0` | عنوان الاستماع (0.0.0.0 لاستقبال الاتصال من جميع الأجهزة والشبكة الخارجية) |
| `DATABASE_PATH` | `./misbah_system.db` | المسار المخصص لملف قاعدة البيانات (اختياري) |

---

## 5. طريقة تشغيل المشروع محلياً (Local)

1. فتح الطرفية في مجلد المشروع:
   ```bash
   cd /Users/fawzidames/.gemini/antigravity/scratch/misbah-management-system
   ```

2. تشغيل السيرفر:
   ```bash
   python3 server.py
   ```
   أو باستخدام السكربت:
   ```bash
   ./start.sh
   ```

3. فتح الرابط في المتصفح:
   👉 **http://localhost:8080**

---

## 6. طريقة رفع المشروع على السيرفر والاستضافة (Deployment)

### الخيار أ: خادم افتراضي خاص (VPS - Ubuntu/Debian/CentOS) - الطريقة الموصى بها

1. **رفع ملفات المشروع للسيرفر** (عبر `git` أو `scp` أو `rsync`):
   ```bash
   scp -r /Users/fawzidames/.gemini/antigravity/scratch/misbah-management-system root@YOUR_SERVER_IP:/var/www/abaq-alkahrab
   ```

2. **تشغيل النظام كخدمة خلفية دائمة (Systemd Service)**:
   أنشئ ملف الخدمة على السيرفر:
   ```bash
   sudo nano /etc/systemd/system/abaq.service
   ```
   أضف المحتوى التالي:
   ```ini
   [Unit]
   Description=Abaq Al-Kahrab Misbah System
   After=network.target

   [Service]
   Type=simple
   User=root
   WorkingDirectory=/var/www/abaq-alkahrab
   ExecStart=/usr/bin/python3 /var/www/abaq-alkahrab/server.py 8080 0.0.0.0
   Restart=always
   RestartSec=3

   [Install]
   WantedBy=multi-user.target
   ```
   ثم فعل الخدمة وشغلها:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable abaq
   sudo systemctl start abaq
   ```

3. **إعداد Nginx كخادم عكسي (Reverse Proxy) وربط الدومين**:
   ```nginx
   server {
       server_name yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:8080;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

4. **تثبيت شهادة الأمان SSL (HTTPS المجانية)**:
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```

---

### الخيار ب: النشر بواسطة Docker و Docker Compose

إذا كان سيرفرك يدعم Docker:
```bash
cd /var/www/abaq-alkahrab
docker compose up -d --build
```
سيعمل النظام مباشرة وستكون قاعدة البيانات محفوظة بشكل دائم في مجلد `abaq_data`.

---

### الخيار ج: الاستضافات السحابية (Render, Railway, DigitalOcean App Platform)
- قم برفع المجلد إلى مستودع GitHub خاص بك.
- في لوحة تحكم Render/Railway:
  - **Build Command**: اتركه فارغاً.
  - **Start Command**: `python3 server.py $PORT 0.0.0.0`
  - اربط Persistent Disk لمسار قاعدة البيانات إذا أردت استمراريتها عند إعادة البناء.

---

## 7. طريقة ربط قاعدة البيانات بالسيرفر
قاعدة البيانات مربوطة تلقائياً بالسيرفر في ملف `database.py`.
- عند تشغيل السيرفر، يتصل الكود تلقائياً بمسار `DATABASE_PATH` المحدد.
- كافة عمليات الإضافة والحذف والتعديل تتم مباشرة على السيرفر، وتظهر لجميع الموظفين بمجرد تحديث الصفحة أو الضغط على زر المزامنة 🔄.

---

## 8. طريقة إنشاء أو تغيير أول Admin Account
يمكنك إنشاء أو إعادة تعيين كلمة مرور أي حساب مدير من سطر الأوامر باستخدام السكربت المخصص:
```bash
python3 create_admin.py <username> <password> [full_name] [phone]
```
**مثال:**
```bash
python3 create_admin.py admin mySecretPass2026 "أبو فهد" "96599001122"
```

---

## 9. التبعيات المطلوبة (Dependencies)
- **Zero External Dependencies!**
- النظام مبني بالكامل على مكتبات Python القياسية (`sqlite3`, `http.server`, `socketserver`, `json`, `urllib`, `datetime`).
- لا يحتاج لتنفيذ أي `pip install` على السيرفر، مما يضمن تشغيله فوراً على أي توزيعة Linux أو Windows أو macOS بدون أخطاء توافقية أو تضارب حزم.

---

## 10. إعدادات الاستضافة وجدار الحماية (Firewall)
- تأكد من فتح المنافذ التالية على السيرفر:
  - `80` (HTTP)
  - `443` (HTTPS)
  - أو المنفذ المباشر `8080` إن كنت لا تستخدم Nginx Proxy.
- في Ubuntu (UFW):
  ```bash
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw allow 8080/tcp
  sudo ufw reload
  ```
