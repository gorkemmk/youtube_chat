const { LiveChat } = require('youtube-chat');
const EventEmitter = require('events');
const { sessionOps, notifOps, userOps } = require('../database');

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function extractVideoId(input) {
  if (!input) return null;
  input = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return match[1];
  }
  return input;
}

function parseChannelInput(input) {
  if (!input) return null;
  input = input.trim();

  if (/^UC[\w-]{22,}$/.test(input)) return { channelId: input };

  if (input.startsWith('@')) return { handle: input };

  const chMatch = input.match(/youtube\.com\/channel\/(UC[\w-]{22,})/);
  if (chMatch) return { channelId: chMatch[1] };

  const handleMatch = input.match(/youtube\.com\/(@[\w.-]+)/);
  if (handleMatch) return { handle: handleMatch[1] };

  const customMatch = input.match(/youtube\.com\/c\/([\w.-]+)/);
  if (customMatch) return { handle: '@' + customMatch[1] };

  return { handle: input.startsWith('@') ? input : '@' + input };
}

function formatMessage(chatItem) {
  const message = {
    id: chatItem.id || Date.now().toString(),
    timestamp: chatItem.timestamp ? new Date(chatItem.timestamp) : new Date(),
    author: {
      name: chatItem.author?.name || 'Unknown',
      thumbnail: chatItem.author?.thumbnail?.url || '',
      channelId: chatItem.author?.channelId || '',
      badge: null,
      isOwner: chatItem.isOwner || false,
      isModerator: chatItem.isModerator || false,
      isMember: chatItem.isMembership || false,
      isVerified: chatItem.isVerified || false,
    },
    message: '',
    type: 'normal',
    superchat: null,
    membership: null,
  };

  if (chatItem.isOwner) message.author.badge = { type: 'owner', label: 'Owner' };
  else if (chatItem.isModerator) message.author.badge = { type: 'moderator', label: 'Moderator' };
  else if (chatItem.isMembership) message.author.badge = { type: 'member', label: chatItem.author?.badge?.label || 'Member' };
  else if (chatItem.isVerified) message.author.badge = { type: 'verified', label: 'Verified' };
  else if (chatItem.author?.badge) message.author.badge = { type: 'member', label: chatItem.author.badge.label || 'Member' };

  if (chatItem.message && Array.isArray(chatItem.message)) {
    message.message = chatItem.message.map(item => {
      if (typeof item === 'string') return escapeHtml(item);
      if (item.text) return escapeHtml(item.text);
      if (item.url) return `<img class="emoji" src="${item.url}" alt="${item.alt || item.emojiText || ''}" />`;
      if (item.emojiText) return item.emojiText;
      return '';
    }).join('');
  }

  if (chatItem.superchat) {
    message.type = 'superchat';
    message.superchat = { amount: chatItem.superchat.amount || '', color: chatItem.superchat.color || '#FFD600' };
  }

  if (chatItem.isMembership && !chatItem.superchat) {
    message.type = 'membership';
    message.membership = { text: chatItem.author?.badge?.label || 'New Member' };
  }

  return message;
}

class UserChat extends EventEmitter {
  constructor(userId) {
    super();
    this.userId = userId;
    this.liveChat = null;
    this.isRunning = false;
    this.videoId = null;
    this.channelId = null;
    this.sessionId = null;
    this.messages = [];
    this.stats = { totalMessages: 0, superChats: 0, memberships: 0, startedAt: null };
    this.mode = null;
  }

  async start(videoIdOrUrl) {
    if (this.isRunning) await this.stop();

    const videoId = extractVideoId(videoIdOrUrl);
    if (!videoId) throw new Error('Invalid Video ID or URL');

    this.videoId = videoId;
    this.mode = 'manual';
    this._resetStats();

    await userOps.updateVideoId(this.userId, videoId);
    const session = await sessionOps.create(this.userId, videoId);
    this.sessionId = session.id;

    try {
      this.liveChat = new LiveChat({ liveId: videoId });
      this._attachChatEvents();
      const ok = await this.liveChat.start();
      if (!ok) {
        await this._endSession('error', 'Live stream not found');
        throw new Error('Live stream not found or chat is disabled.');
      }
      return { success: true, videoId };
    } catch (error) {
      this.isRunning = false;
      this.liveChat = null;
      await notifOps.create({
        userId: this.userId, type: 'chat_error',
        title: 'Chat connection error', message: error.message,
      });
      throw error;
    }
  }

