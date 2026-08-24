import { api } from './api.js';

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
  }
};

export default profileService;
