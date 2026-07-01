const STORAGE_KEYS = {
  USERS: 'forum_users',
  POSTS: 'forum_posts',
  FRIENDSHIPS: 'forum_friendships',
  MESSAGES: 'forum_messages',
  PASSWORD_REQUESTS: 'forum_password_requests',
  CURRENT_USER: 'forum_current_user'
};

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

function hashPassword(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function getStorage(key, defaultValue = []) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function initAdminAccount() {
  const users = getStorage(STORAGE_KEYS.USERS);
  const adminExists = users.some(user => user.uid === '10281028');
  
  if (!adminExists) {
    users.push({
      uid: '10281028',
      name: '管理员',
      password: hashPassword('zyz10281028'),
      avatar: AVATARS[0],
      createdAt: Date.now(),
      isBanned: false,
      muteUntil: null,
      isAdmin: true
    });
    setStorage(STORAGE_KEYS.USERS, users);
  }
}

function initSampleData() {
  initAdminAccount();
  
  const users = getStorage(STORAGE_KEYS.USERS);
  if (users.length === 1) {
    users.push({
      uid: '12345678',
      name: '快乐用户',
      password: hashPassword('12345678'),
      avatar: AVATARS[1],
      createdAt: Date.now() - 86400000,
      isBanned: false,
      muteUntil: null,
      isAdmin: false
    });
    users.push({
      uid: '87654321',
      name: '社区活跃者',
      password: hashPassword('87654321'),
      avatar: AVATARS[2],
      createdAt: Date.now() - 172800000,
      isBanned: false,
      muteUntil: null,
      isAdmin: false
    });
    setStorage(STORAGE_KEYS.USERS, users);
  }
  
  const posts = getStorage(STORAGE_KEYS.POSTS);
  if (posts.length === 0) {
    posts.push({
      id: generateId(),
      authorUid: '12345678',
      content: '欢迎来到快乐论坛！这里是一个友好的社区，大家可以分享生活、讨论话题。',
      image: null,
      createdAt: Date.now() - 86400000
    });
    posts.push({
      id: generateId(),
      authorUid: '87654321',
      content: '今天天气真好，阳光明媚，适合户外活动！',
      image: null,
      createdAt: Date.now() - 3600000
    });
    setStorage(STORAGE_KEYS.POSTS, posts);
  }
}

function login(uid, password) {
  const users = getStorage(STORAGE_KEYS.USERS);
  const user = users.find(u => u.uid === uid);
  
  if (!user) {
    return { success: false, message: 'UID不存在' };
  }
  
  if (user.isBanned) {
    return { success: false, message: '账户已被封禁' };
  }
  
  if (user.password !== hashPassword(password)) {
    return { success: false, message: '密码错误' };
  }
  
  setStorage(STORAGE_KEYS.CURRENT_USER, user);
  return { success: true, user };
}

function register(uid, name, password, avatar) {
  const users = getStorage(STORAGE_KEYS.USERS);
  
  if (!/^\d{8}$/.test(uid)) {
    return { success: false, message: 'UID必须是8位数字' };
  }
  
  if (users.some(u => u.uid === uid)) {
    return { success: false, message: 'UID已被使用' };
  }
  
  if (!name || name.length < 2) {
    return { success: false, message: '用户名至少2个字符' };
  }
  
  if (!password || password.length < 6) {
    return { success: false, message: '密码至少6个字符' };
  }
  
  const newUser = {
    uid,
    name,
    password: hashPassword(password),
    avatar: avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)],
    createdAt: Date.now(),
    isBanned: false,
    muteUntil: null,
    isAdmin: false
  };
  
  users.push(newUser);
  setStorage(STORAGE_KEYS.USERS, users);
  setStorage(STORAGE_KEYS.CURRENT_USER, newUser);
  
  return { success: true, user: newUser };
}

function getCurrentUser() {
  return getStorage(STORAGE_KEYS.CURRENT_USER, null);
}

function logout() {
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
}

function updateUserProfile(uid, name, avatar) {
  const users = getStorage(STORAGE_KEYS.USERS);
  const index = users.findIndex(u => u.uid === uid);
  
  if (index === -1) {
    return { success: false, message: '用户不存在' };
  }
  
  users[index].name = name;
  users[index].avatar = avatar;
  
  setStorage(STORAGE_KEYS.USERS, users);
  
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.uid === uid) {
    currentUser.name = name;
    currentUser.avatar = avatar;
    setStorage(STORAGE_KEYS.CURRENT_USER, currentUser);
  }
  
  return { success: true };
}

