# Strevio — aaPanel Deployment Rehberi

aaPanel üzerinde **MySQL**, **Node.js**, **PM2** ve **Nginx** ile deploy etme rehberi.

---

## 1. Sunucu Gereksinimleri

| Bileşen | Minimum |
|---------|---------|
| OS | Ubuntu 20.04+ / CentOS 7+ |
| RAM | 1 GB (2 GB önerilir) |
| CPU | 1 vCPU |
| Disk | 10 GB SSD |
| aaPanel | Son sürüm |

---

## 2. aaPanel Kurulumu

### 2.1 aaPanel Yükle (eğer yoksa)
```bash
# Ubuntu/Debian
wget -O install.sh http://www.aapanel.com/script/install-ubuntu_6.0_en.sh && sudo bash install.sh

# CentOS
yum install -y wget && wget -O install.sh http://www.aapanel.com/script/install_6.0_en.sh && bash install.sh
```

Kurulumdan sonra ekrandaki **panel URL**, **kullanıcı adı** ve **şifre** bilgilerini not et.

### 2.2 aaPanel App Store'dan Yükle
**App Store** → aşağıdakileri yükle:
- **Nginx** (son sürüm)
- **MySQL 5.7+** veya **MySQL 8.0**
- **PM2 Manager** (varsa)

### 2.3 Node.js Yükle
Terminal'e bağlan (aaPanel → Terminal veya SSH):
```bash
# Node.js 18 LTS kur (nvm ile)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
node -v   # v18.x.x çıkmalı
```

---

## 3. MySQL Veritabanı Oluştur

### Seçenek A: aaPanel Panelinden
1. **Databases** → **Add Database**
2. Bilgileri gir:
   - **Database name:** `strevio`
   - **Username:** `strevio`
   - **Password:** (güçlü bir şifre belirle, not et)
   - **Access:** `Local`
3. **Submit** tıkla

### Seçenek B: Terminal'den
```bash
mysql -u root -p

# MySQL shell:
CREATE DATABASE strevio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'strevio'@'localhost' IDENTIFIED BY 'GUCLU_SIFRE_BURAYA';
GRANT ALL PRIVILEGES ON strevio.* TO 'strevio'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 4. Proje Dosyalarını Yükle

### Seçenek A: Git ile (önerilir)
```bash
cd /www/wwwroot
git clone https://github.com/gorkemmk/youtube_chat.git strevio
cd strevio
```

### Seçenek B: aaPanel File Manager ile
1. **Files** → `/www/wwwroot/` dizinine git
2. Zip dosyasını yükle ve çıkart
3. Klasör adını `strevio` yap

---

## 5. Ortam Değişkenlerini Ayarla

```bash
cd /www/wwwroot/strevio
nano .env
```

`.env` dosyası:
```env
PORT=3000
JWT_SECRET=BURAYA_UZUN_RANDOM_STRING_KOY
ADMIN_EMAIL=admin@senindomain.com
ADMIN_PASSWORD=GUCLU_ADMIN_SIFRESI
DB_HOST=localhost
DB_PORT=3306
DB_USER=strevio
DB_PASSWORD=MYSQL_SIFREN_BURAYA
DB_NAME=strevio
NODE_ENV=production
```

> **ÖNEMLİ**: JWT_SECRET için rastgele string üret:
> ```bash
> openssl rand -hex 64
> ```

---

## 6. Bağımlılıkları Yükle ve Test Et

```bash
cd /www/wwwroot/strevio
npm install --production

# Test et
node server.js
```

Şunu görmelisin:
```
🚀 Strevio - YouTube Chat SaaS Platform
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏠 Home       : http://localhost:3000
```

`Ctrl+C` ile durdur.

---

## 7. PM2 ile Çalıştır (Otomatik Başlatma)

### 7.1 PM2 Kur
```bash
npm install -g pm2
```

### 7.2 Ecosystem Dosyası Oluştur
```bash
nano /www/wwwroot/strevio/ecosystem.config.js
```

```js
module.exports = {
  apps: [{
    name: 'strevio',
    script: 'server.js',
    cwd: '/www/wwwroot/strevio',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '512M',
    error_file: '/www/wwwroot/strevio/logs/error.log',
    out_file: '/www/wwwroot/strevio/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000
  }]
};
```

### 7.3 Başlat
```bash
mkdir -p /www/wwwroot/strevio/logs
cd /www/wwwroot/strevio
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 7.4 PM2 Komutları
```bash
pm2 status              # Durumu gör
pm2 logs strevio        # Logları gör
pm2 restart strevio     # Yeniden başlat
pm2 stop strevio        # Durdur
pm2 monit               # Canlı izleme
```

