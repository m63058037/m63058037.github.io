import { api } from './api.js';
import { sensitiveWordService } from './sensitive-word.js';

export const profileService = {
  /**
   * 获取用户公开资料
   * @param {string} userId - 用户ID
   * @returns {Promise<object>} 单行用户资料或 null
   */
  async getPublicProfile(userId) {
    try {
      const response = await api.rpc('get_user_public_profile', {
        p_user_id: userId
      });

      if (!response.success) {
        return { success: false, error: response.message || '获取用户资料失败' };
      }

      const data = response.data;
      // 处理返回：如果是数组，取第一条；否则直接返回
      const profile = Array.isArray(data) ? (data[0] || null) : (data || null);

      return { success: true, data: profile };
    } catch (error) {
      return { success: false, error: error.message || '获取用户资料失败' };
    }
  },

  /**
   * 获取当前用户的完整资料
   * @returns {Promise<object>} 当前用户的完整信息
   */
  async getFullProfile() {
    try {
      const response = await api.rpc('get_user_full_profile', {});

      if (!response.success) {
        return { success: false, error: response.message || '获取用户完整资料失败' };
      }

      const data = response.data;
      // 处理返回：如果是数组，取第一条；否则直接返回
      const profile = Array.isArray(data) ? (data[0] || null) : (data || null);

      return { success: true, data: profile };
    } catch (error) {
      return { success: false, error: error.message || '获取用户完整资料失败' };
    }
  },

  /**
   * 获取当前用户角色（用于前端判断权限）
   * @returns {Promise<object>} 用户角色信息
   */
  async getCurrentUserRole() {
    try {
      const response = await api.rpc('get_current_user_role', {});

      if (!response.success) {
        return { success: false, error: response.message || '获取用户角色失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '获取用户角色失败' };
    }
  },

  /**
   * 更新当前用户的个人资料字段（持久化到 profiles 表，为头像等资料的唯一权威数据源）
   * @param {object} fields - 需要更新的字段（如 nickname/bio/signature/avatar）
   * @param {string} userId - 当前用户 id
   * @returns {Promise<object>} { success, data, error }
   */
  async updateProfile(fields, userId) {
    try {
      if (!fields || Object.keys(fields).length === 0) {
        return { success: false, error: '没有需要保存的修改' };
      }
      if (!userId) {
        return { success: false, error: '未登录' };
      }

      if (fields.nickname) {
        const block = await sensitiveWordService.verify(fields.nickname);
        if (block) return { success: false, error: block.message };
      }
      if (fields.signature) {
        const block = await sensitiveWordService.verify(fields.signature);
        if (block) return { success: false, error: block.message };
      }

      const response = await api.update('profiles', fields, { id: userId });

      if (!response.success) {
        return { success: false, error: response.message || '资料更新失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '资料更新失败' };
    }
  }
};

export default profileService;
