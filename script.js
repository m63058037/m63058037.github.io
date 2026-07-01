const API_URL = 'api.php';

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
  
  const formData = new URLSearchParams(data);
  
  try {
    const response = await fetch(`${API_URL}?action=${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    return { success: false, message: '网络错误' };
  }
}

async function apiGetRequest(action, params = {}) {
  const sessionId = getSessionId();
  const urlParams = new URLSearchParams({ ...params, sessionId });
  try {
    const response = await fetch(`${API_URL}?action=${action}&${urlParams.toString()}`);
    const result = await response.json();
    return result;
  } catch (error) {
    return { success: false, message: '网络错误' };
  }
}

async function login(uid, password) {
  const result = await apiRequest('login', { uid, password });
  
  if (result.success) {
    currentUser = result.data;
    setSessionId(result.data.sessionId);
  }
  
  return result;
}

async function register(uid, name, password, avatar) {
  const result = await apiRequest('register', { uid, name, password, avatar });
  
  if (result.success) {
    currentUser = result.data;
    setSessionId(result.data.sessionId);
  }
  
  return result;
}

async function logout() {
  const result = await apiRequest('logout');
  removeSessionId();
  currentUser = null;
  return result;
}

async function getCurrentUser() {
  if (currentUser) return currentUser;
  
  const result = await apiRequest('getCurrentUser');
  if (result.success) {
    currentUser = result.data;
  }
  return result.success ? result.data : null;
}

async function createPost(content, image) {
  return await apiRequest('createPost', { content, image });
}

async function getPosts() {
  const result = await apiGetRequest('getPosts');
  return result.success ? result.data : [];
}

async function getUserByUid(uid) {
  const result = await apiGetRequest('searchUsers', { query: uid });
  if (result.success) {
    return result.data.find(u => u.uid === uid);
  }
  return null;
}

async function searchUsers(query) {
  const result = await apiGetRequest('searchUsers', { query });
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
  const result = await apiGetRequest('getMessages', { friendId });
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

async function updateUserProfile(name, avatar) {
  const result = await apiRequest('updateProfile', { name, avatar });
  if (result.success) {
    currentUser = result.data;
  }
  return result;
}

async function changePassword(newPassword) {
  return await apiRequest('changePassword', { newPassword });
}

function isMuted(user) {
  if (!user) return false;
  if (!user.muteUntil) return false;
  return Date.now() / 1000 < user.muteUntil;
}

function formatDate(timestamp) {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) {
    return '刚刚';
  } else if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`;
  } else if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`;
  } else if (diff < 604800000) {
    return `${Math.floor(diff / 86400000)}天前`;
  } else {
    return date.toLocaleDateString('zh-CN');
  }
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function initStars() {
  const container = document.createElement('div');
  container.className = 'stars-container';
  document.body.appendChild(container);
  
  const starCount = 80;
  
  for (let i = 0; i < starCount; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    
    const size = Math.random() * 2 + 1;
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    
    const duration = Math.random() * 3 + 2;
    star.style.animationDuration = `${duration}s`;
    
    const delay = Math.random() * 5;
    star.style.animationDelay = `${delay}s`;
    
    container.appendChild(star);
  }
}

function initApp() {
  initStars();
  
  const menuBtn = document.getElementById('menu-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const sidebarClose = document.getElementById('sidebar-close');
  
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      sidebar.classList.add('open');
      overlay.classList.add('active');
    });
  }
  
  if (sidebarClose) {
    sidebarClose.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
  }
  
  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
  }
  
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logout();
      window.location.href = 'index.html';
    });
  }
}

document.addEventListener('DOMContentLoaded', initApp);