---

## 8. Nginx Reverse Proxy

### 8.1 aaPanel'de Website Oluştur
1. **Website** → **Add site**
2. Domain gir (örn: `strevio.senindomain.com`)
3. **Static** website seç
4. Oluştur

### 8.2 Nginx Ayarını Değiştir
Site ayarları → **Config** → server bloğunu şununla değiştir:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name strevio.senindomain.com;

    # HTTPS aktifken bu satırı aç:
    # return 301 https://$host$request_uri;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeout (Socket.IO için önemli!)
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Statik dosyalar için cache
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        proxy_pass http://127.0.0.1:3000;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    access_log /www/wwwlogs/strevio.log;
    error_log /www/wwwlogs/strevio.error.log;
}
```

### 8.3 Test Et
```bash
nginx -t
systemctl reload nginx
```

---

## 9. SSL Sertifikası (HTTPS)

### aaPanel'den:
1. **Website** → siteniz → **SSL**
2. **Let's Encrypt** seç
3. Domain gir → **Apply**
4. **Force HTTPS** aç

### Veya CLI'dan:
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d strevio.senindomain.com
```

SSL aktif olduktan sonra Nginx config'deki `return 301` satırının başındaki `#` işaretini kaldır.

---

## 10. Firewall Ayarları

aaPanel → **Security** → **Firewall**:

| Port | Amaç |
|------|-------|
| 80 | HTTP |
| 443 | HTTPS |
| 22 | SSH |
| 3306 | MySQL (sadece gerekirse, normalde KAPALI) |

---

## 11. Güncelleme

```bash
cd /www/wwwroot/strevio
git pull origin main
npm install --production
pm2 restart strevio
```

---

## 12. Yedekleme

### MySQL Yedek
```bash
# Manuel yedek
mysqldump -u strevio -p strevio > /backup/strevio_$(date +%Y%m%d).sql

# Otomatik (aaPanel Cron ile her gece 3'te):
0 3 * * * mysqldump -u strevio -pSIFREN strevio > /backup/strevio_$(date +\%Y\%m\%d).sql
```

### Yedeği Geri Yükleme
```bash
mysql -u strevio -p strevio < /backup/strevio_20260219.sql
```

---

## 13. Sorun Giderme

| Problem | Çözüm |
|---------|-------|
| `ECONNREFUSED 3306` | MySQL çalışmıyor: `systemctl start mysql` |
| `ER_ACCESS_DENIED_ERROR` | .env'deki DB_USER/DB_PASSWORD'u kontrol et |
| `EACCES port 3000` | Port meşgul: `lsof -i :3000` veya .env'de PORT değiştir |
| WebSocket bağlanmıyor | Nginx'te `proxy_set_header Upgrade` ve `Connection "upgrade"` olmalı |
| 502 Bad Gateway | PM2 çökmüş: `pm2 restart strevio && pm2 logs` |
| Sayfa yüklenmiyor | `pm2 logs strevio` ile hata mesajını kontrol et |

---

## Hızlı Özet (Tüm Adımlar)

```bash
# 1. Dosyaları yükle
cd /www/wwwroot
git clone https://github.com/gorkemmk/youtube_chat.git strevio

# 2. MySQL veritabanı oluştur (aaPanel → Databases → Add Database)
#    Adı: strevio, Kullanıcı: strevio, Şifre: belirlediğin şifre

# 3. .env ayarla
cd /www/wwwroot/strevio
nano .env
# PORT=3000
# JWT_SECRET=openssl-ile-uretilen-string
# ADMIN_EMAIL=admin@domain.com
# ADMIN_PASSWORD=guclu-sifre
# DB_HOST=localhost
# DB_PORT=3306
# DB_USER=strevio
# DB_PASSWORD=mysql-sifren
# DB_NAME=strevio
# NODE_ENV=production

# 4. Kur ve başlat
npm install --production
npm install -g pm2
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save && pm2 startup

# 5. aaPanel'de Nginx reverse proxy ayarla (yukarıdaki config)
# 6. SSL sertifikası ekle (aaPanel → SSL → Let's Encrypt)
# Bitti! 🎉
```
