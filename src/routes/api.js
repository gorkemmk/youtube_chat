const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/auth');
const { userOps, sessionOps, overlayOps, notifOps } = require('../database');
const config = require('../config');

const router = express.Router();

router.use(authMiddleware);

router.get('/status', (req, res) => {
  const chatPool = req.app.get('chatPool');
  const status = chatPool.getStatus(req.user.id);
  const isAutoWatch = chatPool.autoWatchUsers.has(req.user.id);
  res.json({ success: true, data: { ...status, autoWatch: isAutoWatch, channel: req.user.youtube_channel } });
});

router.post('/channel', async (req, res) => {
  const { channel } = req.body;
  if (!channel || !channel.trim()) {
    return res.status(400).json({ success: false, error: 'YouTube channel info is required' });
  }

  const chatPool = req.app.get('chatPool');
  try {
    await userOps.updateChannel(req.user.id, channel.trim(), 1);
    chatPool.enableAutoWatch(req.user.id, channel.trim());
    res.json({ success: true, message: 'Channel saved. Live stream will be detected automatically.' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to save channel' });
  }
});

router.delete('/channel', async (req, res) => {
  const chatPool = req.app.get('chatPool');
  try {
    await userOps.updateChannel(req.user.id, null, 0);
    chatPool.disableAutoWatch(req.user.id);
    res.json({ success: true, message: 'Channel removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/chat/start', async (req, res) => {
  const chatPool = req.app.get('chatPool');
  const { videoId } = req.body;

  if (!videoId) {
    return res.status(400).json({ success: false, error: 'Video ID or URL is required' });
  }

  try {
    const result = await chatPool.startChat(req.user.id, videoId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/chat/stop', async (req, res) => {
  const chatPool = req.app.get('chatPool');
  try {
    await chatPool.stopChat(req.user.id);
    res.json({ success: true, message: 'Chat stopped' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/messages', (req, res) => {
  const chatPool = req.app.get('chatPool');
  const limit = parseInt(req.query.limit) || 50;
  const messages = chatPool.getMessages(req.user.id, limit);
  res.json({ success: true, data: messages });
});

router.get('/sessions', async (req, res) => {
  const sessions = await sessionOps.getByUser(req.user.id);
  const stats = await sessionOps.getStats(req.user.id);
  res.json({ success: true, data: { sessions, stats } });
});

router.get('/overlay/settings', async (req, res) => {
  let settings = await overlayOps.get(req.user.id);
  if (!settings) {
    settings = {
      theme: 'default', font_size: 14, max_messages: 50, fade_time: 60,
      show_avatars: 1, show_badges: 1, show_timestamps: 0, bg_opacity: 0.55,
      animation: 'slide', custom_css: '', position: 'bottom-left',
    };
  }
  res.json({ success: true, data: settings });
});

router.post('/overlay/settings', async (req, res) => {
  const { theme, fontSize, maxMessages, fadeTime, showAvatars, showBadges, showTimestamps, bgOpacity, animation, customCss, position } = req.body;

  if (customCss && req.user.plan === 'free') {
    return res.status(403).json({ success: false, error: 'Custom CSS is only available in Pro and Business plans' });
  }

  try {
    await overlayOps.upsert({
      userId: req.user.id,
      theme: theme || 'default',
      fontSize: fontSize || 14,
      maxMessages: maxMessages || 50,
      fadeTime: fadeTime || 60,
      showAvatars: showAvatars !== undefined ? (showAvatars ? 1 : 0) : 1,
      showBadges: showBadges !== undefined ? (showBadges ? 1 : 0) : 1,
      showTimestamps: showTimestamps !== undefined ? (showTimestamps ? 1 : 0) : 0,
      bgOpacity: bgOpacity || 0.55,
      animation: animation || 'slide',
      customCss: customCss || '',
      position: position || 'bottom-left',
    });
    res.json({ success: true, message: 'Settings saved' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to save settings' });
  }
});

router.get('/overlay/token', (req, res) => {
  res.json({
    success: true,
    data: {
      token: req.user.overlay_token,
      url: `${req.protocol}://${req.get('host')}/overlay/${req.user.overlay_token}`,
    },
  });
});

router.post('/overlay/token/regenerate', async (req, res) => {
  const newToken = uuidv4();
  await userOps.regenerateToken(req.user.id, newToken);
  res.json({
    success: true,
    data: {
      token: newToken,
      url: `${req.protocol}://${req.get('host')}/overlay/${newToken}`,
    },
  });
});

router.get('/profile', (req, res) => {
  res.json({ success: true, data: req.user });
});

router.put('/profile', async (req, res) => {
  const { username, youtube_channel } = req.body;
  try {
    if (username && username !== req.user.username) {
      const existing = await userOps.findByUsername(username);
      if (existing && existing.id !== req.user.id) {
        return res.status(400).json({ success: false, error: 'This username is already taken' });
      }
    }

    await userOps.updateProfile(req.user.id, username || req.user.username, youtube_channel || null);
    res.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

router.get('/notifications', async (req, res) => {
  const notifications = await notifOps.getByUser(req.user.id);
  const unread = await notifOps.getUnread(req.user.id);
  res.json({ success: true, data: { notifications, unreadCount: unread.length } });
});

router.post('/notifications/read', async (req, res) => {
  await notifOps.markAllRead(req.user.id);
  res.json({ success: true });
});

router.get('/plan', (req, res) => {
  const userPlan = req.user.plan || 'free';
  const planDetails = config.plans[userPlan];
  res.json({
    success: true,
    data: {
      currentPlan: userPlan,
      ...planDetails,
      expiresAt: req.user.plan_expires_at,
      availablePlans: config.plans,
    },
  });
});

router.get('/i18n/:lang', (req, res) => {
  try {
    const { getLangData, supportedLangs } = require('../i18n');
    const lang = req.params.lang;
    if (!supportedLangs.includes(lang)) {
      return res.status(404).json({ success: false, error: 'Language not supported' });
    }
    res.json({ success: true, data: getLangData(lang) });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to load language data' });
  }
});

module.exports = router;
