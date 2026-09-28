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

export const likeService = {
  async toggleLike(postId) {
    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success) {
        return createResponse(false, null, userResponse.message, userResponse.statusCode);
      }

      const userId = userResponse.data.id;

      const existingLike = await apiService.query('post_likes', {
        select: '*',
        filter: { post_id: postId, user_id: userId }
      });

      if (existingLike.success && existingLike.data.length > 0) {
        const deleteResponse = await apiService.delete('post_likes', { id: existingLike.data[0].id });
        if (!deleteResponse.success) {
          return createResponse(false, null, deleteResponse.message, deleteResponse.statusCode);
        }

        await apiService.rpc('update_post_likes_count', { p_post_id: postId });
        return createResponse(true, { liked: false }, '取消点赞成功', 200);
      } else {
        const insertResponse = await apiService.insert('post_likes', {
          post_id: postId,
          user_id: userId
        });

        if (!insertResponse.success) {
          return createResponse(false, null, insertResponse.message, insertResponse.statusCode);
        }

        await apiService.rpc('update_post_likes_count', { p_post_id: postId });
        return createResponse(true, { liked: true }, '点赞成功', 201);
      }
    } catch (error) {
      console.error('LikeService toggleLike error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async getLikeCount(postId) {
    try {
      const response = await apiService.query('post_likes', {
        select: 'id',
        filter: { post_id: postId }
      });

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      return createResponse(true, response.data.length, '', 200);
    } catch (error) {
      console.error('LikeService getLikeCount error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async isLiked(postId) {
    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success) {
        return createResponse(false, null, userResponse.message, userResponse.statusCode);
      }

      const userId = userResponse.data.id;

      const response = await apiService.query('post_likes', {
        select: 'id',
        filter: { post_id: postId, user_id: userId }
      });

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      return createResponse(true, response.data.length > 0, '', 200);
    } catch (error) {
      console.error('LikeService isLiked error:', error);
      return createResponse(false, null, error.message, 500);
    }
  }
};

export default likeService;