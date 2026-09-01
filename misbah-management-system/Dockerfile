# Dockerfile لنظام عبق الكهرب
FROM python:3.9-slim

WORKDIR /app

# نسخ ملفات المشروع
COPY . /app

# إنشاء مجلد البيانات لضمان استمرارية الـ Database
VOLUME /app/data
ENV DATABASE_PATH=/app/data/misbah_system.db
ENV PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080

CMD ["python3", "server.py", "8080", "0.0.0.0"]
