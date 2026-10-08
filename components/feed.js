import { postService } from '../services/post.js';
import { authService } from '../services/auth.js';
import { escapeHtml } from '../utils/helpers.js';
import { ALL_BRANCH, ALL_BRANCH_NAME } from '../config/branches.js';

export class FeedComponent {
  constructor(options = {}) {
    this.pageSize = options.pageSize || 20;
    this.branch = options.branch || ALL_BRANCH;
    this.currentPage = 0;
    this.posts = [];
    this.hotPosts = [];
    this.isLoading = false;
    this.hasMore = true;
    this.totalCount = 0;

    this.postsLoading = document.getElementById('postsLoading');
    this.postsList = document.getElementById('postsList');
    this.noPosts = document.getElementById('noPosts');
    this.loadingMore = document.getElementById('loadingMore');
    this.noMorePosts = document.getElementById('noMorePosts');
    this.hotPostsSection = document.getElementById('hotPostsSection');
    this.hotPostsList = document.getElementById('hotPostsList');

    this.snackbarTimer = null;
    this.intersectionObserver = null;
    this.sentinel = null;

    this.lightbox = document.getElementById('imageLightbox');
    this.lightboxImage = document.getElementById('lightboxImage');
    this.lightboxClose = document.getElementById('lightboxClose');

    this.init();
  }

  async init() {
    this.bindLightboxEvents();
    await this.loadHotPosts();
    await this.loadPosts(true);
    this.setupInfiniteScroll();
  }

  bindLightboxEvents() {
    if (this.lightboxClose) {
      this.lightboxClose.addEventListener('click', () => this.closeLightbox());
    }
    if (this.lightbox) {
      this.lightbox.addEventListener('click', (e) => {
        if (e.target === this.lightbox || e.target.classList.contains('image-lightbox-content')) {
          this.closeLightbox();
        }
      });
    }
  }

