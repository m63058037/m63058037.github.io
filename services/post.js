import { apiService } from './api.js';
import { authService } from './auth.js';
import { loggerService } from './logger.js';
import { supabase } from '../config/supabase.js';

function createResponse(success, data = null, message = '', statusCode = 200) {
  return {
    success,
    data,
    message,
    statusCode
  };
}

export const postService = {
  async getPosts(page = 1, pageSize = 10, categoryId = null) {
    try {
      const options = {
        select: '*',
        filter: { is_deleted: false },
        order: [
          { column: 'is_pinned', ascending: false },
          { column: 'created_at', ascending: false }
        ]
      };

      if (categoryId) {
        options.filter.category_id = categoryId;
      }

      const response = await apiService.paginate('posts', page, pageSize, options);
      
      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      const posts = response.data.data;
      const pagination = response.data.pagination;

      const postsWithUser = await this._attachUserInfo(posts);

      return createResponse(true, { posts: postsWithUser, pagination }, '', 200);
    } catch (error) {
      console.error('PostService getPosts error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async getPostById(postId) {
    try {
      const response = await apiService.findOne('posts', { id: postId });
      
      if (!response.success) {
        if (response.statusCode === 404) {
          return createResponse(false, null, '帖子不存在', 404);
        }
        return createResponse(false, null, response.message, response.statusCode);
      }

      const post = response.data;
      if (!post || post.is_deleted) {
        return createResponse(false, null, '帖子不存在', 404);
      }

      const postWithUser = await this._attachUserInfo([post]);

      return createResponse(true, postWithUser[0], '', 200);
    } catch (error) {
      console.error('PostService getPostById error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async createPost(title, content, categoryId = null, tags = []) {
    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success) {
        return createResponse(false, null, userResponse.message, userResponse.statusCode);
      }

      const userId = userResponse.data.id;

      const postData = {
        user_id: userId,
        title: title.trim(),
        content: content.trim(),
        category_id: categoryId,
        tags: tags.length > 0 ? tags : null,
        excerpt: content.trim().substring(0, 300),
        is_pinned: false,
        is_hot: false,
        is_locked: false,
        is_deleted: false,
        views_count: 0,
        likes_count: 0,
        comments_count: 0,
        favorites_count: 0
      };

      const response = await apiService.insert('posts', postData);

      if (!response.success) {
        loggerService.logError(new Error(response.message), { operation: 'create_post', userId, table: 'posts' });
        await loggerService.logPost(userId, null, 'create', 'failed', { title });
        return createResponse(false, null, response.message, response.statusCode);
      }

      const post = response.data[0];
      await loggerService.logPost(userId, post.id, 'create', 'success', { title });
      
      return createResponse(true, post, '帖子发布成功', 201);
    } catch (error) {
      console.error('PostService createPost error:', error);
      loggerService.logError(error, { operation: 'create_post', table: 'posts' });
      const userId = userResponse.data?.id;
      await loggerService.logPost(userId, null, 'create', 'failed', { title, error: error.message });
      return createResponse(false, null, error.message, 500);
    }
  },

  async updatePost(postId, title, content, categoryId = null, tags = []) {
    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success) {
        return createResponse(false, null, userResponse.message, userResponse.statusCode);
      }

      const userId = userResponse.data.id;

      const postResponse = await this.getPostById(postId);
      if (!postResponse.success) {
        return postResponse;
      }

      if (postResponse.data.user_id !== userId) {
        return createResponse(false, null, '无权修改此帖子', 403);
      }

      const updateData = {
        title: title.trim(),
        content: content.trim(),
        category_id: categoryId,
        tags: tags.length > 0 ? tags : null,
        excerpt: content.trim().substring(0, 300)
      };

      const response = await apiService.update('posts', updateData, { id: postId });

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      return createResponse(true, response.data[0], '帖子更新成功', 200);
    } catch (error) {
      console.error('PostService updatePost error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async deletePost(postId) {
    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success) {
        return createResponse(false, null, userResponse.message, userResponse.statusCode);
      }

      const userId = userResponse.data.id;

      const postResponse = await this.getPostById(postId);
      if (!postResponse.success) {
        return postResponse;
      }

      if (postResponse.data.user_id !== userId) {
        return createResponse(false, null, '无权删除此帖子', 403);
      }

      const response = await apiService.update('posts', { is_deleted: true }, { id: postId });

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      return createResponse(true, null, '帖子删除成功', 200);
    } catch (error) {
      console.error('PostService deletePost error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async incrementViews(postId) {
    try {
      const response = await apiService.rpc('increment_post_views', { post_id: postId });

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      return createResponse(true, null, '', 200);
    } catch (error) {
      console.error('PostService incrementViews error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async getUserPosts(userId, page = 1, pageSize = 10) {
    try {
      const options = {
        select: '*',
        filter: { user_id: userId, is_deleted: false },
        order: [{ column: 'created_at', ascending: false }]
      };

      const response = await apiService.paginate('posts', page, pageSize, options);

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      return createResponse(true, response.data, '', 200);
    } catch (error) {
      console.error('PostService getUserPosts error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async savePostImages(postId, images) {
    try {
      if (!postId || !images || images.length === 0) {
        return createResponse(false, null, '参数错误', 400);
      }

      const postImagesData = images.map((image, index) => ({
        post_id: postId,
        url: image.url,
        path: image.path,
        file_name: image.fileName,
        sort_order: index
      }));

      const response = await apiService.insert('post_images', postImagesData);

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      return createResponse(true, response.data, '图片关联保存成功', 201);
    } catch (error) {
      console.error('PostService savePostImages error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async getPostImages(postId) {
    try {
      const response = await apiService.query('post_images', {
        select: '*',
        filter: { post_id: postId },
        order: [{ column: 'sort_order', ascending: true }]
      });

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      return createResponse(true, response.data, '', 200);
    } catch (error) {
      console.error('PostService getPostImages error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async _attachUserInfo(posts) {
    try {
      if (!posts || posts.length === 0) {
        return [];
      }

      const userIds = [...new Set(posts.map(post => post.user_id))];
      const users = {};

      for (const userId of userIds) {
        try {
          const { data: { user }, error } = await supabase.auth.admin.getUserById(userId);
          if (!error && user) {
            users[userId] = {
              id: user.id,
              nickname: user.user_metadata?.nickname || userId.substring(0, 8),
              avatar: user.user_metadata?.avatar || null
            };
          }
        } catch (e) {
          console.warn('Failed to fetch user info for:', userId);
        }
      }

      return posts.map(post => ({
        ...post,
        user: users[post.user_id] || { id: post.user_id, nickname: '用户', avatar: null }
      }));
    } catch (error) {
      console.error('PostService _attachUserInfo error:', error);
      return posts.map(post => ({
        ...post,
        user: { id: post.user_id, nickname: '用户', avatar: null }
      }));
    }
  }
};

export default postService;