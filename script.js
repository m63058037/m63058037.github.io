const API_URL = '/api';

const AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Bailey',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Bella',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Daisy',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Ethan',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Emma',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Frank',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Grace',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Henry'
];

let currentUser = null;

function getSessionId() {
  return localStorage.getItem('forum_session_id') || '';
}

function setSessionId(sessionId) {
  localStorage.setItem('forum_session_id', sessionId);
}

function removeSessionId() {
  localStorage.removeItem('forum_session_id');
}

async function apiRequest(action, data = {}) {
  const sessionId = getSessionId();
  if (sessionId) {
    data.sessionId = sessionId;
  }
  
  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || 
                  hostname === '127.0.0.1' || 
                  hostname.startsWith('192.168.') || 
                  hostname.startsWith('10.') || 
                  hostname.startsWith('172.');
  
  if (isLocal) {
    return await phpApiRequest(action, data);
  } else {
    return await supabaseApiRequest(action, data);
  }
}

async function phpApiRequest(action, data = {}) {
  const requestData = { action, ...data };
  
  try {
    const response = await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });
    
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      result = { success: false, message: '服务器响应错误' };
    }
    
    return { success: result.success, data: result.data || [], message: result.message || '' };
  } catch (error) {
    return { success: false, message: '网络错误' };
  }
}

