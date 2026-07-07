import { authService } from '../services/auth.js';
import { postService } from '../services/post.js';

class PostDetailPage {
  constructor() {
    this.postId = this.getPostId();
    this.currentUser = null;

    this.postDetailLoading = document.getElementById('postDetailLoading');
    this.postDetailCard = document.getElementById('postDetailCard');

    this.detailAuthorAvatar = document.getElementById('detailAuthorAvatar');
    this.detailAuthorName = document.getElementById('detailAuthorName');
    this.detailPostTime = document.getElementById('detailPostTime');
    this.detailBadges = document.getElementById('detailBadges');
    this.detailTitle = document.getElementById('detailTitle');
    this.detailCategory = document.getElementById('detailCategory');
    this.detailTags = document.getElementById('detailTags');
    this.detailBody = document.getElementById('detailBody');
    this.detailImages = document.getElementById('detailImages');
    this.detailViews = document.getElementById('detailViews');
    this.detailLikes = document.getElementById('detailLikes');
    this.detailFavorites = document.getElementById('detailFavorites');

    this.editBtn = document.getElementById('editBtn');
    this.deleteBtn = document.getElementById('deleteBtn');
    this.reportBtn = document.getElementById('reportBtn');
    this.backButton = document.getElementById('backButton');
    this.moreButton = document.getElementById('moreButton');

    this.commentInput = document.getElementById('commentInput');
    this.commentSubmitBtn = document.getElementById('commentSubmitBtn');
    this.commentsList = document.getElementById('commentsList');

    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');

    this.init();
  }

  getPostId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  async init() {
    try {
      await this.checkSession();
      await this.getCurrentUser();
      await this.loadPost();
      await this.loadComments();
      this.bindEvents();
    } catch (error) {
      console.error('Post detail init error:', error);
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

  async getCurrentUser() {
    const response = await authService.getCurrentUser();
    if (response.success) {
      this.currentUser = response.data;
    }
  }

  async loadPost() {
    if (!this.postId) {
      this.showSnackbar('帖子ID无效');
      return;
    }

    const response = await postService.getPostById(this.postId);

    if (!response.success) {
      this.showSnackbar(response.message);
      return;
    }

    const post = response.data;

    this.postDetailLoading.style.display = 'none';
    this.postDetailCard.style.display = 'block';

    const avatarUrl = post.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.user?.id || post.user_id}`;
    this.detailAuthorAvatar.src = avatarUrl;
    this.detailAuthorName.textContent = post.user?.nickname || '用户';
    this.detailPostTime.textContent = this.formatTime(post.created_at);
    this.detailTitle.textContent = post.title;
    this.detailBody.textContent = post.content;
    this.detailViews.textContent = post.views_count;
    this.detailLikes.textContent = post.likes_count;
    this.detailFavorites.textContent = post.favorites_count;

    if (post.is_pinned) {
      const badge = document.createElement('span');
      badge.className = 'post-badge pinned';
      badge.textContent = '置顶';
      this.detailBadges.appendChild(badge);
    }
    if (post.is_hot) {
      const badge = document.createElement('span');
      badge.className = 'post-badge hot';
      badge.textContent = '热门';
      this.detailBadges.appendChild(badge);
    }

    if (post.tags && post.tags.length > 0) {
      post.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'post-tag';
        tagSpan.textContent = `#${tag}`;
        this.detailTags.appendChild(tagSpan);
      });
    }

    if (this.currentUser && this.currentUser.id === post.user_id) {
      this.editBtn.style.display = 'flex';
      this.deleteBtn.style.display = 'flex';
    }

    postService.incrementViews(this.postId);
  }

  async loadComments() {
    this.commentsList.innerHTML = '<p class="no-data">暂无评论</p>';
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

  async handleDelete() {
    if (!confirm('确定要删除这篇帖子吗？')) return;

    const response = await postService.deletePost(this.postId);
    if (response.success) {
      this.showSnackbar('帖子已删除');
      setTimeout(() => {
        window.location.href = 'home.html';
      }, 1500);
    } else {
      this.showSnackbar(response.message);
    }
  }

  handleEdit() {
    window.location.href = `post.html?id=${this.postId}`;
  }

  bindEvents() {
    this.backButton.addEventListener('click', () => this.goBack());
    this.editBtn.addEventListener('click', () => this.handleEdit());
    this.deleteBtn.addEventListener('click', () => this.handleDelete());
    this.reportBtn.addEventListener('click', () => this.showSnackbar('举报功能开发中'));
    this.snackbarAction.addEventListener('click', () => this.hideSnackbar());
    this.commentSubmitBtn.addEventListener('click', () => this.showSnackbar('评论功能开发中'));
  }

  showSnackbar(message) {
    this.snackbarLabel.textContent = message;
    this.snackbar.classList.add('show');
    setTimeout(() => this.hideSnackbar(), 5000);
  }

  hideSnackbar() {
    this.snackbar.classList.remove('show');
  }

  goBack() {
    window.history.back();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PostDetailPage();
});