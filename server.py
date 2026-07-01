#!/usr/bin/env python3
import http.server
import json
import sqlite3
import os
import hashlib
import random
import time
import urllib.parse

DB_FILE = 'forum_data.db'

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (uid VARCHAR(8) PRIMARY KEY, name VARCHAR(100) NOT NULL,
                  password VARCHAR(255) NOT NULL, avatar VARCHAR(500) NOT NULL,
                  created_at INTEGER NOT NULL, is_banned INTEGER DEFAULT 0,
                  mute_until INTEGER DEFAULT NULL, is_admin INTEGER DEFAULT 0)''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS posts
                 (id VARCHAR(50) PRIMARY KEY, author_uid VARCHAR(8) NOT NULL,
                  content TEXT NOT NULL, image VARCHAR(500), created_at INTEGER NOT NULL)''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS friendships
                 (id VARCHAR(50) PRIMARY KEY, user_id VARCHAR(8) NOT NULL,
                  friend_id VARCHAR(8) NOT NULL, is_accepted INTEGER DEFAULT 0,
                  created_at INTEGER NOT NULL)''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS messages
                 (id VARCHAR(50) PRIMARY KEY, sender_uid VARCHAR(8) NOT NULL,
                  receiver_uid VARCHAR(8) NOT NULL, content TEXT NOT NULL,
                  created_at INTEGER NOT NULL)''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS password_requests
                 (id VARCHAR(50) PRIMARY KEY, uid VARCHAR(8) NOT NULL,
                  status VARCHAR(20) DEFAULT 'pending', created_at INTEGER NOT NULL)''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS sessions
                 (id VARCHAR(50) PRIMARY KEY, uid VARCHAR(8) NOT NULL,
                  created_at INTEGER NOT NULL)''')
    
    c.execute('SELECT COUNT(*) FROM users WHERE uid = ?', ('10281028',))
    if c.fetchone()[0] == 0:
        c.execute('INSERT INTO users (uid, name, password, avatar, created_at, is_admin) VALUES (?, ?, ?, ?, ?, ?)',
                  ('10281028', '管理员', hash_password('zyz10281028'),
                   'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix', int(time.time()), 1))
    
    conn.commit()
    conn.close()

def hash_password(password):
    return hashlib.md5(password.encode()).hexdigest()

def generate_id():
    return hashlib.md5(f"{random.randint(0, 1000000)}{time.time()}".encode()).hexdigest()

def get_db():
    return sqlite3.connect(DB_FILE)

def check_session(conn, session_id):
    c = conn.cursor()
    c.execute('SELECT uid FROM sessions WHERE id = ? AND created_at > ?',
              (session_id, int(time.time()) - 86400))
    result = c.fetchone()
    if result:
        c.execute('UPDATE sessions SET created_at = ? WHERE id = ?',
                  (int(time.time()), session_id))
        conn.commit()
        return result[0]
    return None

def handle_login(conn, data):
    uid = data.get('uid', '')
    password = data.get('password', '')
    
    if not uid or not password:
        return {'success': False, 'message': '请填写UID和密码'}
    
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE uid = ?', (uid,))
    user = c.fetchone()
    
    if not user:
        return {'success': False, 'message': 'UID不存在'}
    
    if user[5] == 1:
        return {'success': False, 'message': '账户已被封禁'}
    
    if user[2] != hash_password(password):
        return {'success': False, 'message': '密码错误'}
    
    session_id = generate_id()
    c.execute('INSERT INTO sessions (id, uid, created_at) VALUES (?, ?, ?)',
              (session_id, uid, int(time.time())))
    conn.commit()
    
    return {'success': True, 'data': {
        'uid': user[0], 'name': user[1], 'avatar': user[3],
        'created_at': user[4], 'is_admin': user[7], 'sessionId': session_id
    }}

def handle_register(conn, data):
    uid = data.get('uid', '')
    name = data.get('name', '')
    password = data.get('password', '')
    avatar = data.get('avatar', '')
    
    if not uid.isdigit() or len(uid) != 8:
        return {'success': False, 'message': 'UID必须是8位数字'}
    
    c = conn.cursor()
    c.execute('SELECT uid FROM users WHERE uid = ?', (uid,))
    if c.fetchone():
        return {'success': False, 'message': 'UID已被使用'}
    
    if not name or len(name) < 2:
        return {'success': False, 'message': '用户名至少2个字符'}
    
    if not password or len(password) < 6:
        return {'success': False, 'message': '密码至少6个字符'}
    
    if not avatar:
        avatar = f'https://api.dicebear.com/7.x/avataaars/svg?seed={name}'
    
    c.execute('INSERT INTO users (uid, name, password, avatar, created_at) VALUES (?, ?, ?, ?, ?)',
              (uid, name, hash_password(password), avatar, int(time.time())))
    
    session_id = generate_id()
    c.execute('INSERT INTO sessions (id, uid, created_at) VALUES (?, ?, ?)',
              (session_id, uid, int(time.time())))
    conn.commit()
    
    c.execute('SELECT uid, name, avatar, created_at, is_admin FROM users WHERE uid = ?', (uid,))
    user = c.fetchone()
    
    return {'success': True, 'data': {
        'uid': user[0], 'name': user[1], 'avatar': user[2],
        'created_at': user[3], 'is_admin': user[4], 'sessionId': session_id
    }}

def handle_logout(conn, data):
    session_id = data.get('sessionId', '')
    c = conn.cursor()
    c.execute('DELETE FROM sessions WHERE id = ?', (session_id,))
    conn.commit()
    return {'success': True}

def handle_get_current_user(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    c = conn.cursor()
    c.execute('SELECT uid, name, avatar, created_at, is_admin, is_banned, mute_until FROM users WHERE uid = ?', (uid,))
    user = c.fetchone()
    
    return {'success': True, 'data': {
        'uid': user[0], 'name': user[1], 'avatar': user[2],
        'created_at': user[3], 'is_admin': user[4],
        'is_banned': user[5], 'mute_until': user[6],
        'sessionId': data.get('sessionId', '')
    }}

def handle_create_post(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    c = conn.cursor()
    c.execute('SELECT mute_until FROM users WHERE uid = ?', (uid,))
    mute_until = c.fetchone()[0]
    if mute_until and mute_until > int(time.time()):
        return {'success': False, 'message': '您已被禁言'}
    
    content = data.get('content', '')
    image = data.get('image', '')
    
    if not content:
        return {'success': False, 'message': '内容不能为空'}
    
    post_id = generate_id()
    c.execute('INSERT INTO posts (id, author_uid, content, image, created_at) VALUES (?, ?, ?, ?, ?)',
              (post_id, uid, content, image or None, int(time.time())))
    conn.commit()
    
    return {'success': True}

def handle_get_posts(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    c = conn.cursor()
    c.execute('''SELECT p.*, u.name as author_name, u.avatar as author_avatar
                 FROM posts p JOIN users u ON p.author_uid = u.uid
                 ORDER BY p.created_at DESC''')
    posts = []
    for row in c.fetchall():
        posts.append({
            'id': row[0], 'author_uid': row[1], 'content': row[2],
            'image': row[3], 'created_at': row[4],
            'author_name': row[5], 'author_avatar': row[6]
        })
    
    return {'success': True, 'data': posts}

def handle_search_users(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    query = data.get('query', '')
    c = conn.cursor()
    c.execute('SELECT uid, name, avatar FROM users WHERE uid != ? AND (name LIKE ? OR uid LIKE ?)',
              (uid, f'%{query}%', f'%{query}%'))
    users = []
    for row in c.fetchall():
        users.append({'uid': row[0], 'name': row[1], 'avatar': row[2]})
    
    return {'success': True, 'data': users}

def handle_send_friend_request(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    friend_id = data.get('friendId', '')
    if not friend_id:
        return {'success': False, 'message': '请选择好友'}
    
    c = conn.cursor()
    c.execute('SELECT id FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
              (uid, friend_id, friend_id, uid))
    if c.fetchone():
        return {'success': False, 'message': '好友关系已存在或请求已发送'}
    
    friendship_id = generate_id()
    c.execute('INSERT INTO friendships (id, user_id, friend_id, is_accepted, created_at) VALUES (?, ?, ?, 0, ?)',
              (friendship_id, uid, friend_id, int(time.time())))
    conn.commit()
    
    return {'success': True}

def handle_accept_friend_request(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    friendship_id = data.get('friendshipId', '')
    if not friendship_id:
        return {'success': False, 'message': '参数错误'}
    
    c = conn.cursor()
    c.execute('SELECT id FROM friendships WHERE id = ? AND friend_id = ?', (friendship_id, uid))
    if not c.fetchone():
        return {'success': False, 'message': '请求不存在'}
    
    c.execute('UPDATE friendships SET is_accepted = 1 WHERE id = ?', (friendship_id,))
    conn.commit()
    
    return {'success': True}

def handle_get_friends(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    c = conn.cursor()
    c.execute('''SELECT u.uid, u.name, u.avatar FROM friendships f
                 JOIN users u ON (f.user_id = ? AND f.friend_id = u.uid) OR (f.friend_id = ? AND f.user_id = u.uid)
                 WHERE f.is_accepted = 1''', (uid, uid))
    friends = []
    for row in c.fetchall():
        friends.append({'uid': row[0], 'name': row[1], 'avatar': row[2]})
    
    return {'success': True, 'data': friends}

def handle_get_friend_requests(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    c = conn.cursor()
    c.execute('''SELECT f.id, f.created_at, u.uid as requester_uid, u.name as requester_name, u.avatar as requester_avatar
                 FROM friendships f JOIN users u ON f.user_id = u.uid
                 WHERE f.friend_id = ? AND f.is_accepted = 0''', (uid,))
    requests = []
    for row in c.fetchall():
        requests.append({
            'id': row[0], 'created_at': row[1],
            'requester_uid': row[2], 'requester_name': row[3], 'requester_avatar': row[4]
        })
    
    return {'success': True, 'data': requests}

def handle_delete_friend(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    friend_id = data.get('friendId', '')
    if not friend_id:
        return {'success': False, 'message': '请选择好友'}
    
    c = conn.cursor()
    c.execute('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
              (uid, friend_id, friend_id, uid))
    conn.commit()
    
    return {'success': True}

def handle_send_message(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    receiver_uid = data.get('receiverUid', '')
    content = data.get('content', '')
    
    if not receiver_uid or not content:
        return {'success': False, 'message': '参数错误'}
    
    message_id = generate_id()
    c = conn.cursor()
    c.execute('INSERT INTO messages (id, sender_uid, receiver_uid, content, created_at) VALUES (?, ?, ?, ?, ?)',
              (message_id, uid, receiver_uid, content, int(time.time())))
    conn.commit()
    
    return {'success': True}

def handle_get_messages(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    friend_id = data.get('friendId', '')
    if not friend_id:
        return {'success': False, 'message': '参数错误'}
    
    c = conn.cursor()
    c.execute('''SELECT id, sender_uid, receiver_uid, content, created_at
                 FROM messages
                 WHERE (sender_uid = ? AND receiver_uid = ?) OR (sender_uid = ? AND receiver_uid = ?)
                 ORDER BY created_at ASC''', (uid, friend_id, friend_id, uid))
    messages = []
    for row in c.fetchall():
        messages.append({
            'id': row[0], 'sender_uid': row[1], 'receiver_uid': row[2],
            'content': row[3], 'created_at': row[4]
        })
    
    return {'success': True, 'data': messages}

def handle_update_profile(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    name = data.get('name', '')
    avatar = data.get('avatar', '')
    
    if not name:
        return {'success': False, 'message': '用户名不能为空'}
    
    c = conn.cursor()
    c.execute('UPDATE users SET name = ?, avatar = ? WHERE uid = ?', (name, avatar, uid))
    
    c.execute('SELECT uid, name, avatar, created_at, is_admin FROM users WHERE uid = ?', (uid,))
    user = c.fetchone()
    conn.commit()
    
    return {'success': True, 'data': {
        'uid': user[0], 'name': user[1], 'avatar': user[2],
        'created_at': user[3], 'is_admin': user[4],
        'sessionId': data.get('sessionId', '')
    }}

def handle_change_password(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    new_password = data.get('newPassword', '')
    if not new_password or len(new_password) < 6:
        return {'success': False, 'message': '密码至少6个字符'}
    
    c = conn.cursor()
    c.execute('UPDATE users SET password = ? WHERE uid = ?', (hash_password(new_password), uid))
    conn.commit()
    
    return {'success': True}

def handle_send_password_request(conn, data):
    uid = data.get('uid', '')
    
    c = conn.cursor()
    c.execute('SELECT uid FROM users WHERE uid = ?', (uid,))
    if not c.fetchone():
        return {'success': False, 'message': 'UID不存在'}
    
    c.execute('SELECT id FROM password_requests WHERE uid = ? AND status = "pending"', (uid,))
    if c.fetchone():
        return {'success': False, 'message': '已有待处理的请求'}
    
    request_id = generate_id()
    c.execute('INSERT INTO password_requests (id, uid, status, created_at) VALUES (?, ?, "pending", ?)',
              (request_id, uid, int(time.time())))
    conn.commit()
    
    return {'success': True}

def handle_get_password_requests(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    c = conn.cursor()
    c.execute('SELECT is_admin FROM users WHERE uid = ?', (uid,))
    if c.fetchone()[0] != 1:
        return {'success': False, 'message': '需要管理员权限'}
    
    c.execute('''SELECT pr.*, u.name FROM password_requests pr
                 JOIN users u ON pr.uid = u.uid ORDER BY pr.created_at DESC''')
    requests = []
    for row in c.fetchall():
        requests.append({
            'id': row[0], 'uid': row[1], 'status': row[2], 'created_at': row[3], 'name': row[4]
        })
    
    return {'success': True, 'data': requests}

def handle_handle_password_request(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    c = conn.cursor()
    c.execute('SELECT is_admin FROM users WHERE uid = ?', (uid,))
    if c.fetchone()[0] != 1:
        return {'success': False, 'message': '需要管理员权限'}
    
    request_id = data.get('requestId', '')
    action = data.get('action', '')
    
    if not request_id or not action:
        return {'success': False, 'message': '参数错误'}
    
    status = 'approved' if action == 'approve' else 'ignored'
    c.execute('UPDATE password_requests SET status = ? WHERE id = ?', (status, request_id))
    conn.commit()
    
    return {'success': True}

def handle_ban_user(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    c = conn.cursor()
    c.execute('SELECT is_admin FROM users WHERE uid = ?', (uid,))
    if c.fetchone()[0] != 1:
        return {'success': False, 'message': '需要管理员权限'}
    
    target_uid = data.get('uid', '')
    if not target_uid:
        return {'success': False, 'message': '参数错误'}
    
    c.execute('SELECT is_admin FROM users WHERE uid = ?', (target_uid,))
    user = c.fetchone()
    if not user:
        return {'success': False, 'message': '用户不存在'}
    
    if user[0] == 1:
        return {'success': False, 'message': '不能封禁管理员'}
    
    c.execute('UPDATE users SET is_banned = 1 WHERE uid = ?', (target_uid,))
    c.execute('DELETE FROM sessions WHERE uid = ?', (target_uid,))
    conn.commit()
    
    return {'success': True}

def handle_unban_user(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    c = conn.cursor()
    c.execute('SELECT is_admin FROM users WHERE uid = ?', (uid,))
    if c.fetchone()[0] != 1:
        return {'success': False, 'message': '需要管理员权限'}
    
    target_uid = data.get('uid', '')
    c.execute('UPDATE users SET is_banned = 0 WHERE uid = ?', (target_uid,))
    conn.commit()
    
    return {'success': True}

def handle_mute_user(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    c = conn.cursor()
    c.execute('SELECT is_admin FROM users WHERE uid = ?', (uid,))
    if c.fetchone()[0] != 1:
        return {'success': False, 'message': '需要管理员权限'}
    
    target_uid = data.get('uid', '')
    duration = data.get('duration', '')
    
    if not target_uid or not duration:
        return {'success': False, 'message': '参数错误'}
    
    c.execute('SELECT is_admin FROM users WHERE uid = ?', (target_uid,))
    user = c.fetchone()
    if not user:
        return {'success': False, 'message': '用户不存在'}
    
    if user[0] == 1:
        return {'success': False, 'message': '不能禁言管理员'}
    
    duration_map = {
        '1min': 60, '5min': 300, '1hour': 3600,
        '1day': 86400, '3days': 259200, '1week': 604800
    }
    
    mute_until = int(time.time()) + (duration_map.get(duration, 60))
    c.execute('UPDATE users SET mute_until = ? WHERE uid = ?', (mute_until, target_uid))
    conn.commit()
    
    return {'success': True}

def handle_unmute_user(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    c = conn.cursor()
    c.execute('SELECT is_admin FROM users WHERE uid = ?', (uid,))
    if c.fetchone()[0] != 1:
        return {'success': False, 'message': '需要管理员权限'}
    
    target_uid = data.get('uid', '')
    c.execute('UPDATE users SET mute_until = NULL WHERE uid = ?', (target_uid,))
    conn.commit()
    
    return {'success': True}

def handle_get_users(conn, data):
    uid = check_session(conn, data.get('sessionId', ''))
    if not uid:
        return {'success': False, 'message': '请先登录'}
    
    c = conn.cursor()
    c.execute('SELECT is_admin FROM users WHERE uid = ?', (uid,))
    if c.fetchone()[0] != 1:
        return {'success': False, 'message': '需要管理员权限'}
    
    c.execute('SELECT uid, name, avatar, created_at, is_banned, mute_until, is_admin FROM users ORDER BY created_at DESC')
    users = []
    for row in c.fetchall():
        users.append({
            'uid': row[0], 'name': row[1], 'avatar': row[2],
            'created_at': row[3], 'is_banned': row[4],
            'mute_until': row[5], 'is_admin': row[6]
        })
    
    return {'success': True, 'data': users}

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        
        if path == '/api.php':
            self.handle_api(parsed.query)
        else:
            super().do_GET()
    
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        
        if parsed.path == '/api.php':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            
            try:
                data = urllib.parse.parse_qs(body)
                data = {k: v[0] for k, v in data.items()}
            except:
                data = {}
            
            query = parsed.query
            self.handle_api(query, data)
        else:
            super().do_POST()
    
    def handle_api(self, query, post_data=None):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
        params = urllib.parse.parse_qs(query)
        action = params.get('action', [''])[0]
        
        if not action:
            self.wfile.write(json.dumps({'success': False, 'message': '未知操作'}).encode())
            return
        
        conn = get_db()
        data = post_data or {}
        
        for k, v in params.items():
            if k != 'action':
                data[k] = v[0]
        
        try:
            if action == 'login':
                result = handle_login(conn, data)
            elif action == 'register':
                result = handle_register(conn, data)
            elif action == 'logout':
                result = handle_logout(conn, data)
            elif action == 'getCurrentUser':
                result = handle_get_current_user(conn, data)
            elif action == 'createPost':
                result = handle_create_post(conn, data)
            elif action == 'getPosts':
                result = handle_get_posts(conn, data)
            elif action == 'searchUsers':
                result = handle_search_users(conn, data)
            elif action == 'sendFriendRequest':
                result = handle_send_friend_request(conn, data)
            elif action == 'acceptFriendRequest':
                result = handle_accept_friend_request(conn, data)
            elif action == 'getFriends':
                result = handle_get_friends(conn, data)
            elif action == 'getFriendRequests':
                result = handle_get_friend_requests(conn, data)
            elif action == 'deleteFriend':
                result = handle_delete_friend(conn, data)
            elif action == 'sendMessage':
                result = handle_send_message(conn, data)
            elif action == 'getMessages':
                result = handle_get_messages(conn, data)
            elif action == 'updateProfile':
                result = handle_update_profile(conn, data)
            elif action == 'changePassword':
                result = handle_change_password(conn, data)
            elif action == 'sendPasswordRequest':
                result = handle_send_password_request(conn, data)
            elif action == 'getPasswordRequests':
                result = handle_get_password_requests(conn, data)
            elif action == 'handlePasswordRequest':
                result = handle_handle_password_request(conn, data)
            elif action == 'banUser':
                result = handle_ban_user(conn, data)
            elif action == 'unbanUser':
                result = handle_unban_user(conn, data)
            elif action == 'muteUser':
                result = handle_mute_user(conn, data)
            elif action == 'unmuteUser':
                result = handle_unmute_user(conn, data)
            elif action == 'getUsers':
                result = handle_get_users(conn, data)
            else:
                result = {'success': False, 'message': '未知操作'}
        except Exception as e:
            result = {'success': False, 'message': str(e)}
        
        conn.close()
        self.wfile.write(json.dumps(result).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == '__main__':
    init_db()
    server = http.server.HTTPServer(('0.0.0.0', 8080), Handler)
    print('Server running on http://0.0.0.0:8080')
    server.serve_forever()