async function supabaseApiRequest(action, data = {}) {
  const supabaseActions = {
    login: async (d) => {
      const result = await fetch('/api/users?uid=eq.' + d.uid, { method: 'GET' });
      const json = await result.json();
      if (!result.ok || json.length === 0) {
        return { success: false, message: 'UID不存在' };
      }
      const user = json[0];
      if (user.is_banned === 1) {
        return { success: false, message: '账户已被封禁' };
      }
      if (user.password !== hashPassword(d.password)) {
        return { success: false, message: '密码错误' };
      }
      const sessionId = generateId();
      setSessionId(sessionId);
      localStorage.setItem('forum_user', JSON.stringify({
        uid: user.uid,
        name: user.name,
        avatar: user.avatar,
        created_at: user.created_at,
        is_admin: user.is_admin,
        sessionId
      }));
      return { success: true, data: { uid: user.uid, name: user.name, avatar: user.avatar, created_at: user.created_at, is_admin: user.is_admin, sessionId } };
    },
    register: async (d) => {
      if (!/^\d{8}$/.test(d.uid)) {
        return { success: false, message: 'UID必须是8位数字' };
      }
      const checkResult = await fetch('/api/users?uid=eq.' + d.uid, { method: 'GET' });
      const checkJson = await checkResult.json();
      if (checkResult.ok && checkJson.length > 0) {
        return { success: false, message: 'UID已被使用' };
      }
      const result = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: d.uid,
          name: d.name,
          password: hashPassword(d.password),
          avatar: d.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + d.name,
          created_at: Math.floor(Date.now() / 1000),
          is_admin: 0
        })
      });
      const isSuccess = result.status >= 200 && result.status < 300;
      if (isSuccess) {
        const sessionId = generateId();
        setSessionId(sessionId);
        localStorage.setItem('forum_user', JSON.stringify({
          uid: d.uid,
          name: d.name,
          avatar: d.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + d.name,
          created_at: Math.floor(Date.now() / 1000),
          is_admin: 0,
          sessionId
        }));
        return { success: true, data: { uid: d.uid, name: d.name, avatar: d.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + d.name, created_at: Math.floor(Date.now() / 1000), is_admin: 0, sessionId } };
      }
      return { success: false, message: '注册失败' };
    },
    createPost: async (d) => {
      const user = await getCurrentUser();
      if (!user) return { success: false, message: '请先登录' };
      const postId = generateId();
      const result = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: postId,
          author_uid: user.uid,
          content: d.content,
          image: d.image || null,
          created_at: Math.floor(Date.now() / 1000)
        })
      });
      const isSuccess = result.status >= 200 && result.status < 300;
      return { success: isSuccess, message: isSuccess ? '' : '发帖失败' };
    },
    getPosts: async () => {
      const result = await fetch('/api/posts?order=created_at.desc', { method: 'GET' });
      if (!result.ok) return { success: false, data: [] };
      const posts = await result.json();
      const enrichedPosts = [];
      for (const post of posts) {
        const authorResult = await fetch('/api/users?uid=eq.' + post.author_uid, { method: 'GET' });
        const authorJson = await authorResult.json();
        const author = authorResult.ok && authorJson.length > 0 ? authorJson[0] : null;
        enrichedPosts.push({
          id: post.id,
          author_uid: post.author_uid,
          content: post.content,
          image: post.image,
          created_at: post.created_at,
          author_name: author ? author.name : '未知用户',
          author_avatar: author ? author.avatar : AVATARS[0]
        });
      }
      return { success: true, data: enrichedPosts };
    },
    searchUsers: async (d) => {
      const user = await getCurrentUser();
      if (!user) return { success: false, data: [] };
      const result = await fetch('/api/users?uid=neq.' + user.uid, { method: 'GET' });
      if (!result.ok) return { success: false, data: [] };
      const users = await result.json();
      const query = d.query || '';
      const filtered = users.filter(u => 
        u.name.toLowerCase().includes(query.toLowerCase()) || 
        u.uid.includes(query)
      );
      return { success: true, data: filtered };
    },
    sendFriendRequest: async (d) => {
      const user = await getCurrentUser();
      if (!user) return { success: false, message: '请先登录' };
      const result1 = await fetch('/api/friendships?user_id=eq.' + user.uid + '&friend_id=eq.' + d.friendId, { method: 'GET' });
      const result2 = await fetch('/api/friendships?user_id=eq.' + d.friendId + '&friend_id=eq.' + user.uid, { method: 'GET' });
      const json1 = await result1.json();
      const json2 = await result2.json();
      if ((result1.ok && json1.length > 0) || (result2.ok && json2.length > 0)) {
        return { success: false, message: '好友关系已存在或请求已发送' };
      }
      const friendshipId = generateId();
      const result = await fetch('/api/friendships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: friendshipId,
          user_id: user.uid,
          friend_id: d.friendId,
          is_accepted: 0,
          created_at: Math.floor(Date.now() / 1000)
        })
      });
      const isSuccess = result.status >= 200 && result.status < 300;
      return { success: isSuccess, message: isSuccess ? '' : '发送失败' };
    },
    acceptFriendRequest: async (d) => {
      const result = await fetch('/api/friendships?id=eq.' + d.friendshipId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_accepted: 1 })
      });
      const isSuccess = result.status >= 200 && result.status < 300;
      return { success: isSuccess, message: isSuccess ? '' : '操作失败' };
    },
    deleteFriend: async (d) => {
      const user = await getCurrentUser();
      if (!user) return { success: false, message: '请先登录' };
      const result1 = await fetch('/api/friendships?user_id=eq.' + user.uid + '&friend_id=eq.' + d.friendId, { method: 'GET' });
      const result2 = await fetch('/api/friendships?user_id=eq.' + d.friendId + '&friend_id=eq.' + user.uid, { method: 'GET' });
      const json1 = await result1.json();
      const json2 = await result2.json();
      let friendshipId = null;
      if (result1.ok && json1.length > 0) friendshipId = json1[0].id;
      else if (result2.ok && json2.length > 0) friendshipId = json2[0].id;
      if (!friendshipId) {
        return { success: false, message: '好友关系不存在' };
      }
      const result = await fetch('/api/friendships?id=eq.' + friendshipId, { method: 'DELETE' });
      const isSuccess = result.status >= 200 && result.status < 300;
      return { success: isSuccess, message: isSuccess ? '' : '操作失败' };
    },
    getFriends: async () => {
      const user = await getCurrentUser();
      if (!user) return { success: false, data: [] };
      const result1 = await fetch('/api/friendships?user_id=eq.' + user.uid + '&is_accepted=eq.1', { method: 'GET' });
      const result2 = await fetch('/api/friendships?friend_id=eq.' + user.uid + '&is_accepted=eq.1', { method: 'GET' });
      const json1 = await result1.json();
      const json2 = await result2.json();
      const allFriendships = [];
      if (result1.ok) allFriendships.push(...json1);
      if (result2.ok) allFriendships.push(...json2);
      const friends = [];
      for (const friendship of allFriendships) {
        const friendUid = friendship.user_id === user.uid ? friendship.friend_id : friendship.user_id;
        const friendResult = await fetch('/api/users?uid=eq.' + friendUid, { method: 'GET' });
        const friendJson = await friendResult.json();
        if (friendResult.ok && friendJson.length > 0) {
          friends.push(friendJson[0]);
        }
      }
      return { success: true, data: friends };
    },
    getFriendRequests: async () => {
      const user = await getCurrentUser();
      if (!user) return { success: false, data: [] };
      const result = await fetch('/api/friendships?friend_id=eq.' + user.uid + '&is_accepted=eq.0', { method: 'GET' });
      if (!result.ok) return { success: false, data: [] };
      const requests = await result.json();
      const enriched = [];
      for (const request of requests) {
        const requesterResult = await fetch('/api/users?uid=eq.' + request.user_id, { method: 'GET' });
        const requesterJson = await requesterResult.json();
        if (requesterResult.ok && requesterJson.length > 0) {
          const requester = requesterJson[0];
          enriched.push({
            id: request.id,
            created_at: request.created_at,
            requester_uid: requester.uid,
            requester_name: requester.name,
            requester_avatar: requester.avatar
          });
        }
      }
      return { success: true, data: enriched };
    },
    sendMessage: async (d) => {
      const user = await getCurrentUser();
      if (!user) return { success: false, message: '请先登录' };
      const messageId = generateId();
      const result = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: messageId,
          sender_uid: user.uid,
          receiver_uid: d.receiverUid,
          content: d.content,
          created_at: Math.floor(Date.now() / 1000)
        })
      });
      const isSuccess = result.status >= 200 && result.status < 300;
      return { success: isSuccess, message: isSuccess ? '' : '发送失败' };
    },
    getMessages: async (d) => {
      const user = await getCurrentUser();
      if (!user) return { success: false, data: [] };
      const friendId = d.friendId;
      const result1 = await fetch('/api/messages?sender_uid=eq.' + user.uid + '&receiver_uid=eq.' + friendId + '&order=created_at.asc', { method: 'GET' });
      const result2 = await fetch('/api/messages?sender_uid=eq.' + friendId + '&receiver_uid=eq.' + user.uid + '&order=created_at.asc', { method: 'GET' });
      const json1 = await result1.json();
      const json2 = await result2.json();
      const messages = [];
      if (result1.ok) messages.push(...json1);
      if (result2.ok) messages.push(...json2);
      return { success: true, data: messages.sort((a, b) => a.created_at - b.created_at) };
    },
    updateProfile: async (d) => {
      const user = await getCurrentUser();
      if (!user) return { success: false, message: '请先登录' };
      const result = await fetch('/api/users?uid=eq.' + user.uid, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: d.name, avatar: d.avatar })
      });
      const isSuccess = result.status >= 200 && result.status < 300;
      if (isSuccess) {
        user.name = d.name;
        user.avatar = d.avatar;
        localStorage.setItem('forum_user', JSON.stringify(user));
      }
      return { success: isSuccess, message: isSuccess ? '' : '更新失败' };
    },
    changePassword: async (d) => {
      const user = await getCurrentUser();
      if (!user) return { success: false, message: '请先登录' };
      const checkResult = await fetch('/api/users?uid=eq.' + user.uid, { method: 'GET' });
      const checkJson = await checkResult.json();
      if (!checkResult.ok || checkJson.length === 0) {
        return { success: false, message: '用户不存在' };
      }
      if (checkJson[0].password !== hashPassword(d.oldPassword)) {
        return { success: false, message: '旧密码错误' };
      }
      const result = await fetch('/api/users?uid=eq.' + user.uid, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: hashPassword(d.newPassword) })
      });
      const isSuccess = result.status >= 200 && result.status < 300;
      return { success: isSuccess, message: isSuccess ? '' : '修改失败' };
    },
    sendPasswordRequest: async (d) => {
      const checkResult = await fetch('/api/users?uid=eq.' + d.uid, { method: 'GET' });
      const checkJson = await checkResult.json();
      if (!checkResult.ok || checkJson.length === 0) {
        return { success: false, message: 'UID不存在' };
      }
      const requestCheck = await fetch('/api/password_requests?uid=eq.' + d.uid + '&status=eq.pending', { method: 'GET' });
      const requestJson = await requestCheck.json();
      if (requestCheck.ok && requestJson.length > 0) {
        return { success: false, message: '已有待处理的请求' };
      }
      const requestId = generateId();
      const result = await fetch('/api/password_requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: requestId,
          uid: d.uid,
          status: 'pending',
          created_at: Math.floor(Date.now() / 1000)
        })
      });
      const isSuccess = result.status >= 200 && result.status < 300;
      return { success: isSuccess, message: isSuccess ? '' : '提交失败' };
    },
    getPasswordRequests: async () => {
      const user = await getCurrentUser();
      if (!user || !user.is_admin) return { success: false, data: [] };
      const result = await fetch('/api/password_requests?order=created_at.desc', { method: 'GET' });
      if (!result.ok) return { success: false, data: [] };
      const requests = await result.json();
      const enriched = [];
      for (const request of requests) {
        const userResult = await fetch('/api/users?uid=eq.' + request.uid, { method: 'GET' });
        const userJson = await userResult.json();
        const userName = userResult.ok && userJson.length > 0 ? userJson[0].name : '未知用户';
        enriched.push({
          id: request.id,
          uid: request.uid,
          status: request.status,
          created_at: request.created_at,
          name: userName
        });
      }
      return { success: true, data: enriched };
    },
    handlePasswordRequest: async (d) => {
      const user = await getCurrentUser();
      if (!user || !user.is_admin) return { success: false, message: '需要管理员权限' };
      const status = d.action === 'approve' ? 'approved' : 'ignored';
      const result = await fetch('/api/password_requests?id=eq.' + d.requestId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const isSuccess = result.status >= 200 && result.status < 300;
      return { success: isSuccess, message: isSuccess ? '' : '操作失败' };
    },
    banUser: async (d) => {
      const user = await getCurrentUser();
      if (!user || !user.is_admin) return { success: false, message: '需要管理员权限' };
      const result = await fetch('/api/users?uid=eq.' + d.uid, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_banned: 1 })
      });
      const isSuccess = result.status >= 200 && result.status < 300;
      return { success: isSuccess, message: isSuccess ? '' : '操作失败' };
    },
    unbanUser: async (d) => {
      const user = await getCurrentUser();
      if (!user || !user.is_admin) return { success: false, message: '需要管理员权限' };
      const result = await fetch('/api/users?uid=eq.' + d.uid, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_banned: 0 })
      });
      const isSuccess = result.status >= 200 && result.status < 300;
      return { success: isSuccess, message: isSuccess ? '' : '操作失败' };
    },
    muteUser: async (d) => {
      const user = await getCurrentUser();
      if (!user || !user.is_admin) return { success: false, message: '需要管理员权限' };
      const seconds = {
        '1m': 60, '5m': 300, '1h': 3600, '1d': 86400, '3d': 259200, '1w': 604800
      }[d.duration] || 3600;
      const muteUntil = Math.floor(Date.now() / 1000) + seconds;
      const result = await fetch('/api/users?uid=eq.' + d.uid, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mute_until: muteUntil })
      });
      const isSuccess = result.status >= 200 && result.status < 300;
      return { success: isSuccess, message: isSuccess ? '' : '操作失败' };
    },
    unmuteUser: async (d) => {
      const user = await getCurrentUser();
      if (!user || !user.is_admin) return { success: false, message: '需要管理员权限' };
      const result = await fetch('/api/users?uid=eq.' + d.uid, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mute_until: null })
      });
      const isSuccess = result.status >= 200 && result.status < 300;
      return { success: isSuccess, message: isSuccess ? '' : '操作失败' };
    },
    getUsers: async () => {
      const user = await getCurrentUser();
      if (!user || !user.is_admin) return { success: false, data: [] };
      const result = await fetch('/api/users?order=created_at.desc', { method: 'GET' });
      if (!result.ok) return { success: false, data: [] };
      return { success: true, data: await result.json() };
    },
    logout: async () => {
      removeSessionId();
      localStorage.removeItem('forum_user');
      return { success: true };
    }
  };
  
  if (supabaseActions[action]) {
    return await supabaseActions[action](data);
  }
  return { success: false, message: '未知操作' };
}

