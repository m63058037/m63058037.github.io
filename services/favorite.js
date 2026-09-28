import { apiService } from './api.js';
import { authService } from './auth.js';

function createResponse(success, data = null, message = '', statusCode = 200) {
  return {
    success,
    data,
    message,
    statusCode
  };
}

export const favoriteService = {
  async toggleFavorite(postId) {
    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success) {
        return createResponse(false, null, userResponse.message, userResponse.statusCode);
      }

      const userId = userResponse.data.id;

      const permission = await authService.canFavorite();
      if (!permission.allowed) {
        return createResponse(false, null, permission.reason, 403);
      }

      const existingSave = await apiService.query('post_saves', {
        select: '*',
        filter: { post_id: postId, user_id: userId }
      });

      if (existingSave.success && existingSave.data.length > 0) {
        const deleteResponse = await apiService.delete('post_saves', { id: existingSave.data[0].id });
        if (!deleteResponse.success) {
          return createResponse(false, null, deleteResponse.message, deleteResponse.statusCode);
        }

        await apiService.rpc('update_post_favorites_count', { p_post_id: postId });
        return createResponse(true, { saved: false }, '取消收藏成功', 200);
      } else {
        const insertResponse = await apiService.insert('post_saves', {
          post_id: postId,
          user_id: userId
        });

        if (!insertResponse.success) {
          return createResponse(false, null, insertResponse.message, insertResponse.statusCode);
        }

        await apiService.rpc('update_post_favorites_count', { p_post_id: postId });
        return createResponse(true, { saved: true }, '收藏成功', 201);
      }
    } catch (error) {
      console.error('FavoriteService toggleFavorite error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async getFavoriteCount(postId) {
    try {
      const response = await apiService.query('post_saves', {
        select: 'id',
        filter: { post_id: postId }
      });

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      return createResponse(true, response.data.length, '', 200);
    } catch (error) {
      console.error('FavoriteService getFavoriteCount error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async isSaved(postId) {
    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success) {
        return createResponse(false, null, userResponse.message, userResponse.statusCode);
      }

      const userId = userResponse.data.id;

      const response = await apiService.query('post_saves', {
        select: 'id',
        filter: { post_id: postId, user_id: userId }
      });

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      return createResponse(true, response.data.length > 0, '', 200);
    } catch (error) {
      console.error('FavoriteService isSaved error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async getUserFavorites(page = 1, pageSize = 10) {
    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success) {
        return createResponse(false, null, userResponse.message, userResponse.statusCode);
      }

      const userId = userResponse.data.id;

      const response = await apiService.paginate('post_saves', page, pageSize, {
        select: '*, posts(*)',
        filter: { user_id: userId },
        order: [{ column: 'created_at', ascending: false }]
      });

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      const saves = response.data.data;
      const posts = saves.map(save => save.posts).filter(post => post && !post.is_deleted);

      return createResponse(true, { posts, pagination: response.data.pagination }, '', 200);
    } catch (error) {
      console.error('FavoriteService getUserFavorites error:', error);
      return createResponse(false, null, error.message, 500);
    }
  }
};

export default favoriteService;
