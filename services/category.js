import { apiService } from './api.js';

function createResponse(success, data = null, message = '', statusCode = 200) {
  return {
    success,
    data,
    message,
    statusCode
  };
}

const DEFAULT_CATEGORIES = [
  { id: 'cat-001', name: '综合讨论', slug: 'general', description: '校园热点话题、综合讨论区', icon: 'forum', order: 1, is_active: true },
  { id: 'cat-002', name: '学习交流', slug: 'study', description: '学习资料分享、课程讨论', icon: 'book', order: 2, is_active: true },
  { id: 'cat-003', name: '校园生活', slug: 'life', description: '校园日常、生活分享', icon: 'home', order: 3, is_active: true },
  { id: 'cat-004', name: '社团活动', slug: 'club', description: '社团招新、活动通知', icon: 'group', order: 4, is_active: true },
  { id: 'cat-005', name: '二手交易', slug: 'trade', description: '闲置物品、二手买卖', icon: 'shopping', order: 5, is_active: true },
  { id: 'cat-006', name: '问题求助', slug: 'help', description: '遇到问题，寻求帮助', icon: 'help', order: 6, is_active: true },
  { id: 'cat-007', name: '其他', slug: 'other', description: '其他话题', icon: 'more', order: 99, is_active: true }
];

async function initCategories() {
  try {
    for (const category of DEFAULT_CATEGORIES) {
      await apiService.insert('categories', category);
    }
  } catch (error) {
    console.warn('Category initialization partially failed:', error.message);
  }
}

export const categoryService = {
  async getCategories() {
    try {
      const response = await apiService.query('categories', {
        select: '*',
        filter: { is_active: true },
        order: [{ column: 'order', ascending: true }]
      });

      if (!response.success) {
        if (response.statusCode === 404 || response.message.includes('does not exist')) {
          await initCategories();
          const retryResponse = await apiService.query('categories', {
            select: '*',
            filter: { is_active: true },
            order: [{ column: 'order', ascending: true }]
          });
          if (retryResponse.success) {
            return createResponse(true, retryResponse.data, '', 200);
          }
          return createResponse(false, null, retryResponse.message, retryResponse.statusCode);
        }
        return createResponse(false, null, response.message, response.statusCode);
      }

      if (!response.data || response.data.length === 0) {
        await initCategories();
        const retryResponse = await apiService.query('categories', {
          select: '*',
          filter: { is_active: true },
          order: [{ column: 'order', ascending: true }]
        });
        if (retryResponse.success) {
          return createResponse(true, retryResponse.data, '', 200);
        }
        return createResponse(false, null, retryResponse.message, retryResponse.statusCode);
      }

      return createResponse(true, response.data, '', 200);
    } catch (error) {
      console.error('CategoryService getCategories error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async getCategoryById(categoryId) {
    try {
      const response = await apiService.findOne('categories', { id: categoryId });

      if (!response.success) {
        if (response.statusCode === 404) {
          return createResponse(false, null, '分类不存在', 404);
        }
        return createResponse(false, null, response.message, response.statusCode);
      }

      if (!response.data.is_active) {
        return createResponse(false, null, '分类已停用', 404);
      }

      return createResponse(true, response.data, '', 200);
    } catch (error) {
      console.error('CategoryService getCategoryById error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async getCategoryBySlug(slug) {
    try {
      const response = await apiService.findOne('categories', { slug });

      if (!response.success) {
        if (response.statusCode === 404) {
          return createResponse(false, null, '分类不存在', 404);
        }
        return createResponse(false, null, response.message, response.statusCode);
      }

      if (!response.data.is_active) {
        return createResponse(false, null, '分类已停用', 404);
      }

      return createResponse(true, response.data, '', 200);
    } catch (error) {
      console.error('CategoryService getCategoryBySlug error:', error);
      return createResponse(false, null, error.message, 500);
    }
  }
};

export default categoryService;