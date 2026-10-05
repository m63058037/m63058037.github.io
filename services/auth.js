import { supabase, config } from '../config/supabase.js';
import { generateUUID } from '../utils/helpers.js';
import { loggerService } from './logger.js';
import { apiService } from './api.js';
import { sensitiveWordService } from './sensitive-word.js';
import { getFdi } from '../js/fdi.js';

function createResponse(success, data = null, message = '', statusCode = 200) {
  return { success, data, message, statusCode };
}

/**
 * 四级身份体系
 */
export const UserRoles = {
  GUEST: 'guest',
  MEMBER: 'member',
  ADMIN: 'admin',
  DEV_ADMIN: 'dev_admin'
};

const DEV_ADMIN_UIDS = ['10281028'];

async function restoreOwnExpiredBan() {
  try {
    await supabase.rpc('restore_own_expired_ban');
  } catch (e) {
    // 到期写回失败时仍以 auth_account_is_usable 为准
  }
}

async function isAccountUsable() {
  try {
    const { data, error } = await supabase.rpc('auth_account_is_usable');
    if (error) {
      return false;
    }
    return data === true;
  } catch (e) {
    return false;
  }
}

export const authService = {
  _generateVirtualEmail(uid) {
    return `${uid}@campus-forum.local`;
  },

  _checkClientRateLimit(bucketKey, limit, windowMs) {
    try {
      if (typeof sessionStorage === 'undefined') {
        return { allowed: true };
      }
      const storageKey = `rate:${bucketKey}`;
      const now = Date.now();
      let entries = [];
      try {
        entries = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
      } catch (e) {
        entries = [];
      }
      if (!Array.isArray(entries)) entries = [];
      entries = entries.filter((ts) => typeof ts === 'number' && now - ts < windowMs);
      if (entries.length >= limit) {
        const waitSec = Math.max(1, Math.ceil((windowMs - (now - entries[0])) / 1000));
        return { allowed: false, waitSec };
      }
      entries.push(now);
      sessionStorage.setItem(storageKey, JSON.stringify(entries));
      return { allowed: true };
    } catch (e) {
      // 限流存储异常时不阻断正常登录/查询
      return { allowed: true };
    }
  },

  async login(uid, password) {
    try {
      if (!uid || typeof uid !== 'string' || !/^\d{8}$/.test(uid)) {
        return createResponse(false, null, '请输入有效的8位UID', 400);
      }

      const rate = this._checkClientRateLimit(
        `login:${uid}`,
        config.loginRateLimit || 5,
        config.loginRateLimitWindowMs || 60000
      );
      if (!rate.allowed) {
        return createResponse(false, null, `尝试过于频繁，请 ${rate.waitSec} 秒后再试`, 429);
      }

      const email = this._generateVirtualEmail(uid);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        loggerService.logError(error, { operation: 'login', uid });
        await loggerService.logLogin(null, 'failed', { uid });
        return createResponse(false, null, 'UID不存在或密码错误', 401);
      }

      const user = data.user;
      const session = data.session;

      if (!user || !session) {
        return createResponse(false, null, '登录失败，无法获取用户信息', 401);
      }

      const { data: banned, error: banError } = await supabase.rpc('uid_has_active_ban', {
        p_uid: uid
      });
      if (banError) {
        await supabase.auth.signOut();
        return createResponse(false, null, '无法确认账号状态，请稍后重试', 500);
      }
      if (banned === true) {
        await supabase.auth.signOut();
        return createResponse(false, null, '该账号已被封禁，暂时无法登录', 403);
      }

      await restoreOwnExpiredBan();

      await loggerService.logLogin(user.id, 'success', { uid });

      return createResponse(true, { user, session }, '登录成功', 200);
    } catch (error) {
      loggerService.logError(error, { operation: 'login', uid });
      await loggerService.logLogin(null, 'failed', { uid });
      return createResponse(false, null, error.message, 500);
    }
  },

  async findAccountsByIdentity(identityData) {
    try {
      const rate = this._checkClientRateLimit(
        'findAccounts',
        config.loginRateLimit || 5,
        config.loginRateLimitWindowMs || 60000
      );
      if (!rate.allowed) {
        return createResponse(false, null, `查询过于频繁，请 ${rate.waitSec} 秒后再试`, 429);
      }

      const filter = {
        student_type: identityData.student_type,
        branch: identityData.branch,
        grade: identityData.grade,
        cohort: identityData.cohort
      };

      if (identityData.student_type === 'school' && ['初一', '初二', '初三'].includes(identityData.grade)) {
        filter.class_number = identityData.class_number;
        filter.student_number = identityData.student_number;
      }

      const response = await apiService.query('profiles', {
        select: 'id, uid, nickname',
        filter,
        limit: 20
      });

      if (!response.success) {
        console.error('[账号查询] 错误:', response.message);
        return createResponse(false, null, '查询失败，请稍后重试', 500);
      }

      const accounts = (response.data || []).filter(a => a.uid);

      if (accounts.length === 0) {
        return createResponse(false, null, '未找到符合这些信息的账号，请检查你填写的学生身份、分校、年级、届次、班级和学号是否正确。', 404);
      }

      return createResponse(true, accounts, '', 200);
    } catch (error) {
      console.error('[账号查询] 异常:', error.message);
      return createResponse(false, null, '查询失败，请稍后重试', 500);
    }
  },

  async register(password, nickname = '', additionalData = {}) {
    try {
      const { data: blocked, error: blockError } = await supabase.rpc('registration_is_blocked', {
        p_fdi: getFdi(),
        p_student_type: additionalData.student_type || 'school',
        p_branch: additionalData.branch || null,
        p_grade: additionalData.grade || null,
        p_cohort: additionalData.cohort ?? null,
        p_class_number: additionalData.class_number ?? null,
        p_student_number: additionalData.student_number ?? null
      });
      if (blockError) {
        return createResponse(false, null, '无法完成注册校验，请稍后重试', 500);
      }
      if (blocked === true) {
        return createResponse(false, null, '当前无法完成注册。如有疑问请联系管理员。', 403);
      }

      // 保险策略：UID 必须由服务端 RPC 唯一生成；禁止前端随机降级，避免撞号
      let uid;
      try {
        const { data: uidData, error: uidError } = await supabase.rpc('generate_unique_uid');
        if (uidError) {
          console.error('[UID生成] RPC错误:', uidError.message, '| code:', uidError.code, '| details:', uidError.details);
          return createResponse(false, null, 'UID 生成失败，请稍后重试', 503);
        }
        if (!uidData) {
          console.error('[UID生成] RPC返回空数据');
          return createResponse(false, null, 'UID 生成失败，请稍后重试', 503);
        }
        uid = uidData;
      } catch (e) {
        console.error('[UID生成] 异常:', e.message);
        return createResponse(false, null, 'UID 生成失败，请稍后重试', 503);
      }

      const email = this._generateVirtualEmail(uid);

      if (nickname) {
        const block = await sensitiveWordService.verify(nickname);
        if (block) return block;
      }

      const metaData = {
        nickname: nickname || uid,
        role: UserRoles.MEMBER,
        avatar: `${config.defaultAvatar}${generateUUID()}`,
        uid: uid,
        student_type: additionalData.student_type || 'school',
        branch: additionalData.branch || null,
        grade: additionalData.grade || null,
        cohort: additionalData.cohort || null,
        class_number: additionalData.class_number || null,
        student_number: additionalData.student_number || null
      };

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metaData
        }
      });

      if (error) {
        return createResponse(false, null, error.message, error.status || 400);
      }

      const user = data.user;

      if (!user) {
        return createResponse(false, null, '注册失败', 400);
      }

      return createResponse(true, { user, uid }, '注册成功', 201);
    } catch (error) {
      return createResponse(false, null, error.message, 500);
    }
  },

  async checkDuplicateIdentity(identityData) {
    try {
      const { data, error } = await supabase.rpc('check_duplicate_identity', {
        p_branch: identityData.branch,
        p_grade: identityData.grade,
        p_cohort: identityData.cohort,
        p_class_number: identityData.class_number,
        p_student_number: identityData.student_number
      });

      if (error) {
        return createResponse(false, false, error.message, 400);
      }

      return createResponse(true, data, '', 200);
    } catch (error) {
      return createResponse(false, false, error.message, 500);
    }
  },

  async logout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        return createResponse(false, null, error.message, error.status || 500);
      }

      return createResponse(true, null, '登出成功', 200);
    } catch (error) {
      return createResponse(false, null, error.message, 500);
    }
  },

  async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error) {
        return createResponse(false, null, error.message, error.status || 500);
      }

      if (!user) {
        return createResponse(false, null, '未登录', 401);
      }

      await restoreOwnExpiredBan();
      if (!(await isAccountUsable())) {
        await supabase.auth.signOut();
        return createResponse(false, null, '该账号已被封禁，暂时无法使用', 403);
      }

      const uid = user.user_metadata?.uid || '';
      const isDevAdmin = DEV_ADMIN_UIDS.includes(uid);

      let profile = null;
      try {
        profile = await this._getOwnProfile();
      } catch (e) {
        // profiles 表可能尚未迁移
      }

      const role = isDevAdmin ? UserRoles.DEV_ADMIN : (profile?.role || UserRoles.MEMBER);

      const userInfo = {
        id: user.id,
        uid: uid,
        email: user.email || '',
        role: role,
        nickname: profile?.nickname || user.user_metadata?.nickname || '',
        avatar: profile?.avatar || user.user_metadata?.avatar || '',
        bio: profile?.bio || user.user_metadata?.bio || '',
        signature: profile?.signature || user.user_metadata?.signature || '',
        student_type: profile?.student_type || user.user_metadata?.student_type || 'school',
        branch: profile?.branch || user.user_metadata?.branch || null,
        grade: profile?.grade || user.user_metadata?.grade || null,
        cohort: profile?.cohort || user.user_metadata?.cohort || null,
        class_number: profile?.class_number || user.user_metadata?.class_number || null,
        student_number: profile?.student_number || user.user_metadata?.student_number || null,
        account_status: profile?.account_status || 'active',
        is_dev_admin: isDevAdmin || role === UserRoles.DEV_ADMIN,
        is_admin: isDevAdmin || role === UserRoles.ADMIN || role === UserRoles.DEV_ADMIN,
        created_at: user.created_at,
        updated_at: user.updated_at
      };

      return createResponse(true, userInfo, '', 200);
    } catch (error) {
      return createResponse(false, null, error.message, 500);
    }
  },

  async getProfile() {
    try {
      return await this._getOwnProfile();
    } catch (error) {
      return null;
    }
  },

  async canPost() {
    try {
      const profile = await this.getProfile();
      if (!profile) {
        return { allowed: false, reason: '无法获取用户信息' };
      }

      if (!(await isAccountUsable())) {
        return { allowed: false, reason: '账号已被封禁或禁用' };
      }

      const role = profile.role || UserRoles.MEMBER;
      if (role === UserRoles.GUEST) {
        return { allowed: false, reason: '访客无发帖权限' };
      }

      if (profile.student_type !== 'school') {
        return { allowed: false, reason: '外校学生无发帖权限' };
      }

      if (!['初一', '初二', '初三'].includes(profile.grade)) {
        return { allowed: false, reason: '高中及以上用户无发帖权限' };
      }

      return { allowed: true, reason: '' };
    } catch (error) {
      return { allowed: false, reason: '权限检查失败' };
    }
  },

  async canComment() {
    try {
      const profile = await this.getProfile();
      if (!profile) {
        return { allowed: false, reason: '无法获取用户信息' };
      }

      if (!(await isAccountUsable())) {
        return { allowed: false, reason: '账号已被封禁或禁用' };
      }

      const role = profile.role || UserRoles.MEMBER;
      if (role === UserRoles.GUEST) {
        return { allowed: false, reason: '访客无评论权限' };
      }

      return { allowed: true, reason: '' };
    } catch (error) {
      return { allowed: false, reason: '权限检查失败' };
    }
  },

  async canLike() {
    return this.canComment();
  },

  async canFavorite() {
    return this.canComment();
  },

  async canReport() {
    return this.canComment();
  },

  async isLoggedIn() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return false;
      }
      await restoreOwnExpiredBan();
      if (!(await isAccountUsable())) {
        await supabase.auth.signOut();
        return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  },

  async isAdmin() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      await restoreOwnExpiredBan();
      if (!(await isAccountUsable())) {
        await supabase.auth.signOut();
        return false;
      }
      const uid = user.user_metadata?.uid || '';
      if (DEV_ADMIN_UIDS.includes(uid)) return true;
      let profile = null;
      try {
        profile = await this._getOwnProfile();
      } catch (e) {}
      const role = profile?.role || user.user_metadata?.role || UserRoles.MEMBER;
      return role === UserRoles.ADMIN || role === UserRoles.DEV_ADMIN;
    } catch (error) {
      return false;
    }
  },

  async isDevAdmin() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      await restoreOwnExpiredBan();
      if (!(await isAccountUsable())) {
        await supabase.auth.signOut();
        return false;
      }
      const uid = user.user_metadata?.uid || '';
      if (DEV_ADMIN_UIDS.includes(uid)) return true;
      let profile = null;
      try {
        profile = await this._getOwnProfile();
      } catch (e) {}
      return profile?.role === UserRoles.DEV_ADMIN;
    } catch (error) {
      return false;
    }
  },

  async hasRole(requiredRole) {
    try {
      const response = await this.getCurrentUser();
      if (!response.success) {
        return requiredRole === UserRoles.GUEST;
      }
      const role = response.data.role || UserRoles.MEMBER;
      const hierarchy = {
        [UserRoles.GUEST]: 0,
        [UserRoles.MEMBER]: 1,
        [UserRoles.ADMIN]: 2,
        [UserRoles.DEV_ADMIN]: 3
      };
      return (hierarchy[role] || 0) >= (hierarchy[requiredRole] || 0);
    } catch (error) {
      return false;
    }
  },

  async forgotPassword(uid) {
    try {
      if (!uid || !/^\d{8}$/.test(uid)) {
        return createResponse(false, null, '请输入有效的8位UID', 400);
      }

      const { data, error } = await supabase.rpc('create_password_reset_request', {
        p_uid: uid
      });

      if (error) {
        return createResponse(false, null, error.message, 400);
      }

      return createResponse(true, { requestId: data }, '密码重置请求已提交，请等待管理员处理', 200);
    } catch (error) {
      return createResponse(false, null, error.message, 500);
    }
  },

  async checkPasswordResetStatus(uid) {
    try {
      if (!uid || !/^\d{8}$/.test(uid)) {
        return createResponse(false, null, '请输入有效的8位UID', 400);
      }

      const { data, error } = await supabase.rpc('check_password_reset_status', {
        p_uid: uid
      });

      if (error) {
        return createResponse(false, null, error.message, 400);
      }

      if (!data || data.length === 0) {
        return createResponse(true, null, '', 200);
      }

      return createResponse(true, data[0], '', 200);
    } catch (error) {
      return createResponse(false, null, error.message, 500);
    }
  },

  async resetPasswordWithApproval(uid, newPassword) {
    try {
      if (!uid || !/^\d{8}$/.test(uid)) {
        return createResponse(false, null, '请输入有效的8位UID', 400);
      }

      const letterCount = (newPassword.match(/[a-zA-Z]/g) || []).length;
      const digitCount = (newPassword.match(/[0-9]/g) || []).length;
      if (letterCount < 2 || digitCount < 6) {
        return createResponse(false, null, '密码至少需要2个英文字母和6个数字', 400);
      }

      const { data, error } = await supabase.rpc('reset_password_with_approval', {
        p_uid: uid,
        p_new_password: newPassword
      });

      if (error) {
        return createResponse(false, null, error.message, 400);
      }

      if (!data) {
        return createResponse(false, null, '密码重置失败，请确认管理员已批准您的请求', 400);
      }

      return createResponse(true, null, '密码重置成功，请使用新密码登录', 200);
    } catch (error) {
      return createResponse(false, null, error.message, 500);
    }
  },

  async updatePassword(newPassword) {
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (error) {
        return createResponse(false, null, error.message, error.status || 400);
      }
      return createResponse(true, data, '密码更新成功', 200);
    } catch (error) {
      return createResponse(false, null, error.message, 500);
    }
  },

  async updateUserMetadata(metadata) {
    try {
      // 仅允许公开资料字段同步到 Auth metadata，禁止改写 uid/role 等敏感键
      const allowedKeys = ['nickname', 'bio', 'signature', 'avatar'];
      const safeMetadata = {};
      if (metadata && typeof metadata === 'object') {
        for (const key of allowedKeys) {
          if (Object.prototype.hasOwnProperty.call(metadata, key)) {
            safeMetadata[key] = metadata[key];
          }
        }
      }
      if (Object.keys(safeMetadata).length === 0) {
        return createResponse(false, null, '没有可更新的资料字段', 400);
      }

      const { data, error } = await supabase.auth.updateUser({
        data: safeMetadata
      });
      if (error) {
        return createResponse(false, null, error.message, error.status || 400);
      }
      return createResponse(true, data, '用户信息更新成功', 200);
    } catch (error) {
      return createResponse(false, null, error.message, 500);
    }
  },

  async refreshSession() {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        return createResponse(false, null, error.message, error.status || 401);
      }
      return createResponse(true, data.session, '会话刷新成功', 200);
    } catch (error) {
      return createResponse(false, null, error.message, 500);
    }
  },

  async getSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session;
    } catch (error) {
      return null;
    }
  },

  async getUserInfo(userId) {
    try {
      // 仅暴露公开发布所需的字段，最小权限原则：不返回 student_number/class_number/cohort/role/account_status/uid 等敏感身份字段
      const response = await apiService.findOne('profiles', { id: userId }, 'id, nickname, avatar, bio, signature');
      if (response.success && response.data) {
        const p = response.data;
        return {
          id: userId,
          nickname: p.nickname || '用户',
          avatar: p.avatar || null,
          bio: p.bio || '',
          signature: p.signature || ''
        };
      }
      return { id: userId, nickname: '用户', avatar: null, bio: '', signature: '' };
    } catch (error) {
      return { id: userId, nickname: '用户', avatar: null, bio: '', signature: '' };
    }
  },

  /**
   * 读取当前登录用户的完整资料（本人身份信息）。
   * 通过 SECURITY DEFINER RPC get_own_profile 绕过 profiles 表列级权限限制，
   * 仅返回自己的行，用于权限判断、资格校验、个人资料展示等场景。
   * 返回 null 表示未登录或查询失败。
   */
  async _getOwnProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const r = await apiService.findOne('profiles', { id: user.id });
      return r && r.success && r.data ? r.data : null;
    } catch (e) {
      console.warn('[_getOwnProfile] 异常:', e.message);
      return null;
    }
  },

  async getUsersInfo(userIds) {
    try {
      if (!userIds || userIds.length === 0) {
        return {};
      }

      const uniqueIds = [...new Set(userIds)];
      const response = await apiService.query('profiles', {
        select: 'id, nickname, avatar, bio, signature',
        filter: { id: uniqueIds }
      });

      if (!response.success || !response.data) {
        return {};
      }

      const users = {};
      response.data.forEach(profile => {
        users[profile.id] = {
          id: profile.id,
          nickname: profile.nickname || '用户',
          avatar: profile.avatar || null,
          bio: profile.bio || '',
          signature: profile.signature || ''
        };
      });

      return users;
    } catch (error) {
      return {};
    }
  }
};

export default authService;
