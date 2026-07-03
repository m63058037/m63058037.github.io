#!/usr/bin/env python3
import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import sqlite3
import hashlib
import os
import time

SUPABASE_URL = 'https://rfceapkvgnmzqpbgxuus.supabase.co'
SUPABASE_KEY = 'sb_secret_RG5vyDUd3G6JbHb_OJlh_A_HkPrAWvp'

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'forum_data.db')

def hash_password(password):
    hash_val = 0
    for char in password:
        hash_val = ((hash_val << 5) - hash_val) + ord(char)
        hash_val = hash_val & hash_val
    return hex(hash_val & 0xFFFFFFFF)[2:].zfill(32)

def generate_id():
    return hashlib.md5(str(time.time()).encode() + os.urandom(16)).hexdigest()

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        uid VARCHAR(8) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        password VARCHAR(255) NOT NULL,
        avatar VARCHAR(500) NOT NULL,
        created_at INTEGER NOT NULL,
        is_banned INTEGER DEFAULT 0,
        mute_until INTEGER DEFAULT NULL,
        is_admin INTEGER DEFAULT 0
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS posts (
        id VARCHAR(50) PRIMARY KEY,
        author_uid VARCHAR(8) NOT NULL,
        content TEXT NOT NULL,
        image VARCHAR(500),
        created_at INTEGER NOT NULL,
        FOREIGN KEY (author_uid) REFERENCES users(uid)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS friendships (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(8) NOT NULL,
        friend_id VARCHAR(8) NOT NULL,
        is_accepted INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(uid),
        FOREIGN KEY (friend_id) REFERENCES users(uid)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(50) PRIMARY KEY,
        sender_uid VARCHAR(8) NOT NULL,
        receiver_uid VARCHAR(8) NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (sender_uid) REFERENCES users(uid),
        FOREIGN KEY (receiver_uid) REFERENCES users(uid)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS password_requests (
        id VARCHAR(50) PRIMARY KEY,
        uid VARCHAR(8) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (uid) REFERENCES users(uid)
    )
    ''')
    
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(50) PRIMARY KEY,
        uid VARCHAR(8) NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (uid) REFERENCES users(uid)
    )
    ''')
    
    cursor.execute('SELECT COUNT(*) FROM users WHERE uid = ?', ('10281028',))
    if cursor.fetchone()[0] == 0:
        cursor.execute('''
        INSERT INTO users (uid, name, password, avatar, created_at, is_admin) 
        VALUES (?, ?, ?, ?, ?, ?)
        ''', ('10281028', '管理员', hash_password('zyz10281028'), 
              'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix', int(time.time()), 1))
    
    conn.commit()
    conn.close()

init_db()

class APIHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/api/'):
            self.proxy_request('GET', self.path[4:])
        else:
            super().do_GET()
    
    def do_POST(self):
        if self.path == '/api':
            self.handle_api_request()
        elif self.path.startswith('/api/'):
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length)
            self.proxy_request('POST', self.path[4:], body)
        else:
            super().do_POST()
    
    def do_PATCH(self):
        if self.path.startswith('/api/'):
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length)
            self.proxy_request('PATCH', self.path[4:], body)
        else:
            super().do_PATCH()
    
    def do_DELETE(self):
        if self.path.startswith('/api/'):
            self.proxy_request('DELETE', self.path[4:])
        else:
            super().do_DELETE()
    
    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def get_session(self, session_id):
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM sessions WHERE id = ? AND created_at > ?', 
                      (session_id, int(time.time()) - 86400))
        session = cursor.fetchone()
        conn.close()
        if session:
            return {'id': session[0], 'uid': session[1], 'created_at': session[2]}
        return None
    
    def require_session(self, session_id):
        session = self.get_session(session_id)
        if not session:
            self.send_json({'success': False, 'message': '请先登录'}, 401)
            return None
        return session['uid']
    
    def require_admin(self, session_id):
        uid = self.require_session(session_id)
        if uid is None:
            return None
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('SELECT is_admin FROM users WHERE uid = ?', (uid,))
        user = cursor.fetchone()
        conn.close()
        
        if not user or user[0] != 1:
            self.send_json({'success': False, 'message': '需要管理员权限'}, 403)
            return None
        return uid
    
    def handle_api_request(self):
        content_length = int(self.headers['Content-Length'])
        body = self.rfile.read(content_length)
        
        try:
            if self.headers.get('Content-Type', '').startswith('multipart/form-data'):
                params = {}
                boundary = self.headers['Content-Type'].split('boundary=')[1].encode()
                parts = body.split(boundary)
                for part in parts:
                    if b'Content-Disposition:' in part:
                        lines = part.split(b'\r\n')
                        for line in lines:
                            if b'name=' in line:
                                name = line.decode().split('name="')[1].split('"')[0]
                                value = lines[-1].decode().strip()
                                params[name] = value
            else:
                params = json.loads(body.decode())
        except:
            params = {}
        
        action = params.get('action', '')
        session_id = params.get('sessionId', '')
        
        if action == 'login':
            self.handle_login(params)
        elif action == 'register':
            self.handle_register(params)
        elif action == 'logout':
            self.handle_logout(params)
        elif action == 'createPost':
            self.handle_create_post(params, session_id)
        elif action == 'getPosts':
            self.handle_get_posts()
        elif action == 'searchUsers':
            self.handle_search_users(params, session_id)
        elif action == 'sendFriendRequest':
            self.handle_send_friend_request(params, session_id)
        elif action == 'acceptFriendRequest':
            self.handle_accept_friend_request(params, session_id)
        elif action == 'deleteFriend':
            self.handle_delete_friend(params, session_id)
        elif action == 'getFriends':
            self.handle_get_friends(session_id)
        elif action == 'getFriendRequests':
            self.handle_get_friend_requests(session_id)
        elif action == 'sendMessage':
            self.handle_send_message(params, session_id)
        elif action == 'getMessages':
            self.handle_get_messages(params, session_id)
        elif action == 'updateProfile':
            self.handle_update_profile(params, session_id)
        elif action == 'changePassword':
            self.handle_change_password(params, session_id)
        elif action == 'sendPasswordRequest':
            self.handle_send_password_request(params)
        elif action == 'getPasswordRequests':
            self.handle_get_password_requests(session_id)
        elif action == 'handlePasswordRequest':
            self.handle_handle_password_request(params, session_id)
        elif action == 'banUser':
            self.handle_ban_user(params, session_id)
        elif action == 'unbanUser':
            self.handle_unban_user(params, session_id)
        elif action == 'muteUser':
            self.handle_mute_user(params, session_id)
        elif action == 'unmuteUser':
            self.handle_unmute_user(params, session_id)
        elif action == 'getUsers':
            self.handle_get_users(session_id)
        else:
            self.send_json({'success': False, 'message': '未知操作'})
    
    def handle_login(self, params):
        uid = params.get('uid', '')
        password = params.get('password', '')
        
        if not uid or not password:
            self.send_json({'success': False, 'message': '请填写UID和密码'})
            return
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE uid = ?', (uid,))
        user = cursor.fetchone()
        conn.close()
        
        if not user:
            self.send_json({'success': False, 'message': 'UID不存在'})
            return
        
        if user[5] == 1:
            self.send_json({'success': False, 'message': '账户已被封禁'})
            return
        
        if user[2] != hash_password(password):
            self.send_json({'success': False, 'message': '密码错误'})
            return
        
        session_id = generate_id()
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('INSERT INTO sessions (id, uid, created_at) VALUES (?, ?, ?)', 
                      (session_id, uid, int(time.time())))
        conn.commit()
        conn.close()
        
        self.send_json({'success': True, 'data': {
            'uid': user[0],
            'name': user[1],
            'avatar': user[3],
            'created_at': user[4],
            'is_admin': user[7],
            'sessionId': session_id
        }})
    
    def handle_register(self, params):
        uid = params.get('uid', '')
        name = params.get('name', '')
        password = params.get('password', '')
        avatar = params.get('avatar', '')
        
        if not uid.isdigit() or len(uid) != 8:
            self.send_json({'success': False, 'message': 'UID必须是8位数字'})
            return
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('SELECT uid FROM users WHERE uid = ?', (uid,))
        if cursor.fetchone():
            conn.close()
            self.send_json({'success': False, 'message': 'UID已被使用'})
            return
        
        if not name or len(name) < 2:
            conn.close()
            self.send_json({'success': False, 'message': '用户名至少2个字符'})
            return
        
        if not password or len(password) < 6:
            conn.close()
            self.send_json({'success': False, 'message': '密码至少6个字符'})
            return
        
        if not avatar:
            avatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + name
        
        cursor.execute('INSERT INTO users (uid, name, password, avatar, created_at) VALUES (?, ?, ?, ?, ?)', 
                      (uid, name, hash_password(password), avatar, int(time.time())))
        
        session_id = generate_id()
        cursor.execute('INSERT INTO sessions (id, uid, created_at) VALUES (?, ?, ?)', 
                      (session_id, uid, int(time.time())))
        
        conn.commit()
        conn.close()
        
        self.send_json({'success': True, 'data': {
            'uid': uid,
            'name': name,
            'avatar': avatar,
            'created_at': int(time.time()),
            'is_admin': 0,
            'sessionId': session_id
        }})
    
    def handle_logout(self, params):
        session_id = params.get('sessionId', '')
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM sessions WHERE id = ?', (session_id,))
        conn.commit()
        conn.close()
        self.send_json({'success': True})
    
    def handle_create_post(self, params, session_id):
        uid = self.require_session(session_id)
        if uid is None:
            return
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('SELECT mute_until FROM users WHERE uid = ?', (uid,))
        user = cursor.fetchone()
        if user and user[0] and user[0] > int(time.time()):
            conn.close()
            self.send_json({'success': False, 'message': '您已被禁言'})
            return
        
        content = params.get('content', '')
        image = params.get('image', '')
        
        if not content:
            conn.close()
            self.send_json({'success': False, 'message': '内容不能为空'})
            return
        
        post_id = generate_id()
        cursor.execute('INSERT INTO posts (id, author_uid, content, image, created_at) VALUES (?, ?, ?, ?, ?)', 
                      (post_id, uid, content, image or None, int(time.time())))
        conn.commit()
        conn.close()
        self.send_json({'success': True})
    
    def handle_get_posts(self):
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('''
        SELECT p.*, u.name as author_name, u.avatar as author_avatar 
        FROM posts p JOIN users u ON p.author_uid = u.uid 
        ORDER BY p.created_at DESC
        ''')
        posts = []
        for row in cursor.fetchall():
            posts.append({
                'id': row[0],
                'author_uid': row[1],
                'content': row[2],
                'image': row[3],
                'created_at': row[4],
                'author_name': row[5],
                'author_avatar': row[6]
            })
        conn.close()
        self.send_json({'success': True, 'data': posts})
    
    def handle_search_users(self, params, session_id):
        uid = self.require_session(session_id)
        if uid is None:
            return
        
        query = params.get('query', '')
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('SELECT uid, name, avatar FROM users WHERE uid != ?', (uid,))
        users = []
        for row in cursor.fetchall():
            if query.lower() in row[1].lower() or query in row[0]:
                users.append({'uid': row[0], 'name': row[1], 'avatar': row[2]})
        conn.close()
        self.send_json({'success': True, 'data': users})
    
    def handle_send_friend_request(self, params, session_id):
        uid = self.require_session(session_id)
        if uid is None:
            return
        
        friend_id = params.get('friendId', '')
        
        if not friend_id:
            self.send_json({'success': False, 'message': '请选择好友'})
            return
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', 
                      (uid, friend_id, friend_id, uid))
        if cursor.fetchone():
            conn.close()
            self.send_json({'success': False, 'message': '好友关系已存在或请求已发送'})
            return
        
        friendship_id = generate_id()
        cursor.execute('INSERT INTO friendships (id, user_id, friend_id, is_accepted, created_at) VALUES (?, ?, ?, 0, ?)', 
                      (friendship_id, uid, friend_id, int(time.time())))
        conn.commit()
        conn.close()
        self.send_json({'success': True})
    
    def handle_accept_friend_request(self, params, session_id):
        uid = self.require_session(session_id)
        if uid is None:
            return
        
        friendship_id = params.get('friendshipId', '')
        
        if not friendship_id:
            self.send_json({'success': False, 'message': '参数错误'})
            return
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM friendships WHERE id = ? AND friend_id = ?', (friendship_id, uid))
        if not cursor.fetchone():
            conn.close()
            self.send_json({'success': False, 'message': '请求不存在'})
            return
        
        cursor.execute('UPDATE friendships SET is_accepted = 1 WHERE id = ?', (friendship_id,))
        conn.commit()
        conn.close()
        self.send_json({'success': True})
    
    def handle_delete_friend(self, params, session_id):
        uid = self.require_session(session_id)
        if uid is None:
            return
        
        friend_id = params.get('friendId', '')
        
        if not friend_id:
            self.send_json({'success': False, 'message': '请选择好友'})
            return
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', 
                      (uid, friend_id, friend_id, uid))
        conn.commit()
        conn.close()
        self.send_json({'success': True})
    
    def handle_get_friends(self, session_id):
        uid = self.require_session(session_id)
        if uid is None:
            return
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('''
        SELECT u.uid, u.name, u.avatar 
        FROM friendships f JOIN users u ON (f.user_id = ? AND f.friend_id = u.uid) OR (f.friend_id = ? AND f.user_id = u.uid) 
        WHERE f.is_accepted = 1
        ''', (uid, uid))
        friends = []
        for row in cursor.fetchall():
            friends.append({'uid': row[0], 'name': row[1], 'avatar': row[2]})
        conn.close()
        self.send_json({'success': True, 'data': friends})
    
    def handle_get_friend_requests(self, session_id):
        uid = self.require_session(session_id)
        if uid is None:
            return
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('''
        SELECT f.id, f.created_at, u.uid as requester_uid, u.name as requester_name, u.avatar as requester_avatar 
        FROM friendships f JOIN users u ON f.user_id = u.uid 
        WHERE f.friend_id = ? AND f.is_accepted = 0
        ''', (uid,))
        requests = []
        for row in cursor.fetchall():
            requests.append({
                'id': row[0],
                'created_at': row[1],
                'requester_uid': row[2],
                'requester_name': row[3],
                'requester_avatar': row[4]
            })
        conn.close()
        self.send_json({'success': True, 'data': requests})
    
    def handle_send_message(self, params, session_id):
        uid = self.require_session(session_id)
        if uid is None:
            return
        
        receiver_uid = params.get('receiverUid', '')
        content = params.get('content', '')
        
        if not receiver_uid or not content:
            self.send_json({'success': False, 'message': '参数错误'})
            return
        
        message_id = generate_id()
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('INSERT INTO messages (id, sender_uid, receiver_uid, content, created_at) VALUES (?, ?, ?, ?, ?)', 
                      (message_id, uid, receiver_uid, content, int(time.time())))
        conn.commit()
        conn.close()
        self.send_json({'success': True})
    
    def handle_get_messages(self, params, session_id):
        uid = self.require_session(session_id)
        if uid is None:
            return
        
        friend_id = params.get('friendId', '')
        
        if not friend_id:
            self.send_json({'success': False, 'message': '参数错误'})
            return
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('''
        SELECT * FROM messages 
        WHERE (sender_uid = ? AND receiver_uid = ?) OR (sender_uid = ? AND receiver_uid = ?) 
        ORDER BY created_at ASC
        ''', (uid, friend_id, friend_id, uid))
        messages = []
        for row in cursor.fetchall():
            messages.append({
                'id': row[0],
                'sender_uid': row[1],
                'receiver_uid': row[2],
                'content': row[3],
                'created_at': row[4]
            })
        conn.close()
        self.send_json({'success': True, 'data': messages})
    
    def handle_update_profile(self, params, session_id):
        uid = self.require_session(session_id)
        if uid is None:
            return
        
        name = params.get('name', '')
        avatar = params.get('avatar', '')
        
        if not name:
            self.send_json({'success': False, 'message': '用户名不能为空'})
            return
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET name = ?, avatar = ? WHERE uid = ?', (name, avatar, uid))
        cursor.execute('SELECT uid, name, avatar, created_at, is_admin FROM users WHERE uid = ?', (uid,))
        user = cursor.fetchone()
        conn.commit()
        conn.close()
        
        self.send_json({'success': True, 'data': {
            'uid': user[0],
            'name': user[1],
            'avatar': user[2],
            'created_at': user[3],
            'is_admin': user[4],
            'sessionId': session_id
        }})
    
    def handle_change_password(self, params, session_id):
        uid = self.require_session(session_id)
        if uid is None:
            return
        
        old_password = params.get('oldPassword', '')
        new_password = params.get('newPassword', '')
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('SELECT password FROM users WHERE uid = ?', (uid,))
        user = cursor.fetchone()
        
        if not user:
            conn.close()
            self.send_json({'success': False, 'message': '用户不存在'})
            return
        
        if user[0] != hash_password(old_password):
            conn.close()
            self.send_json({'success': False, 'message': '旧密码错误'})
            return
        
        if not new_password or len(new_password) < 6:
            conn.close()
            self.send_json({'success': False, 'message': '密码至少6个字符'})
            return
        
        cursor.execute('UPDATE users SET password = ? WHERE uid = ?', (hash_password(new_password), uid))
        conn.commit()
        conn.close()
        self.send_json({'success': True})
    
    def handle_send_password_request(self, params):
        uid = params.get('uid', '')
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('SELECT uid FROM users WHERE uid = ?', (uid,))
        if not cursor.fetchone():
            conn.close()
            self.send_json({'success': False, 'message': 'UID不存在'})
            return
        
        cursor.execute('SELECT id FROM password_requests WHERE uid = ? AND status = "pending"', (uid,))
        if cursor.fetchone():
            conn.close()
            self.send_json({'success': False, 'message': '已有待处理的请求'})
            return
        
        request_id = generate_id()
        cursor.execute('INSERT INTO password_requests (id, uid, status, created_at) VALUES (?, ?, "pending", ?)', 
                      (request_id, uid, int(time.time())))
        conn.commit()
        conn.close()
        self.send_json({'success': True})
    
    def handle_get_password_requests(self, session_id):
        uid = self.require_admin(session_id)
        if uid is None:
            return
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('''
        SELECT pr.*, u.name FROM password_requests pr JOIN users u ON pr.uid = u.uid 
        ORDER BY pr.created_at DESC
        ''')
        requests = []
        for row in cursor.fetchall():
            requests.append({
                'id': row[0],
                'uid': row[1],
                'status': row[2],
                'created_at': row[3],
                'name': row[4]
            })
        conn.close()
        self.send_json({'success': True, 'data': requests})
    
    def handle_handle_password_request(self, params, session_id):
        uid = self.require_admin(session_id)
        if uid is None:
            return
        
        request_id = params.get('requestId', '')
        action = params.get('action', '')
        
        if not request_id or not action:
            self.send_json({'success': False, 'message': '参数错误'})
            return
        
        status = 'approved' if action == 'approve' else 'ignored'
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('UPDATE password_requests SET status = ? WHERE id = ?', (status, request_id))
        conn.commit()
        conn.close()
        self.send_json({'success': True})
    
    def handle_ban_user(self, params, session_id):
        uid = self.require_admin(session_id)
        if uid is None:
            return
        
        target_uid = params.get('uid', '')
        
        if not target_uid:
            self.send_json({'success': False, 'message': '参数错误'})
            return
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('SELECT is_admin FROM users WHERE uid = ?', (target_uid,))
        user = cursor.fetchone()
        
        if not user:
            conn.close()
            self.send_json({'success': False, 'message': '用户不存在'})
            return
        
        if user[0] == 1:
            conn.close()
            self.send_json({'success': False, 'message': '不能封禁管理员'})
            return
        
        cursor.execute('UPDATE users SET is_banned = 1 WHERE uid = ?', (target_uid,))
        cursor.execute('DELETE FROM sessions WHERE uid = ?', (target_uid,))
        conn.commit()
        conn.close()
        self.send_json({'success': True})
    
    def handle_unban_user(self, params, session_id):
        uid = self.require_admin(session_id)
        if uid is None:
            return
        
        target_uid = params.get('uid', '')
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET is_banned = 0 WHERE uid = ?', (target_uid,))
        conn.commit()
        conn.close()
        self.send_json({'success': True})
    
    def handle_mute_user(self, params, session_id):
        uid = self.require_admin(session_id)
        if uid is None:
            return
        
        target_uid = params.get('uid', '')
        duration = params.get('duration', '')
        
        if not target_uid or not duration:
            self.send_json({'success': False, 'message': '参数错误'})
            return
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('SELECT is_admin FROM users WHERE uid = ?', (target_uid,))
        user = cursor.fetchone()
        
        if not user:
            conn.close()
            self.send_json({'success': False, 'message': '用户不存在'})
            return
        
        if user[0] == 1:
            conn.close()
            self.send_json({'success': False, 'message': '不能禁言管理员'})
            return
        
        duration_map = {'1m': 60, '5m': 300, '1h': 3600, '1d': 86400, '3d': 259200, '1w': 604800}
        seconds = duration_map.get(duration, 60)
        mute_until = int(time.time()) + seconds
        
        cursor.execute('UPDATE users SET mute_until = ? WHERE uid = ?', (mute_until, target_uid))
        conn.commit()
        conn.close()
        self.send_json({'success': True})
    
    def handle_unmute_user(self, params, session_id):
        uid = self.require_admin(session_id)
        if uid is None:
            return
        
        target_uid = params.get('uid', '')
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET mute_until = NULL WHERE uid = ?', (target_uid,))
        conn.commit()
        conn.close()
        self.send_json({'success': True})
    
    def handle_get_users(self, session_id):
        uid = self.require_admin(session_id)
        if uid is None:
            return
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('SELECT uid, name, avatar, created_at, is_banned, mute_until, is_admin FROM users ORDER BY created_at DESC')
        users = []
        for row in cursor.fetchall():
            users.append({
                'uid': row[0],
                'name': row[1],
                'avatar': row[2],
                'created_at': row[3],
                'is_banned': row[4],
                'mute_until': row[5],
                'is_admin': row[6]
            })
        conn.close()
        self.send_json({'success': True, 'data': users})
    
    def proxy_request(self, method, path, body=None):
        url = f"{SUPABASE_URL}/rest/v1/{path}"
        
        req = urllib.request.Request(url, method=method)
        req.add_header('apikey', SUPABASE_KEY)
        req.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
        req.add_header('Content-Type', 'application/json')
        
        if body:
            req.data = body
        
        try:
            with urllib.request.urlopen(req) as response:
                data = response.read()
                content_type = response.headers.get('Content-Type', 'application/json')
                
                self.send_response(response.status)
                self.send_header('Content-Type', content_type)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            error_data = e.read()
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(error_data)
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

if __name__ == '__main__':
    PORT = 8000
    with socketserver.TCPServer(("", PORT), APIHandler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        httpd.serve_forever()