function changePassword(uid, newPassword) {
  const users = getStorage(STORAGE_KEYS.USERS);
  const index = users.findIndex(u => u.uid === uid);
  
  if (index === -1) {
    return { success: false, message: '用户不存在' };
  }
  
  if (!newPassword || newPassword.length < 6) {
    return { success: false, message: '密码至少6个字符' };
  }
  
  users[index].password = hashPassword(newPassword);
  setStorage(STORAGE_KEYS.USERS, users);
  
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.uid === uid) {
    currentUser.password = hashPassword(newPassword);
    setStorage(STORAGE_KEYS.CURRENT_USER, currentUser);
  }
  
  return { success: true };
}

function createPost(authorUid, content, image) {
  const posts = getStorage(STORAGE_KEYS.POSTS);
  
  if (!content || content.trim().length === 0) {
    return { success: false, message: '内容不能为空' };
  }
  
  const post = {
    id: generateId(),
    authorUid,
    content: content.trim(),
    image,
    createdAt: Date.now()
  };
  
  posts.unshift(post);
  setStorage(STORAGE_KEYS.POSTS, posts);
  
  return { success: true, post };
}

function getPosts() {
  return getStorage(STORAGE_KEYS.POSTS);
}

function getUserByUid(uid) {
  const users = getStorage(STORAGE_KEYS.USERS);
  return users.find(u => u.uid === uid);
}

function searchUsers(query) {
  const users = getStorage(STORAGE_KEYS.USERS);
  const currentUser = getCurrentUser();
  
  return users.filter(user => 
    user.uid !== currentUser?.uid &&
    (user.name.toLowerCase().includes(query.toLowerCase()) ||
     user.uid.includes(query))
  );
}

function sendFriendRequest(userId, friendId) {
  const friendships = getStorage(STORAGE_KEYS.FRIENDSHIPS);
  
  const existing = friendships.find(f => 
    (f.userId === userId && f.friendId === friendId) ||
    (f.userId === friendId && f.friendId === userId)
  );
  
  if (existing) {
    return { success: false, message: '好友关系已存在或请求已发送' };
  }
  
  friendships.push({
    id: generateId(),
    userId,
    friendId,
    isAccepted: false,
    createdAt: Date.now()
  });
  
  setStorage(STORAGE_KEYS.FRIENDSHIPS, friendships);
  return { success: true };
}

function acceptFriendRequest(friendshipId) {
  const friendships = getStorage(STORAGE_KEYS.FRIENDSHIPS);
  const index = friendships.findIndex(f => f.id === friendshipId);
  
  if (index === -1) {
    return { success: false, message: '请求不存在' };
  }
  
  friendships[index].isAccepted = true;
  setStorage(STORAGE_KEYS.FRIENDSHIPS, friendships);
  
  return { success: true };
}

function getFriends(userId) {
  const friendships = getStorage(STORAGE_KEYS.FRIENDSHIPS);
  const users = getStorage(STORAGE_KEYS.USERS);
  
  const friendIds = friendships
    .filter(f => (f.userId === userId || f.friendId === userId) && f.isAccepted)
    .map(f => f.userId === userId ? f.friendId : f.userId);
  
  return users.filter(u => friendIds.includes(u.uid));
}

function getFriendRequests(userId) {
  const friendships = getStorage(STORAGE_KEYS.FRIENDSHIPS);
  const users = getStorage(STORAGE_KEYS.USERS);
  
  const requests = friendships
    .filter(f => f.friendId === userId && !f.isAccepted);
  
  return requests.map(r => ({
    ...r,
    requester: users.find(u => u.uid === r.userId)
  }));
}

function sendMessage(senderUid, receiverUid, content) {
  const messages = getStorage(STORAGE_KEYS.MESSAGES);
  
  if (!content || content.trim().length === 0) {
    return { success: false, message: '消息不能为空' };
  }
  
  const message = {
    id: generateId(),
    senderUid,
    receiverUid,
    content: content.trim(),
    createdAt: Date.now()
  };
  
  messages.push(message);
  setStorage(STORAGE_KEYS.MESSAGES, messages);
  
  return { success: true, message };
}

