import { authService } from '../services/auth.js';
import { postService } from '../services/post.js';
import { likeService } from '../services/like.js';
import { commentService } from '../services/comment.js';

class PostDetailPage {
  constructor() {
    this.postId = this.getPostId();
    this.currentUser = null;
    this.isLiked = false;

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
    this.detailComments = document.getElementById('detailComments');

    this.likeBtn = document.getElementById('detailLikeBtn');
    this.detailFavoriteBtn = document.getElementById('detailFavoriteBtn');

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

    this.snackbarTimer = null;

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
      await this.loadLikes();
      await this.loadComments();
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

  async getCurrentUser() {
    const response = await authService.getCurrentUser();
    if (response.success) {
      this.currentUser = response.data;
    }
  }

  async loadPost() {
    if (!this.postId) {
      this.postDetailLoading.style.display = 'none';
      this.showSnackbar('帖子ID无效');
      return;
    }

    const response = await postService.getPostById(this.postId);

    if (!response.success) {
      this.postDetailLoading.style.display = 'none';
      this.postDetailCard.style.display = 'block';
      this.detailTitle.textContent = '加载失败';
      this.detailBody.textContent = response.message || '无法加载帖子内容，请稍后重试';
      this.showSnackbar(response.message || '加载失败');
      return;
    }

    const post = response.data;

    this.postDetailLoading.style.display = 'none';
    this.postDetailCard.style.display = 'block';

    this.detailBadges.innerHTML = '';
    this.detailTags.innerHTML = '';
    this.detailImages.innerHTML = '';
    this.detailCategory.style.display = 'none';

    const avatarUrl = post.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.user?.id || post.user_id}`;
    this.detailAuthorAvatar.src = avatarUrl;
    this.detailAuthorAvatar.onerror = () => {
      if (this.detailAuthorAvatar.dataset.errorHandled) return;
      this.detailAuthorAvatar.dataset.errorHandled = 'true';
      this.detailAuthorAvatar.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.user?.id || post.user_id}`;
    };
    this.detailAuthorName.textContent = post.user?.nickname || '用户';
    this.detailPostTime.textContent = this.formatTime(post.created_at);
    this.detailTitle.textContent = post.title;
    this.detailBody.textContent = post.content;
    this.detailViews.textContent = post.views_count || 0;
    this.detailLikes.textContent = post.likes_count || 0;
    this.detailFavorites.textContent = post.favorites_count || 0;
    this.detailComments.textContent = post.comments_count || 0;

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

    await this.loadPostImages();

    if (this.currentUser && this.currentUser.id === post.user_id) {
      this.editBtn.style.display = 'flex';
      this.deleteBtn.style.display = 'flex';
    }

    postService.incrementViews(this.postId);
  }

  async loadPostImages() {
    const response = await postService.getPostImages(this.postId);
    if (response.success && response.data && response.data.length > 0) {
      this.renderImages(response.data);
    }
  }

  renderImages(images) {
    if (!this.detailImages) return;

    this.detailImages.innerHTML = '';

    images.forEach((image, index) => {
      const renderUrl = image.image_url || image.url;
      if (renderUrl) {
        const img = document.createElement('img');
        img.src = renderUrl;
        img.className = 'detail-image';
        img.alt = `帖子图片${index + 1}`;
        img.onerror = () => {
          img.style.display = 'none';
        };
        this.detailImages.appendChild(img);
      }
    });
  }

  async loadLikes() {
    const response = await likeService.isLiked(this.postId);
    if (response.success) {
      this.isLiked = response.data;
      this.updateLikeButton();
    }
  }

  async loadComments() {
    const response = await commentService.getComments(this.postId);
    if (response.success) {
      this.renderComments(response.data.comments);
    } else {
      this.commentsList.innerHTML = '<p class="no-data">暂无评论</p>';
    }
  }

  renderComments(comments) {
    this.commentsList.innerHTML = '';
    if (!comments || comments.length === 0) {
      this.commentsList.innerHTML = '<p class="no-data">暂无评论</p>';
      return;
    }

    comments.forEach(comment => {
      const commentCard = document.createElement('div');
      commentCard.className = 'comment-card';

      const avatarUrl = comment.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.user?.id || comment.user_id}`;

      commentCard.innerHTML = `
        <div class="comment-header">
          <img src="${avatarUrl}" class="comment-avatar" alt="${comment.user?.nickname || '用户'}">
          <div class="comment-author-info">
            <span class="comment-author">${comment.user?.nickname || '用户'}</span>
            <span class="comment-time">${this.formatTime(comment.created_at)}</span>
          </div>
        </div>
        <div class="comment-content">${comment.content}</div>
      `;

      this.commentsList.appendChild(commentCard);
    });
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

  async handleLike() {
    const response = await likeService.toggleLike(this.postId);
    if (response.success) {
      this.isLiked = response.data.liked;
      this.updateLikeButton();
      this.updateLikeCount();
    } else {
      this.showSnackbar(response.message);
    }
  }

  updateLikeButton() {
    if (this.likeBtn) {
      if (this.isLiked) {
        this.likeBtn.classList.add('liked');
      } else {
        this.likeBtn.classList.remove('liked');
      }
    }
  }

  async updateLikeCount() {
    const response = await likeService.getLikeCount(this.postId);
    if (response.success) {
      this.detailLikes.textContent = response.data;
    }
  }

  async handleCommentSubmit() {
    const content = this.commentInput.value.trim();
    if (!content) {
      this.showSnackbar('请输入评论内容');
      return;
    }

    const response = await commentService.createComment(this.postId, content);
    if (response.success) {
      this.commentInput.value = '';
      await this.loadComments();
      await this.updateCommentCount();
      this.showSnackbar('评论发表成功');
    } else {
      this.showSnackbar(response.message);
    }
  }

  async updateCommentCount() {
    const response = await commentService.getCommentCount(this.postId);
    if (response.success) {
      this.detailComments.textContent = response.data;
    }
  }

  async handleDelete() {
    if (!confirm('确定要删除这篇帖子吗？')) return;

    try {
      const response = await postService.deletePost(this.postId);
      if (response.success) {
        this.showSnackbar('帖子已删除');
        setTimeout(() => {
          window.location.href = 'home.html';
        }, 1500);
      } else {
        this.showSnackbar(response.message);
      }
    } catch (error) {
      this.showSnackbar('删除失败，请稍后重试');
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
    this.moreButton.addEventListener('click', () => this.showSnackbar('更多功能开发中'));
    if (this.detailFavoriteBtn) {
      this.detailFavoriteBtn.addEventListener('click', () => this.showSnackbar('收藏功能开发中'));
    }
    this.snackbarAction.addEventListener('click', () => this.hideSnackbar());

    if (this.likeBtn) {
      this.likeBtn.addEventListener('click', () => this.handleLike());
    }

    if (this.commentSubmitBtn) {
      this.commentSubmitBtn.addEventListener('click', () => this.handleCommentSubmit());
    }

    if (this.commentInput) {
      this.commentInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleCommentSubmit();
        }
      });
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
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'home.html';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PostDetailPage();
});
