const jwt = require('jsonwebtoken');
const config = require('../config');
const { userOps } = require('../database');

async function authMiddleware(req, res, next) {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    if (req.accepts('html')) {
      return res.redirect('/login');
    }
    return res.status(401).json({ success: false, error: 'Login required' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await userOps.findById(decoded.id);

    if (!user) {
      if (req.accepts('html')) return res.redirect('/login');
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    if (user.is_banned) {
      if (req.accepts('html')) return res.redirect('/login?error=banned');
      return res.status(403).json({ success: false, error: 'Your account has been banned' });
    }

    const { password, ...safeUser } = user;
    req.user = safeUser;
    next();
  } catch (err) {
    if (req.accepts('html')) return res.redirect('/login');
    return res.status(401).json({ success: false, error: 'Invalid session' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    if (req.accepts('html')) return res.redirect('/dashboard');
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

async function optionalAuth(req, res, next) {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      const user = await userOps.findById(decoded.id);
      if (user && !user.is_banned) {
        const { password, ...safeUser } = user;
        req.user = safeUser;
      }
    } catch (e) {
    }
  }

  next();
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry }
  );
}

async function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await userOps.findById(decoded.id);
    if (!user || user.is_banned) {
      return next(new Error('Invalid user'));
    }
    const { password, ...safeUser } = user;
    socket.user = safeUser;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
}

module.exports = {
  authMiddleware,
  adminMiddleware,
  optionalAuth,
  generateToken,
  socketAuth,
};
