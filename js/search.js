import { searchService } from '../services/search.js';
import { escapeHtml } from '../utils/helpers.js';
import { ALL_BRANCH, getBranchByName } from '../config/branches.js';

class SearchPage {
  constructor() {
    this.keyword = '';
    this.branch = ALL_BRANCH;
    this.currentPage = 1;
    this.pageSize = 20;
    this.posts = [];
    this.isLoading = false;
    this.hasMore = true;
    this.intersectionObserver = null;
    this.sentinel = null;

    this.searchInput = document.getElementById('searchInput');
    this.searchButton = document.getElementById('searchButton');
    this.backButton = document.getElementById('backButton');

    this.searchResults = document.getElementById('searchResults');
    this.searchLoading = document.getElementById('searchLoading');
    this.resultsList = document.getElementById('resultsList');
    this.noResults = document.getElementById('noResults');
    this.pagination = document.getElementById('pagination');

    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');

    this.snackbarTimer = null;

    this.init();
  }

  async init() {
    try {
      this.parseParamsFromURL();

      if (this.keyword) {
        this.searchInput.value = this.keyword;
        await this.performSearch(true);
      }

      this.setupInfiniteScroll();
      this.bindEvents();
    } catch (error) {
      this.showSnackbar('加载失败');
    }
  }

  parseParamsFromURL() {
    const params = new URLSearchParams(window.location.search);

    // 关键词：优先 q 参数，兼容 keyword 参数
    const q = params.get('q') || params.get('keyword') || '';
    this.keyword = q.trim();

    // 校区
    const branch = params.get('branch');
    if (branch) {
      const info = getBranchByName(branch);
      if (info) {
        this.branch = branch;
      }
    }
  }

  async performSearch(isInitial = false) {
    const keyword = this.searchInput.value.trim();
    if (!keyword) {
      this.showSnackbar('请输入搜索内容');
      return;
    }

    if (isInitial) {
      this.keyword = keyword;
    } else if (keyword !== this.keyword) {
      // 关键词变化，重置搜索
      this.keyword = keyword;
      this.currentPage = 1;
      this.posts = [];
      this.hasMore = true;
      this.resultsList.innerHTML = '';
      isInitial = true;
    }

    if (this.isLoading || (!isInitial && !this.hasMore)) return;

    this.isLoading = true;

    if (isInitial) {
      this.showLoading(true);
      this.noResults.style.display = 'none';
    } else {
      this.showLoadingMore(true);
    }

    try {
      const response = await searchService.searchPosts(
        this.keyword,
        this.branch,
        this.currentPage,
        this.pageSize
      );

      if (!response.success) {
        this.showSnackbar(response.error || '搜索失败');
        if (isInitial) {
          this.showEmptyState();
        }
        return;
      }

      const result = response.data;
      const posts = this.extractPosts(result);
      const hasMore = this.extractHasMore(result, posts.length);

      if (isInitial && (!posts || posts.length === 0)) {
        this.showEmptyState();
        return;
      }

      // 适配数据格式
      const adaptedPosts = posts.map(post => this.adaptPostFormat(post));

      if (isInitial) {
        this.posts = adaptedPosts;
      } else {
        const existingIds = new Set(this.posts.map(p => p.id));
        const newPosts = adaptedPosts.filter(p => !existingIds.has(p.id));
        this.posts = [...this.posts, ...newPosts];
      }

      this.renderPosts(adaptedPosts, !isInitial);
      this.currentPage++;

      this.hasMore = hasMore;
      if (!this.hasMore) {
        this.showNoMore();
      }
    } catch (error) {
      this.showSnackbar('搜索失败，请检查网络连接');
      if (isInitial) {
        this.showEmptyState();
      }
    } finally {
      this.isLoading = false;
      if (isInitial) {
        this.showLoading(false);
      } else {
        this.showLoadingMore(false);
      }
    }
  }

  extractPosts(result) {
    if (!result) return [];
    if (Array.isArray(result)) return result;
    if (Array.isArray(result.data)) return result.data;
    if (Array.isArray(result.posts)) return result.posts;
    return [];
  }

  extractHasMore(result, loadedCount) {
    if (result && typeof result.hasMore === 'boolean') return result.hasMore;
    if (result && result.pagination && typeof result.pagination.hasMore === 'boolean') {
      return result.pagination.hasMore;
    }
    if (result && result.pagination && result.pagination.totalPages) {
      return this.currentPage < result.pagination.totalPages;
    }
    return loadedCount >= this.pageSize;
  }

  adaptPostFormat(post) {
    // 适配搜索结果格式到 FeedComponent 期望的格式
    return {
      id: post.id,
      title: post.title,
      content: post.content,
      excerpt: post.excerpt || post.content?.substring(0, 200) || '',
      tags: post.tags || [],
      is_hot: post.is_hot || false,
      is_pinned: post.is_pinned || false,
      created_at: post.created_at,
      images: post.images || [],
      likes_count: post.like_count ?? post.likes_count ?? 0,
      comments_count: post.comment_count ?? post.comments_count ?? 0,
      favorites_count: post.favorite_count ?? post.favorites_count ?? 0,
      views_count: post.view_count ?? post.views_count ?? 0,
      user: {
        id: post.author_id || post.user_id,
        nickname: post.author_name || post.user?.nickname || '用户',
        avatar: post.author_avatar || post.user?.avatar || null
      },
      user_id: post.author_id || post.user_id,
      author_branch: post.author_branch || post.branch || null
    };
  }

