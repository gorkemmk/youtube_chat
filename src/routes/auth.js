const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { userOps, logOps } = require('../database');
const { generateToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ success: false, error: 'Username must be 3-30 characters' });
    }

    if (await userOps.findByEmail(email)) {
      return res.status(400).json({ success: false, error: 'This email is already registered' });
    }
    if (await userOps.findByUsername(username)) {
      return res.status(400).json({ success: false, error: 'This username is already taken' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const overlayToken = uuidv4();

    const user = await userOps.create({
      email,
      username,
      password: hash,
      role: 'user',
      plan: 'free',
      overlay_token: overlayToken,
    });

    const token = generateToken(user);

    await logOps.create({
      userId: user.id,
      action: 'register',
      details: `New user registered: ${email}`,
      ip: req.ip,
    });

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, username: user.username, role: user.role, plan: user.plan },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const user = await userOps.findByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    if (user.is_banned) {
      return res.status(403).json({ success: false, error: 'Your account has been banned' });
    }

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    await userOps.updateLogin(user.id);
    const token = generateToken(user);

    await logOps.create({
      userId: user.id,
      action: 'login',
      details: 'User logged in',
      ip: req.ip,
    });

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, username: user.username, role: user.role, plan: user.plan },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, user: req.user });
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await userOps.findById(req.user.id);

    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    await userOps.updatePassword(req.user.id, hash);

    res.json({ success: true, message: 'Password changed' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to change password' });
  }
});

module.exports = router;
