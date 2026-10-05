import { api } from './api.js';
import { getFdi } from '../js/fdi.js';

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

  async applyPenalty(targetUid, type, durationCode, reason, postIds) {
    try {
      const response = await api.rpc('admin_apply_penalty', {
        p_target_uid: targetUid,
        p_type: type,
        p_duration_code: durationCode,
        p_reason: reason,
        p_post_ids: postIds,
        p_fdi: getFdi()
      });
      if (!response.success) {
        return { success: false, error: response.message || '处罚失败' };
      }
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '处罚失败' };
    }
  },

  async liftTemporaryBan(targetUid, reason) {
    try {
      const response = await api.rpc('admin_lift_temporary_ban', {
        p_target_uid: targetUid,
        p_reason: reason
      });
      if (!response.success) {
        return { success: false, error: response.message || '解除临时封禁失败' };
      }
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '解除临时封禁失败' };
    }
  },

  async liftPermanentBan(targetUid, reason) {
    try {
      const response = await api.rpc('dev_admin_lift_permanent_ban', {
        p_target_uid: targetUid,
        p_reason: reason
      });
      if (!response.success) {
        return { success: false, error: response.message || '解除永久封禁失败' };
      }
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '解除永久封禁失败' };
    }
  },

  async listPenalties(targetUid, page = 1, pageSize = 20) {
    try {
      const response = await api.rpc('admin_list_penalties', {
        p_target_uid: targetUid || null,
        p_actor_uid: null,
        p_type: null,
        p_page: page,
        p_page_size: pageSize
      });
      if (!response.success) {
        return { success: false, error: response.message || '获取处罚历史失败' };
      }
      return { success: true, data: Array.isArray(response.data) ? response.data : [] };
    } catch (error) {
      return { success: false, error: error.message || '获取处罚历史失败' };
    }
  },

  async listPenaltyPosts(penaltyId) {
    try {
      const response = await api.rpc('admin_list_penalty_posts', {
        p_penalty_id: penaltyId
      });
      if (!response.success) {
        return { success: false, error: response.message || '获取处罚证据失败' };
      }
      return { success: true, data: Array.isArray(response.data) ? response.data : [] };
    } catch (error) {
      return { success: false, error: error.message || '获取处罚证据失败' };
    }
  },

  async listUserPosts(uid) {
    try {
      const response = await api.rpc('admin_list_user_posts', {
        p_uid: uid
      });
      if (!response.success) {
        return { success: false, error: response.message || '获取用户帖子失败' };
      }
      return { success: true, data: Array.isArray(response.data) ? response.data : [] };
    } catch (error) {
      return { success: false, error: error.message || '获取用户帖子失败' };
    }
  },

  async listAuditLogs(filters = {}, page = 1, pageSize = 20) {
    try {
      const response = await api.rpc('admin_list_audit_logs', {
        p_target_uid: filters.targetUid || null,
        p_actor_uid: filters.actorUid || null,
        p_action: filters.action || null,
        p_page: page,
        p_page_size: pageSize
      });
      if (!response.success) {
        return { success: false, error: response.message || '获取审计日志失败' };
      }
      return { success: true, data: Array.isArray(response.data) ? response.data : [] };
    } catch (error) {
      return { success: false, error: error.message || '获取审计日志失败' };
    }
  },

  async grantAdmin(targetUid) {
    try {
      const response = await api.rpc('dev_admin_grant_admin', {
        p_target_uid: targetUid
      });
      if (!response.success) {
        return { success: false, error: response.message || '授予管理员失败' };
      }
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '授予管理员失败' };
    }
  },

  async revokeAdmin(targetUid) {
    try {
      const response = await api.rpc('dev_admin_revoke_admin', {
        p_target_uid: targetUid
      });
      if (!response.success) {
        return { success: false, error: response.message || '撤销管理员失败' };
      }
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '撤销管理员失败' };
    }
  },

  async getSensitiveHits(level, handleStatus, page = 1, pageSize = 20) {
    try {
      const response = await api.rpc('admin_sensitive_hits_get', {
        p_level: level,
        p_handle_status: handleStatus,
        p_page: page,
        p_page_size: pageSize
      });
      if (!response.success) {
        return { success: false, error: response.message || '获取敏感词命中失败' };
      }
      return { success: true, data: Array.isArray(response.data) ? response.data : [] };
    } catch (error) {
      return { success: false, error: error.message || '获取敏感词命中失败' };
    }
  },

  async handleSensitiveHit(hitId, action, result) {
    try {
      const response = await api.rpc('admin_sensitive_handle_hit', {
        p_hit_id: hitId,
        p_action: action,
        p_result: result || ''
      });
      if (!response.success) {
        return { success: false, error: response.message || '处置敏感词命中失败' };
      }
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '处置敏感词命中失败' };
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