  renderPosts(posts, append = false) {
    posts.forEach(post => {
      const postElement = this.createPostElement(post);
      this.resultsList.appendChild(postElement);
    });
  }

  createPostElement(post) {
    const postCard = document.createElement('article');
    postCard.className = 'post-card';
    postCard.dataset.postId = post.id;

    const hotBadge = post.is_hot
      ? '<span class="post-badge hot">热门</span>'
      : '';

    const imagePreview = post.images && post.images.length > 0
      ? this.createImagePreview(post.images)
      : '';

    const avatarUrl = post.user?.avatar ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.user?.id || post.user_id}`;

    const safeNickname = escapeHtml(post.user?.nickname || '用户');
    const safeTitle = escapeHtml(post.title);
    const safeExcerpt = escapeHtml(post.excerpt || post.content?.substring(0, 200) || '暂无内容');
    const safeTags = post.tags && post.tags.length > 0
      ? post.tags.slice(0, 5).map(tag => `<span class="post-tag">${escapeHtml(tag)}</span>`).join('')
      : '';

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
          <span class="stat">
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
          <span class="stat">
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
            <img src="${escapeHtml(url)}" alt="帖子图片${index + 1}" class="post-image" loading="lazy" onerror="this.style.display='none';" />
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
    this.pagination.parentNode.insertBefore(this.sentinel, this.pagination);
    this.pagination.style.display = 'none';

    this.intersectionObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !this.isLoading && this.hasMore && this.keyword) {
        this.performSearch(false);
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
      this.searchLoading.style.display = 'flex';
      this.resultsList.style.display = 'none';
    } else {
      this.searchLoading.style.display = 'none';
      this.resultsList.style.display = 'block';
    }
  }

  showLoadingMore(isLoading) {
    // 简单实现：在底部显示加载更多状态
    let loadingMoreEl = document.getElementById('loadingMore');
    if (isLoading) {
      if (!loadingMoreEl) {
        loadingMoreEl = document.createElement('div');
        loadingMoreEl.id = 'loadingMore';
        loadingMoreEl.className = 'loading-more';
        loadingMoreEl.style.display = 'flex';
        loadingMoreEl.style.justifyContent = 'center';
        loadingMoreEl.style.padding = '20px';
        loadingMoreEl.style.color = '#999';
        loadingMoreEl.innerHTML = `
          <svg class="loading-spinner" viewBox="25 25 50 50" style="width:24px;height:24px;margin-right:8px;">
            <circle cx="50" cy="50" r="20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-dasharray="100"/>
          </svg>
          <span>加载中...</span>
        `;
        this.sentinel.parentNode.insertBefore(loadingMoreEl, this.sentinel);
      }
      loadingMoreEl.style.display = 'flex';
    } else if (loadingMoreEl) {
      loadingMoreEl.style.display = 'none';
    }
  }

  showNoMore() {
    let noMoreEl = document.getElementById('noMorePosts');
    if (!noMoreEl) {
      noMoreEl = document.createElement('div');
      noMoreEl.id = 'noMorePosts';
      noMoreEl.className = 'no-more-posts';
      noMoreEl.style.textAlign = 'center';
      noMoreEl.style.padding = '20px';
      noMoreEl.style.color = '#999';
      noMoreEl.style.fontSize = '14px';
      noMoreEl.textContent = '没有更多了';
      this.sentinel.parentNode.insertBefore(noMoreEl, this.sentinel);
    }
    noMoreEl.style.display = 'block';
  }

  showEmptyState() {
    this.noResults.style.display = 'flex';
  }

  bindEvents() {
    if (this.backButton) {
      this.backButton.addEventListener('click', () => this.goBack());
    }

    if (this.searchButton) {
      this.searchButton.addEventListener('click', () => this.handleSearchSubmit());
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.handleSearchSubmit();
        }
      });
    }

    if (this.snackbarAction) {
      this.snackbarAction.addEventListener('click', () => this.hideSnackbar());
    }
  }

  handleSearchSubmit() {
    const keyword = this.searchInput.value.trim();
    if (!keyword) {
      this.showSnackbar('请输入搜索内容');
      return;
    }

    // 更新 URL 并重新搜索
    const url = new URL(window.location);
    url.searchParams.set('q', keyword);
    url.searchParams.set('branch', this.branch);
    window.history.replaceState({}, '', url);

    // 重置并搜索
    this.keyword = keyword;
    this.currentPage = 1;
    this.posts = [];
    this.hasMore = true;
    this.resultsList.innerHTML = '';
    this.noResults.style.display = 'none';

    const noMoreEl = document.getElementById('noMorePosts');
    if (noMoreEl) noMoreEl.style.display = 'none';

    this.performSearch(true);
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
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'home.html';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SearchPage();
});
