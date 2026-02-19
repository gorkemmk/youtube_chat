const jwt = require('jsonwebtoken');
const config = require('../config');
const { userOps } = require('../database');

function setupSocket(io, chatPool) {
  const dashNs = io.of('/dashboard');

  dashNs.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Auth required'));

    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      const user = await userOps.findById(decoded.id);
      if (!user || user.is_banned) return next(new Error('Invalid user'));
      socket.user = { id: user.id, email: user.email, role: user.role, username: user.username };
      next();
    } catch (e) {
      next(new Error('Invalid token'));
    }
  });

  dashNs.on('connection', (socket) => {
    const userId = socket.user.id;
    const userRoom = `user:${userId}`;

    socket.join(userRoom);

    if (socket.user.role === 'admin') {
      socket.join('admin');
    }

    console.log(`🔌 [Dashboard] ${socket.user.username} connected`);

    const status = chatPool.getStatus(userId);
    socket.emit('chat:status', {
      running: status.running,
      videoId: status.videoId,
      message: status.running ? 'Chat active' : 'Waiting',
    });

    const messages = chatPool.getMessages(userId, 50);
    if (messages.length > 0) {
      socket.emit('chat:history', messages);
    }

    socket.emit('chat:stats', status);

    socket.on('chat:start', async (data) => {
      try {
        await chatPool.startChat(userId, data.videoId);
      } catch (err) {
        socket.emit('chat:error', { message: err.message });
      }
    });

    socket.on('chat:stop', async () => {
      try {
        await chatPool.stopChat(userId);
      } catch (err) {
        socket.emit('chat:error', { message: err.message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 [Dashboard] ${socket.user.username} disconnected`);
    });
  });

  const overlayNs = io.of('/overlay');

  overlayNs.on('connection', async (socket) => {
    const token = socket.handshake.query?.token;

    if (!token) {
      socket.emit('error', { message: 'Token required' });
      socket.disconnect();
      return;
    }

    const user = await userOps.findByToken(token);
    if (!user) {
      socket.emit('error', { message: 'Invalid overlay token' });
      socket.disconnect();
      return;
    }

    if (user.is_banned || !user.is_active) {
      socket.emit('error', { message: 'Account disabled' });
      socket.disconnect();
      return;
    }

    const userId = user.id;
    const overlayRoom = `overlay:${userId}`;
    socket.join(overlayRoom);

    console.log(`🎬 [Overlay] ${user.username} overlay connected`);

    const status = chatPool.getStatus(userId);
    socket.emit('chat:status', {
      running: status.running,
      videoId: status.videoId,
      message: status.running ? 'Live' : 'Waiting',
    });

    const messages = chatPool.getMessages(userId, 50);
    if (messages.length > 0) {
      socket.emit('chat:history', messages);
    }

    socket.on('disconnect', () => {
      console.log(`🎬 [Overlay] ${user.username} overlay disconnected`);
    });
  });
}

module.exports = { setupSocket };