  openLightbox(url) {
    if (!this.lightbox || !this.lightboxImage) return;
    this.lightboxImage.src = url;
    this.lightbox.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  closeLightbox() {
    if (!this.lightbox) return;
    this.lightbox.classList.remove('show');
    document.body.style.overflow = '';
  }

  setBranch(branch) {
    if (this.branch === branch) return;
    this.branch = branch;
    this.currentPage = 0;
    this.posts = [];
    this.hasMore = true;
    this.postsList.innerHTML = '';
    this.noMorePosts.style.display = 'none';
    this.init();
  }

  async loadHotPosts() {
    try {
      const response = await postService.getHotPostsByBranch(this.branch, 3);

      if (!response.success || !response.data || response.data.length === 0) {
        this.hotPostsSection.style.display = 'none';
        this.hotPosts = [];
        return;
      }

      this.hotPosts = response.data;
      this.hotPostsSection.style.display = 'block';
      this.renderHotPosts(this.hotPosts);
    } catch (error) {
      this.hotPostsSection.style.display = 'none';
      this.hotPosts = [];
    }
  }

  renderHotPosts(posts) {
    this.hotPostsList.innerHTML = '';
    posts.forEach(post => {
      const el = this.createPostElement(post, true);
      this.hotPostsList.appendChild(el);
    });
  }

  async loadPosts(isInitial = false) {
    if (this.isLoading || (!isInitial && !this.hasMore)) return;

    this.isLoading = true;

    if (isInitial) {
      this.showLoading(true);
      this.noPosts.style.display = 'none';
      this.postsList.innerHTML = '';
      this.noMorePosts.style.display = 'none';
    } else {
      this.loadingMore.style.display = 'flex';
    }

    try {
      const offset = isInitial ? 0 : this.currentPage * this.pageSize;
      const response = await postService.getPostsByBranch(this.branch, offset, this.pageSize);

      if (!response.success) {
        this.showError(response.message || '加载失败，请稍后重试');
        if (isInitial) this.showEmptyState();
        return;
      }

      if (!response.data) {
        if (isInitial) this.showEmptyState();
        return;
      }

      const { posts, hasMore, totalCount } = response.data;
      this.totalCount = totalCount;
      this.hasMore = hasMore;

      if (isInitial && (!posts || posts.length === 0)) {
        this.showEmptyState();
        return;
      }

      await this.attachInteractionStatus(posts);

      if (isInitial) {
        this.posts = posts;
      } else {
        const existingIds = new Set(this.posts.map(p => p.id));
        const newPosts = posts.filter(p => !existingIds.has(p.id));
        this.posts = [...this.posts, ...newPosts];
      }

      this.renderPosts(posts, !isInitial);
      this.currentPage++;

      if (!this.hasMore) {
        this.noMorePosts.style.display = 'block';
      }
    } catch (error) {
      this.showError('加载失败，请检查网络连接');
      if (isInitial) this.showEmptyState();
    } finally {
      this.isLoading = false;
      this.showLoading(false);
      this.loadingMore.style.display = 'none';
    }
  }

  async attachInteractionStatus(posts) {
    if (!posts || posts.length === 0) return;

    try {
      const userResponse = await authService.getCurrentUser();
      if (!userResponse.success) return;

      const postIds = posts.map(p => p.id);
      const [likeResult, favResult] = await Promise.all([
        postService.batchGetLikeStatus(postIds),
        postService.batchGetFavoriteStatus(postIds)
      ]);

      posts.forEach(post => {
        post._liked = likeResult.data?.[post.id] || false;
        post._saved = favResult.data?.[post.id] || false;
      });
    } catch (error) {
      posts.forEach(post => {
        post._liked = false;
        post._saved = false;
      });
    }
  }

  renderPosts(posts, append = false) {
    posts.forEach(post => {
      if (this.hotPosts.some(h => h.id === post.id)) return;
      const postElement = this.createPostElement(post, false);
      this.postsList.appendChild(postElement);
    });
  }

  createPostElement(post, isHot = false) {
    const postCard = document.createElement('article');
    postCard.className = isHot ? 'post-card hot-post-card' : 'post-card';
    postCard.dataset.postId = post.id;

    const pinnedBadge = post.is_pinned ?
      '<span class="post-badge pinned">置顶</span>' : '';
    const hotBadge = (isHot || post.is_hot) ?
      '<span class="post-badge hot">热门</span>' : '';

    const imagePreview = post.images && post.images.length > 0 ?
      this.createImagePreview(post.images) : '';

    const avatarUrl = post.user?.avatar ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.user?.id || post.user_id}`;

    const safeNickname = escapeHtml(post.user?.nickname || '用户');
    const safeTitle = escapeHtml(post.title);
    const safeExcerpt = escapeHtml(post.excerpt || post.content?.substring(0, 200) || '暂无内容');
    const safeTags = post.tags && post.tags.length > 0
      ? post.tags.slice(0, 5).map(tag => `<span class="post-tag">${escapeHtml(tag)}</span>`).join('')
      : '';

    const likedClass = post._liked ? 'liked' : '';
    const savedClass = post._saved ? 'saved' : '';

    postCard.innerHTML = `
      <div class="post-header">
        <div class="post-author">
          <img src="${escapeHtml(avatarUrl)}" alt="${safeNickname}" class="author-avatar" />
          <div class="author-info">
            <a href="user-profile.html?uid=${escapeHtml(post.user?.id || post.user_id)}" class="author-name">${safeNickname}</a>
            <span class="post-time">${this.formatTime(post.created_at)}</span>
          </div>
        </div>
        <div class="post-badges">
          ${pinnedBadge}
          ${hotBadge}
        </div>
      </div>

      <h2 class="post-title">
        <a href="post-detail.html?id=${escapeHtml(post.id)}">${safeTitle}</a>
      </h2>

      <p class="post-excerpt">${safeExcerpt}</p>

      ${imagePreview}

      <div class="post-footer">
        <div class="post-meta">
          ${safeTags}
        </div>
        <div class="post-stats">
          <span class="stat ${likedClass}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            ${post.likes_count || 0}
          </span>
          <span class="stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            ${post.comments_count || 0}
          </span>
          <span class="stat ${savedClass}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            ${post.favorites_count || 0}
          </span>
          <span class="stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            ${post.views_count || 0}
          </span>
        </div>
      </div>
    `;

    postCard.querySelectorAll('.post-image').forEach(img => {
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = img.getAttribute('data-url') || img.src;
        this.openLightbox(url);
      });
    });

    // 整卡进入详情；作者链接 / 图片预览单独处理
    postCard.addEventListener('click', (e) => {
      if (e.target.closest('a, button, .post-image, .post-image-wrapper')) return;
      window.location.href = `post-detail.html?id=${encodeURIComponent(post.id)}`;
    });
    postCard.setAttribute('role', 'link');
    postCard.tabIndex = 0;
    postCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = `post-detail.html?id=${encodeURIComponent(post.id)}`;
      }
    });

    const authorNameLink = postCard.querySelector('.author-name');
    if (authorNameLink) {
      authorNameLink.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    return postCard;
  }

  createImagePreview(images) {
    const previewCount = Math.min(images.length, 3);
    const hasMore = images.length > 3;
    const containerClass = previewCount === 1 ? 'post-images single' : 'post-images';

    return `
      <div class="${containerClass}">
        ${images.slice(0, previewCount).map((img, index) => {
          const url = img.url || img.image_url || '';
          return `
          <div class="post-image-wrapper">
            <img src="${escapeHtml(url)}" alt="帖子图片${index + 1}" class="post-image" data-url="${escapeHtml(url)}" loading="lazy" onerror="this.style.display='none';" />
          </div>
          `;
        }).join('')}
        ${hasMore ? `<div class="post-image-more">+${images.length - 3}</div>` : ''}
      </div>
    `;
  }

  setupInfiniteScroll() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    this.sentinel = document.createElement('div');
    this.sentinel.className = 'infinite-scroll-sentinel';
    this.sentinel.style.height = '1px';
    this.postsList.parentNode.insertBefore(this.sentinel, this.noPosts);

    this.intersectionObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !this.isLoading && this.hasMore) {
        this.loadPosts(false);
      }
    }, {
      rootMargin: '200px'
    });

    this.intersectionObserver.observe(this.sentinel);
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return `${date.getMonth() + 1}月${date.getDate()}日`;
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
    this.hotPostsSection.style.display = 'none';
    this.noMorePosts.style.display = 'none';
  }

  showError(message) {
    this.showSnackbar(message);
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

  refresh() {
    this.currentPage = 0;
    this.posts = [];
    this.hasMore = true;
    this.init();
  }
}

export default FeedComponent;
