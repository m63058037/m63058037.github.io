import { apiService } from './api.js';
import { authService } from './auth.js';
import { sensitiveWordService } from './sensitive-word.js';

function createResponse(success, data = null, message = '', statusCode = 200) {
  return {
    success,
    data,
    message,
    statusCode
  };
}

export const ReportTypes = {
  ADVERTISING: 'advertising',
  HARASSMENT: 'harassment',
  TRADING: 'trading',
  ABUSE: 'abuse',
  NOT_STUDENT: 'not_student',
  OTHER: 'other'
};

export const ReportTypeLabels = {
  [ReportTypes.ADVERTISING]: '广告行为',
  [ReportTypes.HARASSMENT]: '存在骚扰行为',
  [ReportTypes.TRADING]: '存在交易行为',
  [ReportTypes.ABUSE]: '辱骂行为',
  [ReportTypes.NOT_STUDENT]: '该用户疑似不是我校学生',
  [ReportTypes.OTHER]: '其他'
};

export const REPORT_TYPES_ORDER = [
  ReportTypes.ADVERTISING,
  ReportTypes.HARASSMENT,
  ReportTypes.TRADING,
  ReportTypes.ABUSE,
  ReportTypes.NOT_STUDENT,
  ReportTypes.OTHER
];

export const reportService = {
  async createReport(targetType, targetId, reportType, content = '') {
    try {
      if (!targetType || !targetId || !reportType) {
        return createResponse(false, null, '举报类型和目标不能为空', 400);
      }

      const validTargetTypes = ['post', 'comment', 'user'];
      if (!validTargetTypes.includes(targetType)) {
        return createResponse(false, null, '无效的举报目标类型', 400);
      }

      const validReportTypes = Object.values(ReportTypes);
      if (!validReportTypes.includes(reportType)) {
        return createResponse(false, null, '无效的举报类型', 400);
      }

      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success) {
        return createResponse(false, null, userResponse.message, userResponse.statusCode);
      }

      const userId = userResponse.data.id;

      const permission = await authService.canReport();
      if (!permission.allowed) {
        return createResponse(false, null, permission.reason, 403);
      }

      // 检查是否重复举报同一目标
      const existingReport = await apiService.query('reports', {
        select: 'id',
        filter: {
          reporter_id: userId,
          target_type: targetType,
          target_id: targetId
        }
      });

      if (existingReport.success && existingReport.data.length > 0) {
        return createResponse(false, null, '您已经举报过此内容，请勿重复举报', 400);
      }

      const trimmedContent = content.trim();
      if (trimmedContent.length > 500) {
        return createResponse(false, null, '举报说明不能超过500个字符', 400);
      }

      if (trimmedContent) {
        const block = await sensitiveWordService.verify(trimmedContent);
        if (block) return block;
      }

      const reportData = {
        reporter_id: userId,
        target_type: targetType,
        target_id: targetId,
        report_type: reportType,
        content: trimmedContent,
        status: 'pending'
      };

      const response = await apiService.insert('reports', reportData);

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      return createResponse(true, response.data[0], '举报提交成功，我们会尽快处理', 201);
    } catch (error) {
      console.error('ReportService createReport error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async getUserReports(page = 1, pageSize = 10) {
    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success) {
        return createResponse(false, null, userResponse.message, userResponse.statusCode);
      }

      const userId = userResponse.data.id;

      const response = await apiService.paginate('reports', page, pageSize, {
        select: '*',
        filter: { reporter_id: userId },
        order: [{ column: 'created_at', ascending: false }]
      });

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      return createResponse(true, response.data, '', 200);
    } catch (error) {
      console.error('ReportService getUserReports error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async getReportStatus(reportId) {
    try {
      const response = await apiService.findOne('reports', { id: reportId });

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      return createResponse(true, response.data, '', 200);
    } catch (error) {
      console.error('ReportService getReportStatus error:', error);
      return createResponse(false, null, error.message, 500);
    }
  }
};

export default reportService;
