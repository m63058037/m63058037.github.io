import { postService } from '../services/post.js';
import { authService } from '../services/auth.js';
import { escapeHtml, formatRelativeTime } from '../utils/helpers.js';
import { ALL_BRANCH } from '../config/branches.js';

export class RightSidebarComponent {
  constructor() {
    this.hotPosts = document.getElementById('hotPosts');
    this.latestComments = document.getElementById('latestComments');
    this.totalPosts = document.getElementById('totalPosts');
    this.totalComments = document.getElementById('totalComments');
    this.totalUsers = document.getElementById('totalUsers');

    this.snackbarTimer = null;

    this.init();
  }

  async init() {
    try {
      await Promise.all([
        this.loadHotPosts(),
        this.loadStats(),
        this.loadLatestComments()
      ]);
    } catch (error) {
    }
  }

  async loadHotPosts() {
    try {
      const response = await postService.getHotPostsByBranch(ALL_BRANCH, 5);

      if (!response.success || !response.data || response.data.length === 0) {
        this.renderHotPosts([]);
        return;
      }

      this.renderHotPosts(response.data);
    } catch (error) {
      this.renderHotPosts([]);
    }
  }

  renderHotPosts(posts) {
    if (!posts || posts.length === 0) {
      this.hotPosts.innerHTML = '<p class="no-data">暂无热门帖子</p>';
      return;
    }

    this.hotPosts.innerHTML = posts.map((post, index) => `
      <div class="hot-post-item">
        <span class="hot-rank ${index < 3 ? 'top' : ''}">${index + 1}</span>
        <a href="post-detail.html?id=${escapeHtml(post.id)}" class="hot-post-title">${escapeHtml(post.title)}</a>
        <span class="hot-post-comments">${post.comments_count || 0}评论</span>
      </div>
    `).join('');
  }

  async loadStats() {
    try {
      const response = await postService.getForumStats();

      if (!response.success) {
        this.renderStats({ totalPosts: 0, totalComments: 0, totalUsers: 0 });
        return;
      }

      this.renderStats(response.data);
    } catch (error) {
      this.renderStats({ totalPosts: 0, totalComments: 0, totalUsers: 0 });
    }
  }

  renderStats(stats) {
    this.totalPosts.textContent = (stats.totalPosts || 0).toLocaleString();
    this.totalComments.textContent = (stats.totalComments || 0).toLocaleString();
    this.totalUsers.textContent = (stats.totalUsers || 0).toLocaleString();
  }

  async loadLatestComments() {
    try {
      const response = await postService.getLatestComments(5);

      if (!response.success || !response.data || response.data.length === 0) {
        this.latestComments.innerHTML = '<p class="no-data">暂无最新回复</p>';
        return;
      }

      this.renderLatestComments(response.data);
    } catch (error) {
      this.latestComments.innerHTML = '<p class="no-data">暂无最新回复</p>';
    }
  }

  renderLatestComments(comments) {
    this.latestComments.innerHTML = comments.map(comment => {
      const avatarUrl = comment.user?.avatar ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.user?.id || comment.userId}`;
      const safeNickname = escapeHtml(comment.user?.nickname || '用户');
      const safeContent = escapeHtml((comment.content || '').substring(0, 50));
      const safeTitle = escapeHtml(comment.postTitle || '');

      return `
        <div class="latest-comment-item">
          <img src="${escapeHtml(avatarUrl)}" alt="${safeNickname}" class="comment-avatar" />
          <div class="comment-content">
            <span class="comment-author">${safeNickname}</span>
            <span class="comment-text">${safeContent}</span>
            <a href="post-detail.html?id=${escapeHtml(comment.postId)}" class="comment-post-title">${safeTitle}</a>
          </div>
          <span class="comment-time">${formatRelativeTime(comment.createdAt)}</span>
        </div>
      `;
    }).join('');
  }

  showSnackbar(message) {
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
    }
    const snackbar = document.getElementById('snackbar');
    const snackbarLabel = document.getElementById('snackbarLabel');
    if (snackbar && snackbarLabel) {
      snackbarLabel.textContent = message;
      snackbar.classList.add('show');
      this.snackbarTimer = setTimeout(() => {
        snackbar.classList.remove('show');
      }, 5000);
    }
  }
}

export default RightSidebarComponent;
