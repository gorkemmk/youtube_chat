const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+00:00',
});

pool.on('connection', () => {});

async function initDB() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        username VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('user', 'admin') DEFAULT 'user',
        plan ENUM('free', 'pro', 'business') DEFAULT 'free',
        plan_expires_at DATETIME NULL,
        overlay_token VARCHAR(100) NOT NULL UNIQUE,
        youtube_channel VARCHAR(255) NULL,
        youtube_video_id VARCHAR(100) NULL,
        auto_watch TINYINT(1) DEFAULT 1,
        is_active TINYINT(1) DEFAULT 1,
        is_banned TINYINT(1) DEFAULT 0,
        last_login_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_users_email (email),
        INDEX idx_users_overlay_token (overlay_token)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        video_id VARCHAR(100) NOT NULL,
        status ENUM('active', 'ended', 'error') DEFAULT 'active',
        total_messages INT DEFAULT 0,
        super_chats INT DEFAULT 0,
        memberships INT DEFAULT 0,
        error_message TEXT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME NULL,
        INDEX idx_sessions_user (user_id),
        CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS overlay_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        theme VARCHAR(50) DEFAULT 'default',
        font_size INT DEFAULT 14,
        max_messages INT DEFAULT 50,
        fade_time INT DEFAULT 60,
        show_avatars TINYINT(1) DEFAULT 1,
        show_badges TINYINT(1) DEFAULT 1,
        show_timestamps TINYINT(1) DEFAULT 0,
        bg_opacity FLOAT DEFAULT 0.55,
        animation VARCHAR(50) DEFAULT 'slide',
        custom_css TEXT NULL,
        position VARCHAR(50) DEFAULT 'bottom-left',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_overlay_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        is_read TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notif_user (user_id),
        CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        action VARCHAR(100) NOT NULL,
        details TEXT NULL,
        ip_address VARCHAR(45) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_activity_user (user_id),
        CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ MySQL tables initialized');
  } finally {
    conn.release();
  }
}

const userOps = {
  async create({ email, username, password, role, plan, overlay_token }) {
    const [result] = await pool.execute(
      'INSERT INTO users (email, username, password, role, plan, overlay_token) VALUES (?, ?, ?, ?, ?, ?)',
      [email, username, password, role || 'user', plan || 'free', overlay_token]
    );
    return this.findById(result.insertId);
  },

  async findByEmail(email) {
    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0] || null;
  },

  async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async findByToken(token) {
    const [rows] = await pool.execute('SELECT * FROM users WHERE overlay_token = ?', [token]);
    return rows[0] || null;
  },

  async findByUsername(username) {
    const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
    return rows[0] || null;
  },

  async getAll() {
    const [rows] = await pool.execute(
      'SELECT id, email, username, role, plan, plan_expires_at, youtube_channel, youtube_video_id, is_active, is_banned, last_login_at, created_at FROM users ORDER BY created_at DESC'
    );
    return rows;
  },

  async getAllPaginated(limit, offset) {
    const [rows] = await pool.execute(
      'SELECT id, email, username, role, plan, plan_expires_at, youtube_channel, youtube_video_id, is_active, is_banned, last_login_at, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [String(limit), String(offset)]
    );
    return rows;
  },

  async count() {
    const [rows] = await pool.execute('SELECT COUNT(*) as total FROM users');
    return parseInt(rows[0].total);
  },

  async updateLogin(id) {
    await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [id]);
  },

  async updateProfile(id, username, youtube_channel) {
    await pool.execute(
      'UPDATE users SET username = ?, youtube_channel = ?, updated_at = NOW() WHERE id = ?',
      [username, youtube_channel, id]
    );
  },

  async updateVideoId(id, videoId) {
    await pool.execute('UPDATE users SET youtube_video_id = ?, updated_at = NOW() WHERE id = ?', [videoId, id]);
  },

  async updatePlan(id, plan, expiresAt) {
    await pool.execute(
      'UPDATE users SET plan = ?, plan_expires_at = ?, updated_at = NOW() WHERE id = ?',
      [plan, expiresAt || null, id]
    );
  },

  async updatePassword(id, password) {
    await pool.execute('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [password, id]);
  },

  async toggleBan(id, banned) {
    await pool.execute('UPDATE users SET is_banned = ?, updated_at = NOW() WHERE id = ?', [banned, id]);
  },

  async toggleActive(id, active) {
    await pool.execute('UPDATE users SET is_active = ?, updated_at = NOW() WHERE id = ?', [active, id]);
  },

  async regenerateToken(id, newToken) {
    await pool.execute('UPDATE users SET overlay_token = ?, updated_at = NOW() WHERE id = ?', [newToken, id]);
  },

  async delete(id) {
    await pool.execute('DELETE FROM users WHERE id = ?', [id]);
  },

  async getAutoWatch() {
    const [rows] = await pool.execute(
      "SELECT id, youtube_channel FROM users WHERE youtube_channel IS NOT NULL AND youtube_channel != '' AND auto_watch = 1 AND is_active = 1 AND is_banned = 0"
    );
    return rows;
  },

  async updateChannel(id, channel, autoWatch) {
    await pool.execute(
      'UPDATE users SET youtube_channel = ?, auto_watch = ?, updated_at = NOW() WHERE id = ?',
      [channel, autoWatch, id]
    );
  },
};

