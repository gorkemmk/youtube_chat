require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'change-this-secret',
  jwtExpiry: '7d',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@admin.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'strevio',
  },
  plans: {
    free: {
      name: 'Ücretsiz',
      maxOverlays: 1,
      features: ['basic_chat', 'basic_overlay'],
      price: 0,
    },
    pro: {
      name: 'Pro',
      maxOverlays: 3,
      features: ['basic_chat', 'basic_overlay', 'custom_theme', 'superchat_alerts', 'badges', 'analytics'],
      price: 49.99,
    },
    business: {
      name: 'Business',
      maxOverlays: 10,
      features: ['basic_chat', 'basic_overlay', 'custom_theme', 'superchat_alerts', 'badges', 'analytics', 'priority_support', 'api_access', 'webhook'],
      price: 99.99,
    },
  },
  overlay: {
    maxMessages: 50,
    fadeTime: 60,
  },
};
