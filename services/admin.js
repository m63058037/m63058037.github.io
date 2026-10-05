import { api } from './api.js';

export const adminService = {
  /**
   * 获取仪表盘统计数据
   */
  async getDashboardStats() {
    try {
      const response = await api.rpc('admin_get_dashboard_stats', {});

      if (!response.success) {
        return { success: false, error: response.message || '获取仪表盘统计失败' };
      }

      // admin_get_dashboard_stats 返回表格式数组 [{...}]（与 get_forum_stats 一致），需取首行对象
      const data = Array.isArray(response.data) ? (response.data[0] || {}) : (response.data || {});

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message || '获取仪表盘统计失败' };
    }
  },

  /**
   * 获取密码重置请求列表
   * @param {string} status - 状态：pending/approved/rejected
   * @param {number} page - 页码（从1开始）
   * @param {number} pageSize - 每页数量
   */
  async getPasswordResets(status = 'pending', page = 1, pageSize = 20) {
    try {
      const response = await api.rpc('admin_get_password_resets', {
        p_status: status,
        p_page: page,
        p_page_size: pageSize
      });

      if (!response.success) {
        return { success: false, error: response.message || '获取密码重置请求失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '获取密码重置请求失败' };
    }
  },

  /**
   * 批准密码重置请求（7 天资格，不设置用户密码）
   * @param {string} requestId - 请求ID
   */
  async approvePasswordReset(requestId) {
    try {
      const response = await api.rpc('admin_approve_password_reset', {
        p_request_id: requestId
      });

      if (!response.success) {
        return { success: false, error: response.message || '批准密码重置失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '批准密码重置失败' };
    }
  },

  /**
   * 拒绝密码重置请求
   * @param {string} requestId - 请求ID
   * @param {string} reason - 拒绝原因
   */
  async rejectPasswordReset(requestId, reason) {
    try {
      const response = await api.rpc('admin_reject_password_reset', {
        p_request_id: requestId,
        p_reason: reason
      });

      if (!response.success) {
        return { success: false, error: response.message || '拒绝密码重置失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '拒绝密码重置失败' };
    }
  },

  /**
   * 获取举报列表
   * @param {string} status - 状态：pending/handled
   * @param {number} page - 页码（从1开始）
   * @param {number} pageSize - 每页数量
   */
  async getReports(status = 'pending', page = 1, pageSize = 20) {
    try {
      const response = await api.rpc('admin_get_reports', {
        p_status: status,
        p_page: page,
        p_page_size: pageSize
      });

      if (!response.success) {
        return { success: false, error: response.message || '获取举报列表失败' };
      }

      const rows = Array.isArray(response.data) ? response.data : [];
      // 举报说明统一规整到 description，供后台 UI（item.description）读取。
      // 依据确证字段：reports 表真实列为 content、admin_get_reports 应返回字段为 description。
      // 兼容数据库部署版本的 RPC 返回 content（尚未做 description 别名）的情况。
      const data = rows.map(item => ({
        ...item,
        description: item.description ?? item.content ?? null
      }));

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message || '获取举报列表失败' };
    }
  },

  /**
   * 处理举报
   * @param {string} reportId - 举报ID
   * @param {string} action - 处理动作
   * @param {string} result - 处理结果
   */
  async handleReport(reportId, action, result) {
    try {
      const response = await api.rpc('admin_handle_report', {
        p_report_id: reportId,
        p_action: action,
        p_result: result
      });

      if (!response.success) {
        return { success: false, error: response.message || '处理举报失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '处理举报失败' };
    }
  },

  /**
   * 获取当前用户角色
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

export default adminService;
