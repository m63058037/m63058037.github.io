import { authService } from '../services/auth.js';
import { favoriteService } from '../services/favorite.js';
import { escapeHtml } from '../utils/helpers.js';

class FavoritesPage {
  constructor() {
    this.currentPage = 1;
    this.pageSize = 10;

    this.postsList = document.getElementById('postsList');
    this.postsLoading = document.getElementById('postsLoading');
    this.noPosts = document.getElementById('noPosts');
    this.pagination = document.getElementById('pagination');
    this.backButton = document.getElementById('backButton');

    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');

    this.snackbarTimer = null;

    this.init();
  }

  async init() {
    try {
      await this.checkSession();
      await this.loadFavorites();
      this.bindEvents();
    } catch (error) {
      this.showSnackbar('加载失败');
    }
  }

  async checkSession() {
    const isLoggedIn = await authService.isLoggedIn();
    if (!isLoggedIn) {
      window.location.href = 'login.html';
      throw new Error('User not logged in');
    }
  }

  async loadFavorites() {
    this.showLoading(true);
    this.noPosts.style.display = 'none';
    this.postsList.innerHTML = '';

    try {
      const response = await favoriteService.getUserFavorites(this.currentPage, this.pageSize);

      if (!response.success) {
        this.showEmptyState();
        return;
      }

      const { posts, pagination } = response.data;

      if (!posts || posts.length === 0) {
        this.showEmptyState();
        return;
      }

      this.renderPosts(posts);
      this.renderPagination(pagination);
    } catch (error) {
      this.showEmptyState();
    } finally {
      this.showLoading(false);
    }
  }

  renderPosts(posts) {
    posts.forEach(post => {
      const postElement = this.createPostElement(post);
      this.postsList.appendChild(postElement);
    });
  }

  createPostElement(post) {
    const postCard = document.createElement('article');
    postCard.className = 'post-card';
    postCard.dataset.postId = post.id;

    const pinnedBadge = post.is_pinned ?
      '<span class="post-badge pinned">置顶</span>' : '';
    const hotBadge = post.is_hot ?
      '<span class="post-badge hot">热门</span>' : '';

    const avatarUrl = post.user?.avatar ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.user?.id || post.user_id}`;

    const safeNickname = escapeHtml(post.user?.nickname || '用户');
    const safeAvatarUrl = escapeHtml(avatarUrl);
    const safeTitle = escapeHtml(post.title);
    const safeExcerpt = escapeHtml(post.excerpt || post.content?.substring(0, 200) || '暂无内容');
    const safePostId = escapeHtml(post.id);
    const safeTags = post.tags && post.tags.length > 0
      ? post.tags.slice(0, 3).map(tag => `<span class="post-tag">${escapeHtml(tag)}</span>`)
      : '';

    postCard.innerHTML = `
      <div class="post-header">
        <div class="post-author">
          <img src="${safeAvatarUrl}" alt="${safeNickname}" class="author-avatar" />
          <div class="author-info">
            <span class="author-name">${safeNickname}</span>
            <span class="post-time">${this.formatTime(post.created_at)}</span>
          </div>
        </div>
        <div class="post-badges">
          ${pinnedBadge}
          ${hotBadge}
        </div>
      </div>

      <h2 class="post-title">
        <a href="post-detail.html?id=${safePostId}">${safeTitle}</a>
      </h2>

      <p class="post-excerpt">${safeExcerpt}</p>

      <div class="post-footer">
        <div class="post-meta">
          ${safeTags}
        </div>
        <div class="post-stats">
          <span class="stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            ${post.views_count || 0}
          </span>
          <span class="stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
            ${post.likes_count || 0}
          </span>
          <span class="stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
            ${post.comments_count || 0}
          </span>
        </div>
      </div>
    `;

    return postCard;
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) {
      return '刚刚';
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}分钟前`;
    } else if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}小时前`;
    } else if (diff < 604800000) {
      return `${Math.floor(diff / 86400000)}天前`;
    } else {
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    }
  }

  renderPagination(pagination) {
    if (pagination.totalPages <= 1) {
      this.pagination.innerHTML = '';
      return;
    }

    let html = `
      <button class="pagination-btn ${this.currentPage === 1 ? 'disabled' : ''}"
        data-page="${this.currentPage - 1}" aria-label="上一页">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
        </svg>
      </button>
    `;

    const startPage = Math.max(1, this.currentPage - 2);
    const endPage = Math.min(pagination.totalPages, this.currentPage + 2);

    for (let i = startPage; i <= endPage; i++) {
      html += `
        <button class="pagination-btn ${i === this.currentPage ? 'active' : ''}"
          data-page="${i}">${i}</button>
      `;
    }

    html += `
      <button class="pagination-btn ${this.currentPage === pagination.totalPages ? 'disabled' : ''}"
        data-page="${this.currentPage + 1}" aria-label="下一页">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
        </svg>
      </button>
    `;

    this.pagination.innerHTML = html;

    this.pagination.querySelectorAll('.pagination-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.dataset.page);
        if (page && page !== this.currentPage && !btn.classList.contains('disabled')) {
          this.currentPage = page;
          this.loadFavorites();
        }
      });
    });
  }

  showLoading(isLoading) {
    if (isLoading) {
      this.postsLoading.style.display = 'flex';
      this.postsList.style.display = 'none';
    } else {
      this.postsLoading.style.display = 'none';
      this.postsList.style.display = 'grid';
    }
  }

  showEmptyState() {
    this.noPosts.style.display = 'flex';
    const noPostsP = this.noPosts.querySelector('p');
    if (noPostsP) {
      noPostsP.textContent = '暂无收藏帖子';
    } else {
      this.noPosts.innerHTML = '<p>暂无收藏帖子</p>';
    }
  }

  bindEvents() {
    if (this.backButton) {
      this.backButton.addEventListener('click', () => this.goBack());
    }
    if (this.snackbarAction) {
      this.snackbarAction.addEventListener('click', () => this.hideSnackbar());
    }
  }

  showSnackbar(message) {
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
    }
    this.snackbarLabel.textContent = message;
    this.snackbar.classList.add('show');
    this.snackbarTimer = setTimeout(() => this.hideSnackbar(), 5000);
  }

  hideSnackbar() {
    this.snackbar.classList.remove('show');
  }

  goBack() {
    window.history.back();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new FavoritesPage();
});