function getMessages(userId, friendId) {
  const messages = getStorage(STORAGE_KEYS.MESSAGES);
  
  return messages.filter(m => 
    (m.senderUid === userId && m.receiverUid === friendId) ||
    (m.senderUid === friendId && m.receiverUid === userId)
  ).sort((a, b) => a.createdAt - b.createdAt);
}

function sendPasswordRequest(uid) {
  const users = getStorage(STORAGE_KEYS.USERS);
  const requests = getStorage(STORAGE_KEYS.PASSWORD_REQUESTS);
  
  if (!users.some(u => u.uid === uid)) {
    return { success: false, message: 'UID不存在' };
  }
  
  const existing = requests.find(r => r.uid === uid && r.status === 'pending');
  if (existing) {
    return { success: false, message: '已有待处理的请求' };
  }
  
  requests.push({
    id: generateId(),
    uid,
    status: 'pending',
    createdAt: Date.now()
  });
  
  setStorage(STORAGE_KEYS.PASSWORD_REQUESTS, requests);
  return { success: true };
}

function getPasswordRequests() {
  return getStorage(STORAGE_KEYS.PASSWORD_REQUESTS);
}

function handlePasswordRequest(requestId, action) {
  const requests = getStorage(STORAGE_KEYS.PASSWORD_REQUESTS);
  const index = requests.findIndex(r => r.id === requestId);
  
  if (index === -1) {
    return { success: false, message: '请求不存在' };
  }
  
  if (action === 'approve') {
    requests[index].status = 'approved';
  } else if (action === 'ignore') {
    requests[index].status = 'ignored';
  }
  
  setStorage(STORAGE_KEYS.PASSWORD_REQUESTS, requests);
  return { success: true };
}

function banUser(uid) {
  const users = getStorage(STORAGE_KEYS.USERS);
  const index = users.findIndex(u => u.uid === uid);
  
  if (index === -1) {
    return { success: false, message: '用户不存在' };
  }
  
  if (users[index].isAdmin) {
    return { success: false, message: '不能封禁管理员' };
  }
  
  users[index].isBanned = true;
  setStorage(STORAGE_KEYS.USERS, users);
  
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.uid === uid) {
    logout();
  }
  
  return { success: true };
}

function unbanUser(uid) {
  const users = getStorage(STORAGE_KEYS.USERS);
  const index = users.findIndex(u => u.uid === uid);
  
  if (index === -1) {
    return { success: false, message: '用户不存在' };
  }
  
  users[index].isBanned = false;
  setStorage(STORAGE_KEYS.USERS, users);
  
  return { success: true };
}

function muteUser(uid, duration) {
  const users = getStorage(STORAGE_KEYS.USERS);
  const index = users.findIndex(u => u.uid === uid);
  
  if (index === -1) {
    return { success: false, message: '用户不存在' };
  }
  
  if (users[index].isAdmin) {
    return { success: false, message: '不能禁言管理员' };
  }
  
  const durationMap = {
    '1min': 60000,
    '5min': 300000,
    '1hour': 3600000,
    '1day': 86400000,
    '3days': 259200000,
    '1week': 604800000
  };
  
  const muteUntil = Date.now() + (durationMap[duration] || 60000);
  users[index].muteUntil = muteUntil;
  setStorage(STORAGE_KEYS.USERS, users);
  
  return { success: true };
}

function unmuteUser(uid) {
  const users = getStorage(STORAGE_KEYS.USERS);
  const index = users.findIndex(u => u.uid === uid);
  
  if (index === -1) {
    return { success: false, message: '用户不存在' };
  }
  
  users[index].muteUntil = null;
  setStorage(STORAGE_KEYS.USERS, users);
  
  return { success: true };
}

function isMuted(uid) {
  const user = getUserByUid(uid);
  if (!user) return false;
  
  if (!user.muteUntil) return false;
  
  return Date.now() < user.muteUntil;
}

function getUsers() {
  return getStorage(STORAGE_KEYS.USERS);
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
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
  initSampleData();
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
    logoutBtn.addEventListener('click', () => {
      logout();
      window.location.href = 'index.html';
    });
  }
}

document.addEventListener('DOMContentLoaded', initApp);