const sessionOps = {
  async create(userId, videoId) {
    const [result] = await pool.execute(
      'INSERT INTO chat_sessions (user_id, video_id) VALUES (?, ?)',
      [userId, videoId]
    );
    const [rows] = await pool.execute('SELECT * FROM chat_sessions WHERE id = ?', [result.insertId]);
    return rows[0];
  },

  async updateStats(id, totalMessages, superChats, memberships) {
    await pool.execute(
      'UPDATE chat_sessions SET total_messages = ?, super_chats = ?, memberships = ? WHERE id = ?',
      [totalMessages, superChats, memberships, id]
    );
  },

  async end(id, status, error) {
    await pool.execute(
      'UPDATE chat_sessions SET status = ?, ended_at = NOW(), error_message = ? WHERE id = ?',
      [status, error || null, id]
    );
  },

  async getByUser(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 20',
      [userId]
    );
    return rows;
  },

  async getActive() {
    const [rows] = await pool.execute("SELECT * FROM chat_sessions WHERE status = 'active'");
    return rows;
  },

  async getStats(userId) {
    const [rows] = await pool.execute(
      `SELECT 
        COUNT(*) as total_sessions,
        COALESCE(SUM(total_messages), 0) as total_messages,
        COALESCE(SUM(super_chats), 0) as total_super_chats,
        COALESCE(SUM(memberships), 0) as total_memberships
      FROM chat_sessions WHERE user_id = ?`,
      [userId]
    );
    return rows[0];
  },
};

const overlayOps = {
  async get(userId) {
    const [rows] = await pool.execute('SELECT * FROM overlay_settings WHERE user_id = ?', [userId]);
    return rows[0] || null;
  },

  async upsert({ userId, theme, fontSize, maxMessages, fadeTime, showAvatars, showBadges, showTimestamps, bgOpacity, animation, customCss, position }) {
    await pool.execute(
      `INSERT INTO overlay_settings (user_id, theme, font_size, max_messages, fade_time, show_avatars, show_badges, show_timestamps, bg_opacity, animation, custom_css, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         theme = VALUES(theme), font_size = VALUES(font_size), max_messages = VALUES(max_messages),
         fade_time = VALUES(fade_time), show_avatars = VALUES(show_avatars), show_badges = VALUES(show_badges),
         show_timestamps = VALUES(show_timestamps), bg_opacity = VALUES(bg_opacity), animation = VALUES(animation),
         custom_css = VALUES(custom_css), position = VALUES(position), updated_at = NOW()`,
      [userId, theme, fontSize, maxMessages, fadeTime, showAvatars, showBadges, showTimestamps, bgOpacity, animation, customCss, position]
    );
  },
};

const notifOps = {
  async create({ userId, type, title, message }) {
    await pool.execute(
      'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
      [userId, type, title, message]
    );
  },

  async getByUser(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    return rows;
  },

  async getUnread(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  },

  async markRead(id, userId) {
    await pool.execute('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, userId]);
  },

  async markAllRead(userId) {
    await pool.execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
  },
};

const logOps = {
  async create({ userId, action, details, ip }) {
    await pool.execute(
      'INSERT INTO activity_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)',
      [userId, action, details, ip]
    );
  },

  async getRecent(limit) {
    const [rows] = await pool.execute(
      'SELECT al.*, u.username FROM activity_log al LEFT JOIN users u ON al.user_id = u.id ORDER BY al.created_at DESC LIMIT ?',
      [String(limit)]
    );
    return rows;
  },

  async getByUser(userId) {
    const [rows] = await pool.execute(
      'SELECT * FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    return rows;
  },
};

async function getAdminStats() {
  const [[{ c: userCount }]] = await pool.execute('SELECT COUNT(*) as c FROM users');
  const [[{ c: activeChats }]] = await pool.execute("SELECT COUNT(*) as c FROM chat_sessions WHERE status = 'active'");
  const [[{ c: totalMessages }]] = await pool.execute('SELECT COALESCE(SUM(total_messages), 0) as c FROM chat_sessions');
  const [[{ c: totalSuperChats }]] = await pool.execute('SELECT COALESCE(SUM(super_chats), 0) as c FROM chat_sessions');
  const [planCounts] = await pool.execute('SELECT plan, COUNT(*) as count FROM users GROUP BY plan');
  const [recentUsers] = await pool.execute('SELECT id, username, email, plan, created_at FROM users ORDER BY created_at DESC LIMIT 5');
  const [[{ c: todayUsers }]] = await pool.execute("SELECT COUNT(*) as c FROM users WHERE DATE(created_at) = CURDATE()");

  return {
    userCount: parseInt(userCount),
    activeChats: parseInt(activeChats),
    totalMessages: parseInt(totalMessages),
    totalSuperChats: parseInt(totalSuperChats),
    planCounts: Object.fromEntries(planCounts.map(p => [p.plan, parseInt(p.count)])),
    recentUsers,
    todayUsers: parseInt(todayUsers),
  };
}

async function seedAdmin() {
  const existing = await userOps.findByEmail(config.adminEmail);
  if (!existing) {
    const hash = bcrypt.hashSync(config.adminPassword, 10);
    const token = uuidv4();
    await userOps.create({
      email: config.adminEmail,
      username: 'admin',
      password: hash,
      role: 'admin',
      plan: 'business',
      overlay_token: token,
    });
    console.log(`✅ Admin user created: ${config.adminEmail}`);
  }
}

async function initialize() {
  await initDB();
  await seedAdmin();
}

module.exports = {
  pool,
  userOps,
  sessionOps,
  overlayOps,
  notifOps,
  logOps,
  getAdminStats,
  initialize,
};
