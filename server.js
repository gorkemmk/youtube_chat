require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const config = require('./src/config');
const { initialize, userOps, overlayOps } = require('./src/database');

const authRoutes = require('./src/routes/auth');
const apiRoutes = require('./src/routes/api');
const adminRoutes = require('./src/routes/admin');
const { authMiddleware, adminMiddleware, optionalAuth } = require('./src/middleware/auth');
const { ChatPool } = require('./src/services/chatPool');
const { setupSocket } = require('./src/socket/handler');
const { getLangData, supportedLangs } = require('./src/i18n');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, error: 'Too many requests. Try again in 15 minutes.' },
});

app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/api/i18n/:lang', (req, res) => {
  const lang = req.params.lang;
  if (!supportedLangs.includes(lang)) {
    return res.status(404).json({ success: false, error: 'Language not supported' });
  }
  res.json({ success: true, data: getLangData(lang) });
});

app.use('/auth', authLimiter, authRoutes);

app.use('/api', apiRoutes);

app.use('/admin/api', adminRoutes);

app.get('/login', optionalAuth, (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', optionalAuth, (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/dashboard', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/admin', authMiddleware, adminMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/overlay/:token', async (req, res) => {
  const user = await userOps.findByToken(req.params.token);
  if (!user) {
    return res.status(404).send('Invalid overlay token');
  }
  if (user.is_banned || !user.is_active) {
    return res.status(403).send('Account disabled');
  }
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

app.get('/overlay/:token/settings', async (req, res) => {
  const user = await userOps.findByToken(req.params.token);
  if (!user) return res.status(404).json({ error: 'Invalid token' });

  const settings = await overlayOps.get(user.id) || {
    theme: 'default', font_size: 14, max_messages: 50, fade_time: 60,
    show_avatars: 1, show_badges: 1, show_timestamps: 0, bg_opacity: 0.55,
    animation: 'slide', custom_css: '', position: 'bottom-left',
  };

  res.json({ success: true, data: settings });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function startApp() {
  try {
    await initialize();

    const chatPool = new ChatPool(io);
    app.set('chatPool', chatPool);

    setupSocket(io, chatPool);

    server.listen(config.port, () => {
      console.log(`\n🚀 Strevio - YouTube Chat SaaS Platform`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🏠 Home       : http://localhost:${config.port}`);
      console.log(`🔐 Login      : http://localhost:${config.port}/login`);
      console.log(`📊 Dashboard  : http://localhost:${config.port}/dashboard`);
      console.log(`⚙️  Admin Panel: http://localhost:${config.port}/admin`);
      console.log(`🎬 Overlay    : http://localhost:${config.port}/overlay/{token}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`👤 Admin      : ${config.adminEmail} / ${config.adminPassword}`);
      console.log(`🗄️  Database   : MySQL`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start application:', err.message);
    process.exit(1);
  }
}

startApp();
