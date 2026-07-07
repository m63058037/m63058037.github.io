import { postService } from '../services/post.js';

export class FeedComponent {
  constructor(options = {}) {
    this.pageSize = options.pageSize || 10;
    this.currentPage = 1;
    this.currentCategoryId = null;
    this.posts = [];
    
    this.postsLoading = document.getElementById('postsLoading');
    this.postsList = document.getElementById('postsList');
    this.noPosts = document.getElementById('noPosts');
    this.pagination = document.getElementById('pagination');
    
    this.init();
  }
  
  async init() {
    await this.loadPosts();
  }
  
  async loadPosts(page = 1, categoryId = null) {
    this.currentPage = page;
    this.currentCategoryId = categoryId;
    
    this.showLoading(true);
    this.noPosts.style.display = 'none';
    this.postsList.innerHTML = '';
    
    try {
      const response = await postService.getPosts(this.currentPage, this.pageSize, this.currentCategoryId);
      
      if (!response.success) {
        console.warn('Failed to load posts:', response.message);
        this.showEmptyState();
        return;
      }
      
      const { posts, pagination } = response.data;
      this.posts = posts;
      
      if (posts.length === 0) {
        this.showEmptyState();
        return;
      }
      
      this.renderPosts(posts);
      this.renderPagination(pagination);
    } catch (error) {
      console.error('Feed loadPosts error:', error);
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
    
    const imagePreview = post.images && post.images.length > 0 ? 
      this.createImagePreview(post.images) : '';
    
    const avatarUrl = post.user?.avatar || 
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.user?.id || post.user_id}`;
    
    postCard.innerHTML = `
      <div class="post-header">
        <div class="post-author">
          <img src="${avatarUrl}" alt="${post.user?.nickname || '用户'}" class="author-avatar" />
          <div class="author-info">
            <span class="author-name">${post.user?.nickname || '用户'}</span>
            <span class="post-time">${this.formatTime(post.created_at)}</span>
          </div>
        </div>
        <div class="post-badges">
          ${pinnedBadge}
          ${hotBadge}
        </div>
      </div>

      <h2 class="post-title">
        <a href="post-detail.html?id=${post.id}">${post.title}</a>
      </h2>

      <p class="post-excerpt">${post.excerpt || post.content.substring(0, 200)}</p>

      ${imagePreview}

      <div class="post-footer">
        <div class="post-meta">
          ${post.tags && post.tags.length > 0 ? 
            post.tags.slice(0, 3).map(tag => `<span class="post-tag">#${tag}</span>`).join('') : ''}
        </div>
        <div class="post-stats">
          <span class="stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            ${post.views_count}
          </span>
          <span class="stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
            ${post.likes_count}
          </span>
          <span class="stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
            ${post.comments_count}
          </span>
        </div>
      </div>
    `;
    
    return postCard;
  }
  
  createImagePreview(images) {
    const previewCount = Math.min(images.length, 3);
    const hasMore = images.length > 3;
    
    return `
      <div class="post-images">
        ${images.slice(0, previewCount).map((img, index) => `
          <div class="post-image-wrapper ${previewCount === 1 ? 'single' : ''}">
            <img src="${img.image_url}" alt="帖子图片${index + 1}" class="post-image" />
          </div>
        `).join('')}
        ${hasMore ? `<div class="post-image-more">+${images.length - 3}</div>` : ''}
      </div>
    `;
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
          this.loadPosts(page, this.currentCategoryId);
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
  }
  
  refresh() {
    this.loadPosts(1, this.currentCategoryId);
  }
}

export default FeedComponent;