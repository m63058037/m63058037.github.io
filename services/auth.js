import { supabase, config } from '../config/supabase.js';
import { generateUUID } from '../utils/helpers.js';
import { loggerService } from './logger.js';

/**
 * 响应封装
 * @param {boolean} success - 是否成功
 * @param {any} data - 数据
 * @param {string} message - 消息
 * @param {number} statusCode - 状态码
 * @returns {object} 响应对象
 */
function createResponse(success, data = null, message = '', statusCode = 200) {
  return {
    success,
    data,
    message,
    statusCode
  };
}

/**
 * 用户角色枚举
 */
export const UserRoles = {
  GUEST: 'guest',
  USER: 'user',
  VIP: 'vip',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin'
};

const ADMIN_UIDS = ['10281028'];

/**
 * 认证服务层
 * 只负责登录、注册、登出、获取当前用户、权限判断
 */
export const authService = {
  /**
   * 生成虚拟邮箱
   * 使用UID生成虚拟邮箱用于Supabase Auth
   * @param {string} uid - 用户UID（8位数字）
   * @returns {string} 虚拟邮箱
   */
  _generateVirtualEmail(uid) {
    return `${uid}@campus-forum.local`;
  },

  /**
   * 登录（使用UID）
   * @param {string} uid - 用户UID（8位数字）
   * @param {string} password - 密码
   * @returns {Promise<object>} 响应对象
   */
  async login(uid, password) {
    try {
      const email = this._generateVirtualEmail(uid);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        console.error('Auth login error:', error);
        loggerService.logError(error, { operation: 'login', uid });
        await loggerService.logLogin(null, 'failed', { uid });
        return createResponse(false, null, '用户UID不存在或密码错误', 401);
      }
      
      const user = data.user;
      const session = data.session;
      
      if (!user || !session) {
        loggerService.logError(new Error('登录失败，无法获取用户信息'), { operation: 'login', uid });
        await loggerService.logLogin(null, 'failed', { uid });
        return createResponse(false, null, '登录失败，无法获取用户信息', 401);
      }
      
      await loggerService.logLogin(user.id, 'success', { 
        uid, 
        userAgent: navigator.userAgent,
        ip: ''
      });
      
      return createResponse(true, { user, session }, '登录成功', 200);
    } catch (error) {
      console.error('Auth login exception:', error);
      loggerService.logError(error, { operation: 'login', uid });
      await loggerService.logLogin(null, 'failed', { uid });
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 注册（使用UID）
   * @param {string} uid - 用户UID（8位数字）
   * @param {string} password - 密码
   * @param {string} nickname - 昵称
   * @returns {Promise<object>} 响应对象
   */
  async register(uid, password, nickname = '') {
    try {
      const email = this._generateVirtualEmail(uid);
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nickname: nickname || uid,
            role: UserRoles.USER,
            is_admin: false,
            is_moderator: false,
            is_vip: false,
            avatar: `${config.defaultAvatar}${generateUUID()}`,
            uid: uid
          }
        }
      });
      
      if (error) {
        console.error('Auth register error:', error);
        return createResponse(false, null, error.message, error.status || 400);
      }
      
      const user = data.user;
      
      if (!user) {
        return createResponse(false, null, '注册失败', 400);
      }
      
      return createResponse(true, { user }, '注册成功', 201);
    } catch (error) {
      console.error('Auth register exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 登出
   * @returns {Promise<object>} 响应对象
   */
  async logout() {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('Auth logout error:', error);
        return createResponse(false, null, error.message, error.status || 500);
      }
      
      return createResponse(true, null, '登出成功', 200);
    } catch (error) {
      console.error('Auth logout exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 获取当前用户
   * @returns {Promise<object>} 响应对象
   */
  async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) {
        console.error('Auth getCurrentUser error:', error);
        return createResponse(false, null, error.message, error.status || 500);
      }
      
      if (!user) {
        return createResponse(false, null, '未登录', 401);
      }
      
      const uid = user.user_metadata?.uid || '';
      const isAdminUid = ADMIN_UIDS.includes(uid);
      
      const userInfo = {
        id: user.id,
        uid: uid,
        role: isAdminUid ? UserRoles.SUPER_ADMIN : (user.user_metadata?.role || UserRoles.USER),
        nickname: user.user_metadata?.nickname || '',
        avatar: user.user_metadata?.avatar || '',
        is_admin: isAdminUid || user.user_metadata?.is_admin || false,
        is_moderator: isAdminUid || user.user_metadata?.is_moderator || false,
        is_vip: isAdminUid || user.user_metadata?.is_vip || false,
        created_at: user.created_at,
        updated_at: user.updated_at
      };
      
      return createResponse(true, userInfo, '', 200);
    } catch (error) {
      console.error('Auth getCurrentUser exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 检查是否已登录
   * @returns {Promise<boolean>} 是否已登录
   */
  async isLoggedIn() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return !!user;
    } catch (error) {
      console.error('Auth isLoggedIn error:', error);
      return false;
    }
  },

  /**
   * 检查是否为管理员
   * @returns {Promise<boolean>} 是否为管理员
   */
  async isAdmin() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const uid = user.user_metadata?.uid || '';
      if (ADMIN_UIDS.includes(uid)) return true;
      const role = user.user_metadata?.role || UserRoles.USER;
      return user.user_metadata?.is_admin || role === UserRoles.ADMIN || role === UserRoles.SUPER_ADMIN;
    } catch (error) {
      console.error('Auth isAdmin error:', error);
      return false;
    }
  },

  /**
   * 检查是否为版主
   * @returns {Promise<boolean>} 是否为版主
   */
  async isModerator() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const role = user.user_metadata?.role || UserRoles.USER;
      return user.user_metadata?.is_moderator || role === UserRoles.MODERATOR;
    } catch (error) {
      console.error('Auth isModerator error:', error);
      return false;
    }
  },

  /**
   * 检查是否为VIP
   * @returns {Promise<boolean>} 是否为VIP
   */
  async isVip() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const role = user.user_metadata?.role || UserRoles.USER;
      return user.user_metadata?.is_vip || role === UserRoles.VIP;
    } catch (error) {
      console.error('Auth isVip error:', error);
      return false;
    }
  },

  /**
   * 检查是否为超级管理员
   * @returns {Promise<boolean>} 是否为超级管理员
   */
  async isSuperAdmin() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const uid = user.user_metadata?.uid || '';
      if (ADMIN_UIDS.includes(uid)) return true;
      const role = user.user_metadata?.role || UserRoles.USER;
      return role === UserRoles.SUPER_ADMIN;
    } catch (error) {
      console.error('Auth isSuperAdmin error:', error);
      return false;
    }
  },

  /**
   * 检查用户权限
   * @param {string} requiredRole - 所需角色
   * @returns {Promise<boolean>} 是否有权限
   */
  async hasRole(requiredRole) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      
      const role = user.user_metadata?.role || UserRoles.USER;
      
      const roleHierarchy = {
        [UserRoles.GUEST]: 0,
        [UserRoles.USER]: 1,
        [UserRoles.VIP]: 2,
        [UserRoles.MODERATOR]: 3,
        [UserRoles.ADMIN]: 4,
        [UserRoles.SUPER_ADMIN]: 5
      };
      
      const userRoleLevel = roleHierarchy[role] || 0;
      const requiredRoleLevel = roleHierarchy[requiredRole] || 0;
      
      return userRoleLevel >= requiredRoleLevel;
    } catch (error) {
      console.error('Auth hasRole error:', error);
      return false;
    }
  },

  /**
   * 重置密码（发送重置链接）
   * @param {string} email - 邮箱
   * @returns {Promise<object>} 响应对象
   */
  async resetPassword(email) {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      
      if (error) {
        console.error('Auth resetPassword error:', error);
        return createResponse(false, null, error.message, error.status || 400);
      }
      
      return createResponse(true, data, '重置密码链接已发送，请检查邮箱', 200);
    } catch (error) {
      console.error('Auth resetPassword exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 更新用户密码
   * @param {string} newPassword - 新密码
   * @returns {Promise<object>} 响应对象
   */
  async updatePassword(newPassword) {
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      });
      
      if (error) {
        console.error('Auth updatePassword error:', error);
        return createResponse(false, null, error.message, error.status || 400);
      }
      
      return createResponse(true, data, '密码更新成功', 200);
    } catch (error) {
      console.error('Auth updatePassword exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 更新用户邮箱
   * @param {string} email - 新邮箱
   * @returns {Promise<object>} 响应对象
   */
  async updateEmail(email) {
    try {
      const { data, error } = await supabase.auth.updateUser({
        email
      });
      
      if (error) {
        console.error('Auth updateEmail error:', error);
        return createResponse(false, null, error.message, error.status || 400);
      }
      
      return createResponse(true, data, '邮箱更新成功，请验证新邮箱', 200);
    } catch (error) {
      console.error('Auth updateEmail exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 更新用户元数据
   * @param {object} metadata - 用户元数据
   * @returns {Promise<object>} 响应对象
   */
  async updateUserMetadata(metadata) {
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: metadata
      });
      
      if (error) {
        console.error('Auth updateUserMetadata error:', error);
        return createResponse(false, null, error.message, error.status || 400);
      }
      
      return createResponse(true, data, '用户信息更新成功', 200);
    } catch (error) {
      console.error('Auth updateUserMetadata exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 刷新会话
   * @returns {Promise<object>} 响应对象
   */
  async refreshSession() {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error('Auth refreshSession error:', error);
        return createResponse(false, null, error.message, error.status || 401);
      }
      
      return createResponse(true, data.session, '会话刷新成功', 200);
    } catch (error) {
      console.error('Auth refreshSession exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 获取当前会话
   * @returns {Promise<object|null>} 会话信息
   */
  async getSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session;
    } catch (error) {
      console.error('Auth getSession error:', error);
      return null;
    }
  }
};

export default authService;