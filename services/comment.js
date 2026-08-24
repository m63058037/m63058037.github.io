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
  async createComment(postId, content, parentCommentId = null) {
    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success) {
        return createResponse(false, null, userResponse.message, userResponse.statusCode);
      }

      const userId = userResponse.data.id;

      const permission = await authService.canComment();
      if (!permission.allowed) {
        return createResponse(false, null, permission.reason, 403);
      }

      const commentData = {
        post_id: postId,
        user_id: userId,
        content: content.trim(),
        parent_comment_id: parentCommentId
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
      const mainOptions = {
        select: '*',
        filter: { post_id: postId, is_deleted: false, parent_comment_id: null },
        order: [{ column: 'created_at', ascending: false }]
      };

      const mainResponse = await apiService.paginate('comments', page, pageSize, mainOptions);

      if (!mainResponse.success) {
        return createResponse(false, null, mainResponse.message, mainResponse.statusCode);
      }

      const mainComments = mainResponse.data.data;

      if (mainComments.length === 0) {
        return createResponse(true, {
          comments: [],
          pagination: mainResponse.data.pagination
        }, '', 200);
      }

      const mainCommentIds = mainComments.map(c => c.id);

      const replyResponse = await apiService.query('comments', {
        select: '*',
        filter: { post_id: postId, is_deleted: false, parent_comment_id: mainCommentIds },
        order: [{ column: 'created_at', ascending: true }],
        limit: 100
      });

      let allReplies = [];
      if (replyResponse.success) {
        allReplies = replyResponse.data;
      }

      const replyCountResponse = await apiService.query('comments', {
        select: 'parent_comment_id',
        filter: { post_id: postId, is_deleted: false, parent_comment_id: mainCommentIds }
      });

      let replyCountMap = {};
      if (replyCountResponse.success) {
        replyCountResponse.data.forEach(item => {
          const pid = item.parent_comment_id;
          replyCountMap[pid] = (replyCountMap[pid] || 0) + 1;
        });
      }

      const allComments = [...mainComments, ...allReplies];
      const commentsWithUser = await this._attachUserInfo(allComments);

      const mainCommentsWithUser = commentsWithUser.filter(c => c.parent_comment_id === null);
      const repliesWithUser = commentsWithUser.filter(c => c.parent_comment_id !== null);

      const commentsWithReplies = mainCommentsWithUser.map(comment => {
        const commentReplies = repliesWithUser.filter(reply => reply.parent_comment_id === comment.id);
        return {
          ...comment,
          replies: commentReplies,
          replyCount: replyCountMap[comment.id] || 0,
          hasMoreReplies: (replyCountMap[comment.id] || 0) > commentReplies.length
        };
      });

      return createResponse(true, {
        comments: commentsWithReplies,
        pagination: mainResponse.data.pagination
      }, '', 200);
    } catch (error) {
      console.error('CommentService getComments error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async getReplies(commentId, page = 1, pageSize = 10) {
    try {
      const options = {
        select: '*',
        filter: { parent_comment_id: commentId, is_deleted: false },
        order: [{ column: 'created_at', ascending: true }]
      };

      const response = await apiService.paginate('comments', page, pageSize, options);

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      const replies = response.data.data;
      const repliesWithUser = await this._attachUserInfo(replies);

      return createResponse(true, {
        replies: repliesWithUser,
        pagination: response.data.pagination
      }, '', 200);
    } catch (error) {
      console.error('CommentService getReplies error:', error);
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
      const users = await authService.getUsersInfo(userIds);

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