async function login(uid, password) {
  return await apiRequest('login', { uid, password });
}

async function register(uid, name, password, avatar) {
  if (!avatar) {
    avatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + name;
  }
  return await apiRequest('register', { uid, name, password, avatar });
}

async function logout() {
  return await apiRequest('logout');
}

async function getCurrentUser() {
  const userStr = localStorage.getItem('forum_user');
  if (userStr) {
    return JSON.parse(userStr);
  }
  return null;
}

function hashPassword(password) {
  return password.split('').reduce((acc, char) => {
    acc = ((acc << 5) - acc) + char.charCodeAt(0);
    return acc & acc;
  }, 0).toString(16).padStart(32, '0');
}

function generateId() {
  return Math.random().toString(36).substring(2, 30);
}

async function createPost(content, image) {
  return await apiRequest('createPost', { content, image });
}

async function getPosts() {
  const result = await apiRequest('getPosts');
  return result.success ? result.data : [];
}

async function getUserByUid(uid) {
  const result = await apiRequest('searchUsers', { query: uid });
  if (result.success) {
    return result.data.find(u => u.uid === uid) || null;
  }
  return null;
}

async function searchUsers(query) {
  const result = await apiRequest('searchUsers', { query });
  return result.success ? result.data : [];
}

async function sendFriendRequest(friendId) {
  return await apiRequest('sendFriendRequest', { friendId });
}

