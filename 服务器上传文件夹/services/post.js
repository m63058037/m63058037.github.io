import { apiService } from './api.js';
import { authService } from './auth.js';
import { loggerService } from './logger.js';
import { sensitiveWordService } from './sensitive-word.js';

function createResponse(success, data = null, message = '', statusCode = 200) {
  return {
    success,
    data,
    message,
    statusCode
  };
}

/**
 * 验证标签数组
 * 规则：最多5个，仅中英文，自动带#，去重，大小写不敏感去重
 */
function validateTags(rawTags) {
  if (!rawTags || rawTags.length === 0) {
    return { valid: true, tags: [] };
  }

  if (rawTags.length > 5) {
    return { valid: false, message: '标签最多5个' };
  }

  const cleaned = [];
  for (let raw of rawTags) {
    if (typeof raw !== 'string') continue;
    let tag = raw.trim();
    if (!tag) continue;
    if (!tag.startsWith('#')) {
      tag = '#' + tag;
    }
    const content = tag.slice(1);
    if (!content) {
      return { valid: false, message: '标签不能为空' };
    }
    if (/[0-9]/.test(content)) {
      return { valid: false, message: '标签不能包含数字' };
    }
    if (!/^[\u4e00-\u9fa5a-zA-Z]+$/.test(content)) {
      return { valid: false, message: '标签只能包含中文和英文字母' };
    }
    cleaned.push(tag);
  }

  const seen = new Set();
  const deduped = [];
  for (const tag of cleaned) {
    const lower = tag.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      deduped.push(tag);
    }
  }

  if (deduped.length > 5) {
    return { valid: false, message: '标签最多5个（去重后）' };
  }

  return { valid: true, tags: deduped };
}

