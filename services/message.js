import { api } from './api.js';

export const messageService = {
  /**
   * 分页获取用户消息
   * @param {number} page - 页码（从1开始）
   * @param {number} pageSize - 每页数量
   */
  async getMessages(page = 1, pageSize = 20) {
    try {
      const response = await api.rpc('get_user_messages', {
        p_page: page,
        p_page_size: pageSize
      });

      if (!response.success) {
        return { success: false, error: response.message || '获取消息失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '获取消息失败' };
    }
  },

  /**
   * 获取未读消息数量
   */
  async getUnreadCount() {
    try {
      const response = await api.rpc('get_unread_message_count', {});

      if (!response.success) {
        return { success: false, error: response.message || '获取未读消息数失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '获取未读消息数失败' };
    }
  },

  /**
   * 标记消息为已读
   * @param {string} messageId - 消息ID
   */
  async markRead(messageId) {
    try {
      const response = await api.rpc('mark_message_read', {
        p_message_id: messageId
      });

      if (!response.success) {
        return { success: false, error: response.message || '标记已读失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '标记已读失败' };
    }
  },

  /**
   * 管理员获取通知列表
   * @param {number} page - 页码（从1开始）
   * @param {number} pageSize - 每页数量
   */
  async getAdminNotifications(page = 1, pageSize = 20) {
    try {
      const response = await api.rpc('admin_get_notifications', {
        p_page: page,
        p_page_size: pageSize
      });

      if (!response.success) {
        return { success: false, error: response.message || '获取管理员通知失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '获取管理员通知失败' };
    }
  },

  /**
   * 管理员标记通知为已读
   * @param {string} notificationId - 通知ID
   */
  async markAdminNotificationRead(notificationId) {
    try {
      const response = await api.rpc('admin_mark_notification_read', {
        p_notification_id: notificationId
      });

      if (!response.success) {
        return { success: false, error: response.message || '标记通知已读失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '标记通知已读失败' };
    }
  }
};

export default messageService;