  async startWithChannel(channelInput) {
    if (this.isRunning) return;

    const parsed = parseChannelInput(channelInput);
    if (!parsed) throw new Error('Invalid channel info');

    this.channelId = channelInput;
    this.mode = 'auto';
    this._resetStats();

    this.liveChat = new LiveChat(parsed);
    this._attachChatEvents();

    const ok = await this.liveChat.start();
    if (!ok) {
      this.liveChat = null;
      this.mode = null;
      throw new Error('Channel is not live right now');
    }

    const videoId = this.liveChat.liveId || `channel:${channelInput}`;
    this.videoId = videoId;
    const session = await sessionOps.create(this.userId, videoId);
    this.sessionId = session.id;
    return { success: true, channelId: channelInput, videoId };
  }

  _resetStats() {
    this.messages = [];
    this.stats = { totalMessages: 0, superChats: 0, memberships: 0, startedAt: new Date() };
  }

  _attachChatEvents() {
    this.liveChat.on('start', (liveId) => {
      this.isRunning = true;
      if (liveId) this.videoId = liveId;
      this.emit('started', { videoId: this.videoId, channelId: this.channelId, mode: this.mode });
    });

    this.liveChat.on('chat', (chatItem) => {
      const msg = formatMessage(chatItem);
      this.stats.totalMessages++;
      if (msg.type === 'superchat') this.stats.superChats++;
      if (msg.type === 'membership') this.stats.memberships++;
      this.messages.push(msg);
      if (this.messages.length > 200) this.messages = this.messages.slice(-200);
      this.emit('message', msg);
      if (this.stats.totalMessages % 50 === 0) this._updateSession();
    });

    this.liveChat.on('end', (reason) => {
      this.isRunning = false;
      this._endSession('ended', reason);
      this.emit('ended', reason);
      notifOps.create({
        userId: this.userId, type: 'chat_ended',
        title: 'Live stream ended',
        message: `Stream chat ended.${reason ? ' Reason: ' + reason : ''}`,
      }).catch(() => {});
    });

    this.liveChat.on('error', (err) => {
      console.error(`[ChatPool] User ${this.userId} error:`, err.message || err);
      this.emit('error', err);
    });
  }

  async stop() {
    if (this.liveChat) {
      try { this.liveChat.stop('Manual stop'); } catch(e) {}
      this.liveChat = null;
    }
    this.isRunning = false;
    await this._endSession('ended', 'Manual stop');
    this.emit('stopped');
  }

  async _updateSession() {
    if (!this.sessionId) return;
    try {
      await sessionOps.updateStats(this.sessionId, this.stats.totalMessages, this.stats.superChats, this.stats.memberships);
    } catch (e) {}
  }

  async _endSession(status, error) {
    if (!this.sessionId) return;
    await this._updateSession();
    try { await sessionOps.end(this.sessionId, status, error || null); } catch (e) {}
    this.sessionId = null;
  }

  getStatus() {
    return {
      running: this.isRunning, videoId: this.videoId, channelId: this.channelId,
      mode: this.mode, stats: this.stats, messageCount: this.messages.length,
    };
  }

  getMessages(limit = 50) { return this.messages.slice(-limit); }

  async destroy() { await this.stop(); this.removeAllListeners(); }
}

class ChatPool {
  constructor(io) {
    this.io = io;
    this.chats = new Map();
    this.autoWatchUsers = new Map();
    this.stats = { totalActive: 0, peakActive: 0 };

    setInterval(() => this._cleanup(), 60000);
    setInterval(() => this._broadcastAdminStats(), 10000);
    setInterval(() => this._autoDetectLoop(), 45000);

    setTimeout(() => this._loadAutoWatchUsers(), 2000);
  }

  async _loadAutoWatchUsers() {
    try {
      const users = await userOps.getAutoWatch();
      for (const user of users) {
        if (user.youtube_channel) {
          this.autoWatchUsers.set(user.id, { channelId: user.youtube_channel, checking: false });
        }
      }
      console.log(`📡 Auto-watch: ${this.autoWatchUsers.size} users loaded`);
      if (this.autoWatchUsers.size > 0) {
        setTimeout(() => this._autoDetectLoop(), 5000);
      }
    } catch (err) {
      console.error('Auto-watch load error:', err.message);
    }
  }

  enableAutoWatch(userId, channelId) {
    this.autoWatchUsers.set(userId, { channelId, checking: false });
    setTimeout(() => this._checkUserLive(userId, channelId), 1000);
  }

  disableAutoWatch(userId) {
    this.autoWatchUsers.delete(userId);
  }

