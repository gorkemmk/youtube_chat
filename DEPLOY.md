# Strevio — Production Deployment Guide (aaPanel)

Complete guide to deploying Strevio on a Linux server using **aaPanel**, **PostgreSQL**, **Node.js**, **PM2**, and **Nginx**.

---

## 1. Server Requirements

| Component | Minimum |
|-----------|---------|
| OS | Ubuntu 20.04+ / CentOS 7+ |
| RAM | 1 GB (2 GB recommended) |
| CPU | 1 vCPU |
| Disk | 10 GB SSD |
| aaPanel | Latest version |

---

## 2. aaPanel Initial Setup

### 2.1 Install aaPanel
```bash
# Ubuntu/Debian
wget -O install.sh http://www.aapanel.com/script/install-ubuntu_6.0_en.sh && sudo bash install.sh

# CentOS
yum install -y wget && wget -O install.sh http://www.aapanel.com/script/install_6.0_en.sh && bash install.sh
```

After installation, note the panel URL, username, and password from the output.

### 2.2 Install Required Software via aaPanel
Go to **App Store** and install:
- **Nginx** (latest)
- **PostgreSQL 15+**
- **Node.js version manager** (install Node.js 18 LTS or 20 LTS)
- **PM2 Manager** (if available, or install via CLI)

---

## 3. PostgreSQL Setup

### 3.1 Create Database & User

```bash
# Switch to postgres user
sudo -u postgres psql

# In psql shell:
CREATE USER strevio WITH PASSWORD 'YOUR_STRONG_PASSWORD_HERE';
CREATE DATABASE strevio OWNER strevio;
GRANT ALL PRIVILEGES ON DATABASE strevio TO strevio;
\q
```

### 3.2 Allow Local Connections

Edit `pg_hba.conf` (usually at `/etc/postgresql/15/main/pg_hba.conf`):
```
# Add this line:
local   strevio   strevio   md5
host    strevio   strevio   127.0.0.1/32   md5
```

Restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

---

## 4. Deploy Application

### 4.1 Upload Project Files

Upload project files to your server, e.g. `/www/wwwroot/strevio/`

```bash
# Option 1: Git clone
cd /www/wwwroot
git clone YOUR_REPO_URL strevio

# Option 2: Upload via aaPanel File Manager
# Or use SCP/SFTP
```

### 4.2 Install Dependencies

```bash
cd /www/wwwroot/strevio
npm install --production
```

### 4.3 Configure Environment

Create/edit `.env` file:
```bash
nano /www/wwwroot/strevio/.env
```

```env
PORT=3000
JWT_SECRET=GENERATE_A_LONG_RANDOM_STRING_HERE
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=YOUR_STRONG_ADMIN_PASSWORD
DATABASE_URL=postgresql://strevio:YOUR_STRONG_PASSWORD_HERE@localhost:5432/strevio
NODE_ENV=production
```

> **IMPORTANT**: Generate JWT_SECRET with: `openssl rand -hex 64`

### 4.4 Test Startup

```bash
cd /www/wwwroot/strevio
node server.js
```

You should see:
```
⚡ Strevio running on http://localhost:3000
```

Press `Ctrl+C` to stop.

---

## 5. PM2 Process Manager

### 5.1 Install PM2 (if not via aaPanel)

```bash
npm install -g pm2
```

### 5.2 Create PM2 Ecosystem File

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

### 5.3 Start with PM2

```bash
# Create logs directory
mkdir -p /www/wwwroot/strevio/logs

# Start
cd /www/wwwroot/strevio
pm2 start ecosystem.config.js

# Save PM2 process list (auto-start on reboot)
pm2 save
pm2 startup
```

### 5.4 Useful PM2 Commands

```bash
pm2 status              # Check status
pm2 logs strevio        # View logs
pm2 restart strevio     # Restart
pm2 stop strevio        # Stop
pm2 monit               # Real-time monitoring
```

---

## 6. Nginx Reverse Proxy

### 6.1 Create Website in aaPanel

1. Go to **Website** → **Add site**
2. Enter your domain (e.g. `strevio.yourdomain.com`)
3. Select **Static** website type
4. Create the site

### 6.2 Configure Nginx

Go to the site settings → **Config** (or edit the Nginx config file directly).

Replace the `server` block with:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name strevio.yourdomain.com;

    # Redirect to HTTPS (after SSL setup)
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

        # WebSocket timeout (important for Socket.IO)
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Static files caching
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        proxy_pass http://127.0.0.1:3000;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    access_log /www/wwwlogs/strevio.log;
    error_log /www/wwwlogs/strevio.error.log;
}
```

### 6.3 Test & Reload Nginx

```bash
nginx -t
systemctl reload nginx
```

---

## 7. SSL Certificate (HTTPS)

### Via aaPanel:
1. Go to **Website** → your site → **SSL**
2. Choose **Let's Encrypt**
3. Enter your domain and click **Apply**
4. Enable **Force HTTPS**

### Or via Certbot CLI:
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d strevio.yourdomain.com
```

After SSL is active, uncomment the `return 301` line in the Nginx config above.

---

## 8. Firewall Rules

In aaPanel **Security** → **Firewall**, ensure these ports are open:

| Port | Purpose |
|------|---------|
| 80 | HTTP |
| 443 | HTTPS |
| 22 | SSH |
| 5432 | PostgreSQL (only if remote access needed, usually NOT) |

---

## 9. Updating

```bash
cd /www/wwwroot/strevio

# Pull latest code
git pull origin main

# Install new dependencies
npm install --production

# Restart
pm2 restart strevio
```

---

## 10. Monitoring & Maintenance

### View Logs
```bash
pm2 logs strevio --lines 50
```

### Database Backup
```bash
# Manual backup
pg_dump -U strevio strevio > /backup/strevio_$(date +%Y%m%d).sql

# Cron job (daily at 3 AM) — add via aaPanel Cron
0 3 * * * pg_dump -U strevio strevio > /backup/strevio_$(date +\%Y\%m\%d).sql
```

### Health Check
```bash
curl http://localhost:3000/api/health
# Should return: {"success":true}
```

---

## 11. Troubleshooting

| Problem | Solution |
|---------|----------|
| `ECONNREFUSED 5432` | PostgreSQL not running: `systemctl start postgresql` |
| `EACCES port 3000` | Port in use: `lsof -i :3000`, change PORT in .env |
| WebSocket issues | Ensure Nginx has `proxy_set_header Upgrade` and `Connection "upgrade"` |
| 502 Bad Gateway | PM2 crashed: `pm2 restart strevio && pm2 logs` |
| Database auth error | Check DATABASE_URL credentials match psql user |
| `better-sqlite3` error | Old dependency — run `npm install` to get `pg` instead |

---

## Quick Start Summary

```bash
# 1. Upload files to /www/wwwroot/strevio/
# 2. Create PostgreSQL database
sudo -u postgres psql -c "CREATE USER strevio WITH PASSWORD 'yourpass'; CREATE DATABASE strevio OWNER strevio;"

# 3. Configure .env
cp .env.example .env  # or create manually
nano .env

# 4. Install & start
cd /www/wwwroot/strevio
npm install --production
pm2 start ecosystem.config.js
pm2 save && pm2 startup

# 5. Configure Nginx reverse proxy in aaPanel
# 6. Add SSL via aaPanel → SSL → Let's Encrypt
# Done! 🎉
```
