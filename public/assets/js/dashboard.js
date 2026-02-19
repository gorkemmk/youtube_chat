(function () {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/login'; return; }
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  (async () => {
    await i18n.loadLang(i18n.getCurrentLang());
    i18n.applyTranslations();
    initLangSelector();
  })();

  function initLangSelector() {
    const sel = document.getElementById('settingsLangSwitch');
    if (!sel) return;
    sel.innerHTML = '';
    i18n.SUPPORTED.forEach(lang => {
      const opt = document.createElement('option');
      opt.value = lang; opt.textContent = i18n.LANG_NAMES[lang];
      if (lang === i18n.getCurrentLang()) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', async () => {
      await i18n.loadLang(sel.value);
      i18n.applyTranslations();
    });
  }

  document.getElementById('userName').textContent = user.username || '-';
  document.getElementById('userPlan').textContent = 'Strevio';
  document.getElementById('userAvatar').textContent = (user.username || '?')[0].toUpperCase();

  const socket = io('/dashboard', { auth: { token } });
  let isRunning = false;
  let msgCount = 0, scCount = 0, memCount = 0;
  let startedAt = null, uptimeInterval = null;

  socket.on('connect', () => console.log('[Strevio] connected'));
  socket.on('connect_error', (err) => {
    if (err.message.includes('Invalid') || err.message.includes('Auth')) logout();
  });

  socket.on('chat:status', (data) => {
    setStatus(data.running, data.message);
    if (data.videoId) document.getElementById('videoIdInput').value = data.videoId;
  });

  socket.on('chat:stats', (data) => {
    if (data.stats) {
      msgCount = data.stats.totalMessages || 0;
      scCount = data.stats.superChats || 0;
      memCount = data.stats.memberships || 0;
      if (data.stats.startedAt) startedAt = new Date(data.stats.startedAt);
      updateStats();
    }
    if (data.running) setStatus(true, i18n.t('dashboard.statusLive') || 'Live');
  });

  socket.on('chat:history', (messages) => { messages.forEach(addMessage); scrollChat(); });

  socket.on('chat:message', (msg) => {
    msgCount++;
    if (msg.type === 'superchat') scCount++;
    if (msg.type === 'membership') memCount++;
    updateStats();
    addMessage(msg);
    scrollChat();
  });

  socket.on('chat:error', (data) => {
    setStatus(false, i18n.t('dashboard.statusError') || 'Error');
    toast(data.message, 'error');
  });

  socket.on('notification', (data) => {
    toast(data.message, data.type || 'info');
    loadNotifications();
  });

  async function api(url, method = 'GET', body = null) {
    const opts = { method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    return res.json();
  }

  async function loadChannelStatus() {
    const data = await api('/api/status');
    if (!data.success) return;
    const { channel, autoWatch, running } = data.data;

    const inp = document.getElementById('channelInput');
    const statusEl = document.getElementById('channelStatus');
    const saveBtn = document.getElementById('btnSaveChannel');
    const removeBtn = document.getElementById('btnRemoveChannel');

    if (channel) {
      inp.value = channel;
      saveBtn.classList.add('hidden');
      removeBtn.classList.remove('hidden');
      if (running) {
        statusEl.innerHTML = `<span style="color:var(--green)">🟢 ${i18n.t('dashboard.channelLive') || 'Live — chat connected automatically'}</span>`;
      } else {
        statusEl.innerHTML = `<span style="color:var(--text-muted)">⏳ ${i18n.t('dashboard.channelWaiting') || 'Channel connected — waiting for live stream (checked every 45s)'}</span>`;
      }
    } else {
      statusEl.innerHTML = '';
      saveBtn.classList.remove('hidden');
      removeBtn.classList.add('hidden');
    }

    setStatus(running, running ? (i18n.t('dashboard.statusLive') || 'Live') : (i18n.t('dashboard.statusWaiting') || 'Waiting'));

    if (data.data.stats) {
      msgCount = data.data.stats.totalMessages || 0;
      scCount = data.data.stats.superChats || 0;
      memCount = data.data.stats.memberships || 0;
      if (data.data.stats.startedAt) startedAt = new Date(data.data.stats.startedAt);
      updateStats();
    }
  }

  window.saveChannel = async function () {
    const channel = document.getElementById('channelInput').value.trim();
    if (!channel) { toast(i18n.t('dashboard.channelEnterInfo') || 'Enter channel info', 'error'); return; }
    const btn = document.getElementById('btnSaveChannel');
    btn.disabled = true; btn.textContent = '⏳...';
    const data = await api('/api/channel', 'POST', { channel });
    toast(data.success ? data.message : data.error, data.success ? 'success' : 'error');
    btn.disabled = false; btn.textContent = i18n.t('dashboard.channelConnect') || 'Connect';
    loadChannelStatus();
  };

  window.removeChannel = async function () {
    if (!confirm(i18n.t('dashboard.channelRemoveConfirm') || 'Channel will be disconnected. Continue?')) return;
    const data = await api('/api/channel', 'DELETE');
    toast(data.success ? (i18n.t('dashboard.channelRemoved') || 'Channel removed') : data.error, data.success ? 'success' : 'error');
    document.getElementById('channelInput').value = '';
    loadChannelStatus();
  };

  window.startChat = async function () {
    const videoId = document.getElementById('videoIdInput').value.trim();
    if (!videoId) { toast(i18n.t('dashboard.manualEnterVideoId') || 'Enter video ID', 'error'); return; }

    document.getElementById('btnManualStart').disabled = true;
    const data = await api('/api/chat/start', 'POST', { videoId });
    if (data.success) {
      toast(i18n.t('dashboard.chatStarted') || 'Chat started!', 'success');
      startedAt = new Date(); msgCount = 0; scCount = 0; memCount = 0; updateStats(); startUptime();
    } else {
      toast(data.error, 'error');
    }
    document.getElementById('btnManualStart').disabled = false;
  };

  window.stopChat = async function () {
    const data = await api('/api/chat/stop', 'POST');
    if (data.success) toast(i18n.t('dashboard.chatStopped') || 'Chat stopped', 'success');
  };

  function setStatus(running, message) {
    isRunning = running;
    const pill = document.getElementById('statusPill');
    const txt = document.getElementById('statusText');
    pill.className = 'status-pill' + (running ? ' live' : '');
    txt.textContent = message || (running ? (i18n.t('dashboard.statusLive') || 'Live') : (i18n.t('dashboard.statusWaiting') || 'Waiting'));
    document.getElementById('btnManualStart').disabled = running;
    document.getElementById('btnStop').disabled = !running;
    if (running) startUptime(); else stopUptime();
  }

  function updateStats() {
    document.getElementById('statMsgs').textContent = fmtNum(msgCount);
    document.getElementById('statSC').textContent = fmtNum(scCount);
    document.getElementById('statMem').textContent = fmtNum(memCount);
  }

  function startUptime() {
    stopUptime();
    if (!startedAt) startedAt = new Date();
    uptimeInterval = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
      document.getElementById('statUptime').textContent = `${pad(h)}:${pad(m)}:${pad(s%60)}`;
    }, 1000);
  }
  function stopUptime() { if (uptimeInterval) { clearInterval(uptimeInterval); uptimeInterval = null; } }

  const chatEl = document.getElementById('chatMessages');

  function addMessage(msg) {
    document.getElementById('chatEmpty').style.display = 'none';
    const el = document.createElement('div');
    el.className = `msg ${msg.type || 'normal'}`;

    let html = '';
    if (msg.author.thumbnail) html += `<img class="msg-avatar" src="${msg.author.thumbnail}" alt="" onerror="this.style.display='none'" />`;
    html += '<div class="msg-content">';
    if (msg.type === 'superchat' && msg.superchat) html += `<span class="msg-badge-label" style="background:#FFD93D;color:#000">💰 ${esc(msg.superchat.amount)}</span>`;
    if (msg.type === 'membership') html += `<span class="msg-badge-label" style="background:#00D68F">🎉 ${i18n.t('dashboard.membership') || 'Membership'}</span>`;

    const ac = msg.author.badge ? msg.author.badge.type : 'normal';
    html += `<span class="msg-author ${ac}">${esc(msg.author.name)}</span> `;
    if (msg.timestamp) {
      const t = new Date(msg.timestamp);
      html += `<span class="msg-time">${t.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span> `;
    }
    html += `<span class="msg-text">${msg.message}</span>`;
    html += '</div>';
    el.innerHTML = html;
    chatEl.appendChild(el);
    while (chatEl.children.length > 201) chatEl.children[1]?.remove();
  }

  window.clearChat = function () {
    chatEl.innerHTML = `<div class="empty-state" id="chatEmpty"><div class="icon">💬</div><p>${i18n.t('dashboard.chatWaiting') || 'Waiting for chat...'}</p></div>`;
  };
  function scrollChat() { chatEl.scrollTop = chatEl.scrollHeight; }

  window.showTab = function (tab) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    document.getElementById('tab-' + tab)?.classList.add('active');
    document.querySelectorAll('.sidebar-nav a').forEach(a => { if (a.getAttribute('onclick')?.includes(tab)) a.classList.add('active'); });
    const titleKeys = {
      chat: 'dashboard.tabChat',
      overlay: 'dashboard.tabOverlay',
      analytics: 'dashboard.tabAnalytics',
      notifications: 'dashboard.tabNotifications',
      settings: 'dashboard.tabSettings'
    };
    const fallback = { chat:'Chat', overlay:'Overlay', analytics:'Statistics', notifications:'Notifications', settings:'Settings' };
    document.getElementById('pageTitle').textContent = i18n.t(titleKeys[tab]) || fallback[tab] || '';
    if (tab === 'overlay') loadOverlaySettings();
    if (tab === 'analytics') loadAnalytics();
    if (tab === 'notifications') loadNotifications();
    if (tab === 'settings') loadSettings();
  };

  async function loadOverlaySettings() {
    const d = await api('/api/overlay/token');
    if (d.success) document.getElementById('overlayUrl').value = d.data.url;
    const s = await api('/api/overlay/settings');
    if (s.success) {
      const o = s.data;
      document.getElementById('setTheme').value = o.theme || 'default';
      document.getElementById('setFontSize').value = o.font_size || 14;
      document.getElementById('setMaxMsgs').value = o.max_messages || 50;
      document.getElementById('setFadeTime').value = o.fade_time || 60;
      document.getElementById('setBgOpacity').value = o.bg_opacity || 0.55;
      document.getElementById('setPosition').value = o.position || 'bottom-left';
      document.getElementById('setAvatars').checked = !!o.show_avatars;
      document.getElementById('setBadges').checked = !!o.show_badges;
      document.getElementById('setTimestamps').checked = !!o.show_timestamps;
      document.getElementById('setCustomCss').value = o.custom_css || '';
    }
  }

  window.saveOverlaySettings = async function () {
    const d = await api('/api/overlay/settings', 'POST', {
      theme: document.getElementById('setTheme').value,
      fontSize: parseInt(document.getElementById('setFontSize').value),
      maxMessages: parseInt(document.getElementById('setMaxMsgs').value),
      fadeTime: parseInt(document.getElementById('setFadeTime').value),
      bgOpacity: parseFloat(document.getElementById('setBgOpacity').value),
      position: document.getElementById('setPosition').value,
      showAvatars: document.getElementById('setAvatars').checked,
      showBadges: document.getElementById('setBadges').checked,
      showTimestamps: document.getElementById('setTimestamps').checked,
      customCss: document.getElementById('setCustomCss').value,
    });
    toast(d.success ? (i18n.t('dashboard.settingsSaved') || 'Settings saved') : d.error, d.success ? 'success' : 'error');
  };

  window.copyUrl = function () {
    navigator.clipboard.writeText(document.getElementById('overlayUrl').value).then(() => toast(i18n.t('dashboard.urlCopied') || 'URL copied!', 'success'));
  };

  window.regenerateToken = async function () {
    if (!confirm(i18n.t('dashboard.regenerateConfirm') || 'Token will be regenerated. You will need to update OBS URL. Continue?')) return;
    const d = await api('/api/overlay/token/regenerate', 'POST');
    if (d.success) { document.getElementById('overlayUrl').value = d.data.url; toast(i18n.t('dashboard.tokenRegenerated') || 'Token regenerated', 'success'); }
  };

  async function loadAnalytics() {
    const d = await api('/api/sessions');
    if (!d.success) return;
    const { sessions, stats } = d.data;
    document.getElementById('totalSessions').textContent = stats?.total_sessions || 0;
    document.getElementById('totalMsgs').textContent = fmtNum(stats?.total_messages || 0);
    document.getElementById('totalSC').textContent = fmtNum(stats?.total_super_chats || 0);
    document.getElementById('totalMem').textContent = fmtNum(stats?.total_memberships || 0);
    document.getElementById('sessionsTable').innerHTML = sessions.map(s => `<tr>
      <td class="truncate" style="max-width:120px">${esc(s.video_id)}</td>
      <td><span class="badge ${s.status==='active'?'badge-active':'badge-inactive'}">${s.status}</span></td>
      <td>${s.total_messages}</td><td>${s.super_chats}</td>
      <td class="text-sm">${new Date(s.started_at).toLocaleString()}</td>
      <td class="text-sm">${s.ended_at ? new Date(s.ended_at).toLocaleString() : '-'}</td>
    </tr>`).join('');
  }

  async function loadNotifications() {
    const d = await api('/api/notifications');
    if (!d.success) return;
    const { notifications, unreadCount } = d.data;
    const badge = document.getElementById('notifBadge');
    if (unreadCount > 0) { badge.textContent = unreadCount; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');

    const c = document.getElementById('notifList');
    if (!notifications.length) { c.innerHTML = `<div class="empty-state"><div class="icon">🔔</div><p>${i18n.t('dashboard.notifEmpty') || 'No notifications'}</p></div>`; return; }
    const icons = { chat_ended:'⚠️', chat_error:'❌', plan_changed:'💎', info:'ℹ️', chat_started:'🟢' };
    c.innerHTML = notifications.map(n => `<div class="notif-item ${n.is_read?'':'unread'}">
      <div class="notif-icon">${icons[n.type]||'ℹ️'}</div>
      <div class="notif-text"><div class="notif-title">${esc(n.title)}</div>
        <div class="notif-msg">${esc(n.message)}</div>
        <div class="notif-time">${new Date(n.created_at).toLocaleString()}</div></div>
    </div>`).join('');
  }

  window.markAllRead = async function () { await api('/api/notifications/read', 'POST'); loadNotifications(); toast(i18n.t('dashboard.notifMarkedRead') || 'Marked as read', 'success'); };

  async function loadSettings() {
    const d = await api('/api/profile');
    if (d.success) document.getElementById('setUsername').value = d.data.username || '';
    initLangSelector();
  }

  window.saveProfile = async function () {
    const d = await api('/api/profile', 'PUT', { username: document.getElementById('setUsername').value });
    toast(d.success ? (i18n.t('dashboard.profileUpdated') || 'Profile updated') : d.error, d.success ? 'success' : 'error');
    if (d.success) {
      const u = JSON.parse(localStorage.getItem('user')||'{}');
      u.username = document.getElementById('setUsername').value;
      localStorage.setItem('user', JSON.stringify(u));
      document.getElementById('userName').textContent = u.username;
    }
  };

  window.changePassword = async function () {
    const d = await api('/auth/change-password', 'POST', {
      currentPassword: document.getElementById('currentPass').value,
      newPassword: document.getElementById('newPass').value,
    });
    toast(d.success ? (i18n.t('dashboard.passwordChanged') || 'Password changed') : d.error, d.success ? 'success' : 'error');
    if (d.success) { document.getElementById('currentPass').value = ''; document.getElementById('newPass').value = ''; }
  };

  window.logout = function () {
    localStorage.clear();
    document.cookie = 'token=;path=/;max-age=0';
    window.location.href = '/login';
  };

  function toast(msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`; el.textContent = msg; c.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3500);
  }

  function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  function fmtNum(n) { if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return n.toString(); }
  function pad(n) { return n.toString().padStart(2, '0'); }

  document.getElementById('videoIdInput').addEventListener('keypress', e => { if (e.key === 'Enter' && !isRunning) window.startChat(); });
  document.getElementById('channelInput').addEventListener('keypress', e => { if (e.key === 'Enter') window.saveChannel(); });

  loadChannelStatus();
  loadNotifications();
})();