  async _autoDetectLoop() {
    for (const [userId, data] of this.autoWatchUsers) {
      const existing = this.chats.get(userId);
      if (existing?.isRunning || data.checking) continue;
      this._checkUserLive(userId, data.channelId);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  async _checkUserLive(userId, channelId) {
    const data = this.autoWatchUsers.get(userId);
    if (!data || data.checking) return;
    data.checking = true;

    try {
      const chat = this.getChat(userId);
      await chat.startWithChannel(channelId);
      this._updateStats();
      console.log(`📡 Auto-detect: User ${userId} is LIVE! 🔴`);

      this.io.of('/dashboard').to(`user:${userId}`).emit('notification', {
        type: 'success', title: 'Live Stream Detected!',
        message: 'Your channel is live — chat started automatically.',
      });
    } catch (err) {
    } finally {
      if (data) data.checking = false;
    }
  }

  getChat(userId) {
    if (!this.chats.has(userId)) {
      const chat = new UserChat(userId);
      this._attachListeners(userId, chat);
      this.chats.set(userId, chat);
    }
    return this.chats.get(userId);
  }

  async startChat(userId, videoIdOrUrl) {
    const chat = this.getChat(userId);
    const result = await chat.start(videoIdOrUrl);
    this._updateStats();
    return result;
  }

  async stopChat(userId) {
    const chat = this.chats.get(userId);
    if (chat) { await chat.stop(); this._updateStats(); }
  }

  getStatus(userId) {
    const chat = this.chats.get(userId);
    return chat ? chat.getStatus() : {
      running: false, videoId: null, channelId: null, mode: null,
      stats: { totalMessages: 0, superChats: 0, memberships: 0 }, messageCount: 0,
    };
  }

  getMessages(userId, limit) {
    const chat = this.chats.get(userId);
    return chat ? chat.getMessages(limit) : [];
  }

  _attachListeners(userId, chat) {
    const room = `user:${userId}`;
    const overlayRoom = `overlay:${userId}`;
    const dashNs = this.io.of('/dashboard');
    const overlayNs = this.io.of('/overlay');

    chat.on('started', (data) => {
      dashNs.to(room).emit('chat:status', { running: true, videoId: data.videoId, mode: data.mode, message: 'Chat connected' });
      overlayNs.to(overlayRoom).emit('chat:status', { running: true, videoId: data.videoId, message: 'Live' });
    });
    chat.on('message', (msg) => {
      dashNs.to(room).emit('chat:message', msg);
      overlayNs.to(overlayRoom).emit('chat:message', msg);
    });
    chat.on('ended', (reason) => {
      dashNs.to(room).emit('chat:status', { running: false, message: `Stream ended${reason ? ': ' + reason : ''}` });
      overlayNs.to(overlayRoom).emit('chat:status', { running: false, message: 'Stream ended' });
      dashNs.to(room).emit('notification', { type: 'warning', title: 'Stream Ended', message: 'Live stream ended. Will reconnect automatically when you go live again.' });
    });
    chat.on('error', (err) => {
      dashNs.to(room).emit('chat:error', { message: err?.message || 'Unknown error' });
    });
    chat.on('stopped', () => {
      dashNs.to(room).emit('chat:status', { running: false, message: 'Chat stopped' });
      overlayNs.to(overlayRoom).emit('chat:status', { running: false, message: 'Stopped' });
    });
  }

  _updateStats() {
    this.stats.totalActive = [...this.chats.values()].filter(c => c.isRunning).length;
    if (this.stats.totalActive > this.stats.peakActive) this.stats.peakActive = this.stats.totalActive;
  }

  async _cleanup() {
    for (const [userId, chat] of this.chats) {
      if (!chat.isRunning && chat.messages.length === 0) {
        await chat.destroy();
        this.chats.delete(userId);
      }
    }
    this._updateStats();
  }

  _broadcastAdminStats() {
    this._updateStats();
    this.io.of('/dashboard').to('admin').emit('pool:stats', {
      activeChats: this.stats.totalActive, peakActive: this.stats.peakActive,
      totalConnections: this.chats.size, autoWatchCount: this.autoWatchUsers.size,
    });
  }

  getPoolStats() {
    this._updateStats();
    return {
      activeChats: this.stats.totalActive, peakActive: this.stats.peakActive,
      totalConnections: this.chats.size, autoWatchCount: this.autoWatchUsers.size,
    };
  }
}

module.exports = { ChatPool, UserChat };
