import { api } from './api.js';

export const announcementService = {
  /**
   * 获取未读公告
   */
  async getUnread() {
    try {
      const response = await api.rpc('get_unread_announcements', {});

      if (!response.success) {
        return { success: false, error: response.message || '获取未读公告失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '获取未读公告失败' };
    }
  },

  /**
   * 标记公告为已读
   * @param {string} announcementId - 公告ID
   */
  async markRead(announcementId) {
    try {
      const response = await api.rpc('mark_announcement_read', {
        p_announcement_id: announcementId
      });

      if (!response.success) {
        return { success: false, error: response.message || '标记公告已读失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '标记公告已读失败' };
    }
  },

  /**
   * 管理员获取所有公告
   * @param {number} page - 页码（从1开始）
   * @param {number} pageSize - 每页数量
   */
  async adminGetAll(page = 1, pageSize = 20) {
    try {
      const response = await api.rpc('admin_get_announcements', {
        p_page: page,
        p_page_size: pageSize
      });

      if (!response.success) {
        return { success: false, error: response.message || '获取公告列表失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '获取公告列表失败' };
    }
  },

  /**
   * 管理员创建公告
   * @param {string} title - 公告标题
   * @param {string} content - 公告内容
   * @param {boolean} publish - 是否立即发布
   */
  async adminCreate(title, content, publish = false) {
    try {
      const response = await api.rpc('admin_create_announcement', {
        p_title: title,
        p_content: content,
        p_publish: publish
      });

      if (!response.success) {
        return { success: false, error: response.message || '创建公告失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '创建公告失败' };
    }
  },

  /**
   * 管理员更新公告
   * @param {string} id - 公告ID
   * @param {string} title - 公告标题
   * @param {string} content - 公告内容
   */
  async adminUpdate(id, title, content) {
    try {
      const response = await api.rpc('admin_update_announcement', {
        p_id: id,
        p_title: title,
        p_content: content
      });

      if (!response.success) {
        return { success: false, error: response.message || '更新公告失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '更新公告失败' };
    }
  },

  /**
   * 管理员发布公告
   * @param {string} id - 公告ID
   */
  async adminPublish(id) {
    try {
      const response = await api.rpc('admin_publish_announcement', {
        p_id: id
      });

      if (!response.success) {
        return { success: false, error: response.message || '发布公告失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '发布公告失败' };
    }
  }
};

export default announcementService;