export const postService = {
  /**
   * 按校区分页获取帖子（用于首页无限滚动）
   * @param {string} branch - 校区名称或 'all'
   * @param {number} offset - 偏移量
   * @param {number} limit - 每次加载数量（默认20）
   */
  async getPostsByBranch(branch, offset = 0, limit = 20) {
    try {
      const rpcResponse = await apiService.rpc('get_posts_by_branch', {
        p_branch: branch,
        p_offset: offset,
        p_limit: limit
      });

      if (!rpcResponse.success) {
        return createResponse(false, null, rpcResponse.message, rpcResponse.statusCode);
      }

      const rows = rpcResponse.data || [];
      if (rows.length === 0) {
        return createResponse(true, { posts: [], totalCount: 0, hasMore: false }, '', 200);
      }

      const totalCount = rows[0].total_count || 0;
      const postIds = rows.map(r => r.post_id);

      if (postIds.length === 0) {
        return createResponse(true, { posts: [], totalCount, hasMore: false }, '', 200);
      }

      const postsResponse = await apiService.query('posts', {
        select: '*',
        filter: { id: postIds, is_deleted: false },
        order: [
          { column: 'is_pinned', ascending: false },
          { column: 'is_hot', ascending: false },
          { column: 'created_at', ascending: false }
        ]
      });

      if (!postsResponse.success) {
        return createResponse(false, null, postsResponse.message, postsResponse.statusCode);
      }

      let posts = postsResponse.data || [];
      const orderMap = new Map(postIds.map((id, idx) => [id, idx]));
      posts.sort((a, b) => (orderMap.get(a.id) ?? 9999) - (orderMap.get(b.id) ?? 9999));

      const postsWithExtras = await this._attachUserInfo(posts);
      const hasMore = (offset + posts.length) < totalCount;

      return createResponse(true, { posts: postsWithExtras, totalCount, hasMore }, '', 200);
    } catch (error) {
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 获取热门帖子（按校区，最多 limit 条）
   */
  async getHotPostsByBranch(branch, limit = 3) {
    try {
      const rpcResponse = await apiService.rpc('get_hot_posts_by_branch', {
        p_branch: branch,
        p_limit: limit
      });

      if (!rpcResponse.success) {
        return createResponse(false, null, rpcResponse.message, rpcResponse.statusCode);
      }

      const rows = rpcResponse.data || [];
      const postIds = rows.map(r => r.post_id);

      if (postIds.length === 0) {
        return createResponse(true, [], '', 200);
      }

      const postsResponse = await apiService.query('posts', {
        select: '*',
        filter: { id: postIds, is_deleted: false },
        order: [{ column: 'created_at', ascending: false }]
      });

      if (!postsResponse.success) {
        return createResponse(false, null, postsResponse.message, postsResponse.statusCode);
      }

      let posts = postsResponse.data || [];
      const orderMap = new Map(postIds.map((id, idx) => [id, idx]));
      posts.sort((a, b) => (orderMap.get(a.id) ?? 9999) - (orderMap.get(b.id) ?? 9999));

      const postsWithExtras = await this._attachUserInfo(posts);

      return createResponse(true, postsWithExtras, '', 200);
    } catch (error) {
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 兼容旧调用：获取帖子列表（传统分页）
   */
  async getPosts(page = 1, pageSize = 10) {
    try {
      const options = {
        select: '*',
        filter: { is_deleted: false },
        order: [
          { column: 'is_pinned', ascending: false },
          { column: 'created_at', ascending: false }
        ]
      };

      const response = await apiService.paginate('posts', page, pageSize, options);

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      const posts = response.data.data;
      const pagination = response.data.pagination;

      const postsWithUser = await this._attachUserInfo(posts);

      return createResponse(true, { posts: postsWithUser, pagination }, '', 200);
    } catch (error) {
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
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 获取帖子的校区列表
   */
  async getPostBranches(postId) {
    try {
      const rpcResponse = await apiService.rpc('get_post_branches', {
        p_post_id: postId
      });

      if (!rpcResponse.success) {
        return createResponse(false, null, rpcResponse.message, rpcResponse.statusCode);
      }

      const rows = rpcResponse.data || [];
      const branches = rows.map(r => r.branch);

      return createResponse(true, branches, '', 200);
    } catch (error) {
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 创建帖子
   * @param {string} title
   * @param {string} content
   * @param {Array<string>} tags - 标签数组（可含或不含#前缀）
   * @param {Array<string>} branches - 校区范围数组（校区名称或 'all'）
   */
  async createPost(title, content, tags = [], branches = []) {
    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success) {
        return createResponse(false, null, userResponse.message, userResponse.statusCode);
      }

      const userId = userResponse.data.id;

      const permission = await authService.canPost();
      if (!permission.allowed) {
        loggerService.logError(new Error(`Post permission denied: ${permission.reason}`), { operation: 'create_post', userId });
        return createResponse(false, null, permission.reason, 403);
      }

      const blockTitle = await sensitiveWordService.verify(title);
      if (blockTitle) return blockTitle;
      const blockContent = await sensitiveWordService.verify(content);
      if (blockContent) return blockContent;

      const tagResult = validateTags(tags);
      if (!tagResult.valid) {
        return createResponse(false, null, tagResult.message, 400);
      }

      if (!branches || branches.length === 0) {
        return createResponse(false, null, '请选择至少一个校区范围', 400);
      }

      const postData = {
        user_id: userId,
        title: title.trim(),
        content: content.trim(),
        tags: tagResult.tags.length > 0 ? tagResult.tags : null,
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

      const branchResponse = await apiService.rpc('set_post_branches', {
        p_post_id: post.id,
        p_branches: branches
      });

      if (!branchResponse.success) {
        loggerService.logError(new Error(branchResponse.message), { operation: 'set_post_branches', postId: post.id });
      }

      await loggerService.logPost(userId, post.id, 'create', 'success', { title });

      return createResponse(true, post, '帖子发布成功', 201);
    } catch (error) {
      loggerService.logError(error, { operation: 'create_post', table: 'posts' });
      const userId = userResponse?.data?.id;
      await loggerService.logPost(userId, null, 'create', 'failed', { title, error: error.message });
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 更新帖子（编辑模式）
   * @param {string} postId
   * @param {string} title
   * @param {string} content
   * @param {Array<string>} tags
   * @param {Array<string>} branches - 新的校区范围
   */
  async updatePost(postId, title, content, tags = [], branches = null) {
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

      const blockTitle = await sensitiveWordService.verify(title);
      if (blockTitle) return blockTitle;
      const blockContent = await sensitiveWordService.verify(content);
      if (blockContent) return blockContent;

      const tagResult = validateTags(tags);
      if (!tagResult.valid) {
        return createResponse(false, null, tagResult.message, 400);
      }

      const updateData = {
        title: title.trim(),
        content: content.trim(),
        tags: tagResult.tags.length > 0 ? tagResult.tags : null,
        excerpt: content.trim().substring(0, 300)
      };

      const response = await apiService.update('posts', updateData, { id: postId });

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      if (branches !== null && branches.length > 0) {
        const branchResponse = await apiService.rpc('set_post_branches', {
          p_post_id: postId,
          p_branches: branches
        });

        if (!branchResponse.success) {
          loggerService.logError(new Error(branchResponse.message), { operation: 'set_post_branches', postId });
        }
      }

      return createResponse(true, response.data[0], '帖子更新成功', 200);
    } catch (error) {
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
      return createResponse(false, null, error.message, 500);
    }
  },

  async incrementViews(postId) {
    try {
      const response = await apiService.rpc('increment_post_views', { p_post_id: postId });

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      return createResponse(true, null, '', 200);
    } catch (error) {
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

      const postsWithUser = await this._attachUserInfo(response.data.data);

      return createResponse(true, { data: postsWithUser, pagination: response.data.pagination }, '', 200);
    } catch (error) {
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
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 批量查询当前用户对帖子的点赞状态
   * @param {Array<string>} postIds
   */
  async batchGetLikeStatus(postIds) {
    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success || !postIds || postIds.length === 0) {
        return createResponse(true, {}, '', 200);
      }

      const userId = userResponse.data.id;
      const response = await apiService.query('post_likes', {
        select: 'post_id',
        filter: { post_id: postIds, user_id: userId }
      });

      if (!response.success) {
        return createResponse(true, {}, '', 200);
      }

      const likedSet = {};
      (response.data || []).forEach(item => {
        likedSet[item.post_id] = true;
      });

      return createResponse(true, likedSet, '', 200);
    } catch (error) {
      return createResponse(true, {}, '', 200);
    }
  },

  /**
   * 批量查询当前用户对帖子的收藏状态
   * @param {Array<string>} postIds
   */
  async batchGetFavoriteStatus(postIds) {
    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success || !postIds || postIds.length === 0) {
        return createResponse(true, {}, '', 200);
      }

      const userId = userResponse.data.id;
      const response = await apiService.query('post_saves', {
        select: 'post_id',
        filter: { post_id: postIds, user_id: userId }
      });

      if (!response.success) {
        return createResponse(true, {}, '', 200);
      }

      const savedSet = {};
      (response.data || []).forEach(item => {
        savedSet[item.post_id] = true;
      });

      return createResponse(true, savedSet, '', 200);
    } catch (error) {
      return createResponse(true, {}, '', 200);
    }
  },

  /**
   * 获取论坛统计数据
   */
  async getForumStats() {
    try {
      const response = await apiService.rpc('get_forum_stats', {});

      if (!response.success) {
        return createResponse(false, null, response.message, response.statusCode);
      }

      const row = response.data || {};
      return createResponse(true, {
        totalPosts: row.total_posts || 0,
        totalComments: row.total_comments || 0,
        totalUsers: row.total_users || 0
      }, '', 200);
    } catch (error) {
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 获取最新评论（带帖子标题）
   */
  async getLatestComments(limit = 5) {
    try {
      const rpcResponse = await apiService.rpc('get_latest_comments', {
        p_limit: limit
      });

      if (!rpcResponse.success) {
        return createResponse(false, null, rpcResponse.message, rpcResponse.statusCode);
      }

      const rows = rpcResponse.data || [];
      if (rows.length === 0) {
        return createResponse(true, [], '', 200);
      }

      const userIds = [...new Set(rows.map(r => r.user_id))];
      const users = await authService.getUsersInfo(userIds);

      const comments = rows.map(r => ({
        id: r.comment_id,
        postId: r.post_id,
        postTitle: r.post_title,
        content: r.content,
        userId: r.user_id,
        createdAt: r.created_at,
        user: users[r.user_id] || { id: r.user_id, nickname: '用户', avatar: null }
      }));

      return createResponse(true, comments, '', 200);
    } catch (error) {
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 给帖子批量附加：用户信息 + 图片 + 校区
   */
  async _attachUserInfo(posts) {
    try {
      if (!posts || posts.length === 0) {
        return [];
      }

      const userIds = [...new Set(posts.map(post => post.user_id))];
      const users = await authService.getUsersInfo(userIds);

      const postIds = posts.map(post => post.id);

      let allImages = [];
      if (postIds.length > 0) {
        try {
          const imgResponse = await apiService.query('post_images', {
            select: '*',
            filter: { post_id: postIds },
            order: [{ column: 'sort_order', ascending: true }]
          });
          if (imgResponse.success && imgResponse.data) {
            allImages = imgResponse.data;
          }
        } catch (e) {
          // Skip failed image fetch
        }
      }

      let branchMap = {};
      if (postIds.length > 0) {
        try {
          const branchResponse = await apiService.query('post_branches', {
            select: 'post_id, branch',
            filter: { post_id: postIds }
          });
          if (branchResponse.success && branchResponse.data) {
            branchResponse.data.forEach(item => {
              if (!branchMap[item.post_id]) {
                branchMap[item.post_id] = [];
              }
              branchMap[item.post_id].push(item.branch);
            });
          }
        } catch (e) {
          // Skip failed branch fetch
        }
      }

      return posts.map(post => {
        const images = allImages.filter(img => img.post_id === post.id);
        return {
          ...post,
          images,
          branches: branchMap[post.id] || [],
          user: users[post.user_id] || { id: post.user_id, nickname: '用户', avatar: null }
        };
      });
    } catch (error) {
      return posts.map(post => ({
        ...post,
        images: [],
        branches: [],
        user: { id: post.user_id, nickname: '用户', avatar: null }
      }));
    }
  },

  _validateTags: validateTags
};

export default postService;
