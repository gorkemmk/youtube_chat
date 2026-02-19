const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { userOps, logOps, getAdminStats, sessionOps } = require('../database');
const config = require('../config');

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/stats', async (req, res) => {
  const chatPool = req.app.get('chatPool');
  const dbStats = await getAdminStats();
  const poolStats = chatPool.getPoolStats();

  res.json({
    success: true,
    data: { ...dbStats, ...poolStats },
  });
});

router.get('/users', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  const users = await userOps.getAllPaginated(limit, offset);
  const total = await userOps.count();

  const chatPool = req.app.get('chatPool');
  const enriched = users.map(u => ({
    ...u,
    chatStatus: chatPool.getStatus(u.id),
  }));

  res.json({
    success: true,
    data: { users: enriched, total, page, pages: Math.ceil(total / limit) },
  });
});

router.put('/users/:id/plan', async (req, res) => {
  const { plan, expiresAt } = req.body;
  if (!['free', 'pro', 'business'].includes(plan)) {
    return res.status(400).json({ success: false, error: 'Invalid plan' });
  }

  await userOps.updatePlan(parseInt(req.params.id), plan, expiresAt || null);

  await logOps.create({
    userId: req.user.id,
    action: 'admin_change_plan',
    details: `User #${req.params.id} plan -> ${plan}`,
    ip: req.ip,
  });

  res.json({ success: true, message: 'Plan updated' });
});

router.put('/users/:id/ban', async (req, res) => {
  const { banned } = req.body;
  const targetId = parseInt(req.params.id);

  if (targetId === req.user.id) {
    return res.status(400).json({ success: false, error: 'Cannot ban yourself' });
  }

  await userOps.toggleBan(targetId, banned ? 1 : 0);

  await logOps.create({
    userId: req.user.id,
    action: banned ? 'admin_ban_user' : 'admin_unban_user',
    details: `User #${targetId}`,
    ip: req.ip,
  });

  if (banned) {
    const chatPool = req.app.get('chatPool');
    chatPool.stopChat(targetId);
  }

  res.json({ success: true, message: banned ? 'User banned' : 'User unbanned' });
});

router.delete('/users/:id', async (req, res) => {
  const targetId = parseInt(req.params.id);

  if (targetId === req.user.id) {
    return res.status(400).json({ success: false, error: 'Cannot delete yourself' });
  }

  const chatPool = req.app.get('chatPool');
  chatPool.stopChat(targetId);
  await userOps.delete(targetId);

  await logOps.create({
    userId: req.user.id,
    action: 'admin_delete_user',
    details: `User #${targetId} deleted`,
    ip: req.ip,
  });

  res.json({ success: true, message: 'User deleted' });
});

router.post('/users/:id/stop-chat', async (req, res) => {
  const chatPool = req.app.get('chatPool');
  await chatPool.stopChat(parseInt(req.params.id));
  res.json({ success: true, message: 'Chat stopped' });
});

router.get('/activity', async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const logs = await logOps.getRecent(limit);
  res.json({ success: true, data: logs });
});

router.get('/pool', (req, res) => {
  const chatPool = req.app.get('chatPool');
  res.json({ success: true, data: chatPool.getPoolStats() });
});

module.exports = router;
