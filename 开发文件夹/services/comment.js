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

export const commentService = {
  async createComment(postId, content) {
    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success) {
        return createResponse(false, null, userResponse.message, userResponse.statusCode);
      }

      const userId = userResponse.data.id;

      const commentData = {
        post_id: postId,
        user_id: userId,
        content: content.trim()
      };

      const response = await apiService.insert('comments', commentData);

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      await apiService.rpc('update_post_comments_count', { p_post_id: postId });

      const comment = response.data[0];
      const userInfo = await this._getUserInfo(userId);
      comment.user = userInfo;

      return createResponse(true, comment, '评论发表成功', 201);
    } catch (error) {
      console.error('CommentService createComment error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async getComments(postId, page = 1, pageSize = 20) {
    try {
      const options = {
        select: '*',
        filter: { post_id: postId, is_deleted: false },
        order: [{ column: 'created_at', ascending: false }]
      };

      const response = await apiService.paginate('comments', page, pageSize, options);

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      const comments = response.data.data;
      const commentsWithUser = await this._attachUserInfo(comments);

      return createResponse(true, { comments: commentsWithUser, pagination: response.data.pagination }, '', 200);
    } catch (error) {
      console.error('CommentService getComments error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async deleteComment(commentId) {
    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success) {
        return createResponse(false, null, userResponse.message, userResponse.statusCode);
      }

      const userId = userResponse.data.id;

      const commentResponse = await apiService.findOne('comments', { id: commentId });
      if (!commentResponse.success) {
        return commentResponse;
      }

      if (commentResponse.data.user_id !== userId) {
        return createResponse(false, null, '无权删除此评论', 403);
      }

      const response = await apiService.update('comments', { is_deleted: true }, { id: commentId });

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      await apiService.rpc('update_post_comments_count', { p_post_id: commentResponse.data.post_id });

      return createResponse(true, null, '评论删除成功', 200);
    } catch (error) {
      console.error('CommentService deleteComment error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async getCommentCount(postId) {
    try {
      const response = await apiService.query('comments', {
        select: 'id',
        filter: { post_id: postId, is_deleted: false }
      });

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      return createResponse(true, response.data.length, '', 200);
    } catch (error) {
      console.error('CommentService getCommentCount error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async _attachUserInfo(comments) {
    try {
      if (!comments || comments.length === 0) {
        return [];
      }

      const userIds = [...new Set(comments.map(comment => comment.user_id))];
      const users = {};

      for (const userId of userIds) {
        try {
          const userInfo = await authService.getUserInfo(userId);
          if (userInfo) {
            users[userId] = userInfo;
          }
        } catch (e) {
          console.warn('Failed to fetch user info for:', userId);
        }
      }

      return comments.map(comment => ({
        ...comment,
        user: users[comment.user_id] || { id: comment.user_id, nickname: '用户', avatar: null }
      }));
    } catch (error) {
      console.error('CommentService _attachUserInfo error:', error);
      return comments.map(comment => ({
        ...comment,
        user: { id: comment.user_id, nickname: '用户', avatar: null }
      }));
    }
  },

  async _getUserInfo(userId) {
    try {
      return await authService.getUserInfo(userId);
    } catch (error) {
      console.error('CommentService _getUserInfo error:', error);
      return { id: userId, nickname: '用户', avatar: null };
    }
  }
};

export default commentService;