async function acceptFriendRequest(friendshipId) {
  return await apiRequest('acceptFriendRequest', { friendshipId });
}

async function deleteFriend(friendId) {
  return await apiRequest('deleteFriend', { friendId });
}

async function getFriends() {
  const result = await apiRequest('getFriends');
  return result.success ? result.data : [];
}

async function getFriendRequests() {
  const result = await apiRequest('getFriendRequests');
  return result.success ? result.data : [];
}

async function sendMessage(receiverUid, content) {
  return await apiRequest('sendMessage', { receiverUid, content });
}

async function getMessages(friendId) {
  const result = await apiRequest('getMessages', { friendId });
  return result.success ? result.data : [];
}

async function sendPasswordRequest(uid) {
  return await apiRequest('sendPasswordRequest', { uid });
}

async function getPasswordRequests() {
  const result = await apiRequest('getPasswordRequests');
  return result.success ? result.data : [];
}

async function handlePasswordRequest(requestId, action) {
  return await apiRequest('handlePasswordRequest', { requestId, action });
}

async function banUser(uid) {
  return await apiRequest('banUser', { uid });
}

async function unbanUser(uid) {
  return await apiRequest('unbanUser', { uid });
}

async function muteUser(uid, duration) {
  return await apiRequest('muteUser', { uid, duration });
}

