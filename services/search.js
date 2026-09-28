import { api } from './api.js';

export const searchService = {
  /**
   * 搜索帖子
   * @param {string} keyword - 搜索关键词
   * @param {string} branch - 校区范围，默认 'all'
   * @param {number} page - 页码（从1开始）
   * @param {number} pageSize - 每页数量
   */
  async searchPosts(keyword, branch = 'all', page = 1, pageSize = 20) {
    try {
      const trimmedKeyword = (keyword || '').trim();

      if (!trimmedKeyword) {
        return { success: false, error: '关键词不能为空' };
      }

      const response = await api.rpc('search_posts', {
        p_keyword: trimmedKeyword,
        p_branch: branch,
        p_page: page,
        p_page_size: pageSize
      });

      if (!response.success) {
        return { success: false, error: response.message || '搜索帖子失败' };
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message || '搜索帖子失败' };
    }
  }
};

export default searchService;