async function unmuteUser(uid) {
  return await apiRequest('unmuteUser', { uid });
}

async function getUsers() {
  const result = await apiRequest('getUsers');
  return result.success ? result.data : [];
}

async function updateProfile(name, avatar) {
  return await apiRequest('updateProfile', { name, avatar });
}

async function changePassword(oldPassword, newPassword) {
  return await apiRequest('changePassword', { oldPassword, newPassword });
}

function isMuted(user) {
  if (!user || !user.mute_until) return false;
  return user.mute_until > Math.floor(Date.now() / 1000);
}

function formatDate(timestamp) {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  
  return `${month}月${day}日 ${hour}:${minute}`;
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

function createStars() {
  const container = document.createElement('div');
  container.className = 'stars-container';
  document.body.appendChild(container);
  
  const starCount = 100;
  for (let i = 0; i < starCount; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    const size = Math.random() * 3 + 1;
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.animationDelay = `${Math.random() * 5}s`;
    star.style.animationDuration = `${Math.random() * 3 + 2}s`;
    container.appendChild(star);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  createStars();
  const menuBtn = document.getElementById('menu-btn');
  const sidebar = document.getElementById('sidebar');
  const sidebarClose = document.getElementById('sidebar-close');
  const overlay = document.getElementById('overlay');
  const logoutBtn = document.getElementById('logout-btn');
  
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => {
      sidebar.classList.add('open');
      if (overlay) overlay.classList.add('active');
    });
  }
  
  if (sidebarClose && sidebar) {
    sidebarClose.addEventListener('click', () => {
      sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('active');
    });
  }
  
  if (overlay && sidebar) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
  }
  
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await logout();
      window.location.href = 'index.html';
    });
  }
});
