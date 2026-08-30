import { authService } from '../services/auth.js';
import { postService } from '../services/post.js';
import { likeService } from '../services/like.js';
import { commentService } from '../services/comment.js';
import { favoriteService } from '../services/favorite.js';
import { reportService, ReportTypes, ReportTypeLabels, REPORT_TYPES_ORDER } from '../services/report.js';
import { escapeHtml } from '../utils/helpers.js';
import { sensitiveWordService } from '../services/sensitive-word.js';
import { showContentWarnDialog } from '../components/content-warn-dialog.js';

class PostDetailPage {
  constructor() {
    this.postId = this.getPostId();
    this.currentUser = null;
    this.isLiked = false;
    this.isSaved = false;
    this.isSubmitting = false;
    this.isLiking = false;
    this.isFavoriting = false;
    this.replyingTo = null;
    this.comments = [];
    this.commentPage = 1;
    this.commentPageSize = 20;
    this.hasMoreComments = false;
    this.isLoadingComments = false;
    this.commentPagination = null;
    this.replyPages = {};
    this.loadingRepliesFor = null;
    this.scrollY = 0;
    this.lightboxImages = [];
    this.lightboxIndex = 0;
    this.lightbox = null;
    this.lightboxImg = null;
    this.lightboxCounter = null;
    this.lightboxPrevBtn = null;
    this.lightboxNextBtn = null;

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
    this.detailFavorites = document.getElementById('detailFavorites');

    this.detailFavoriteBtn = document.getElementById('detailFavoriteBtn');

    // 操作栏按钮
    this.actionLikeBtn = document.getElementById('actionLikeBtn');
    this.actionCommentBtn = document.getElementById('actionCommentBtn');
    this.actionReportBtn = document.getElementById('actionReportBtn');
    this.actionLikeCount = document.getElementById('actionLikeCount');
    this.actionCommentCount = document.getElementById('actionCommentCount');

    this.editBtn = document.getElementById('editBtn');
    this.deleteBtn = document.getElementById('deleteBtn');
    this.backButton = document.getElementById('backButton');
    this.moreButton = document.getElementById('moreButton');

    // Bottom Sheet 元素
    this.bottomSheet = document.getElementById('bottomSheet');
    this.bottomSheetOverlay = document.getElementById('bottomSheetOverlay');
    this.bottomSheetClose = document.getElementById('bottomSheetClose');
    this.bottomSheetCommentsList = document.getElementById('bottomSheetCommentsList');
    this.bottomSheetCommentCount = document.getElementById('bottomSheetCommentCount');
    this.bottomSheetCommentInput = document.getElementById('bottomSheetCommentInput');
    this.bottomSheetCommentSubmitBtn = document.getElementById('bottomSheetCommentSubmitBtn');
    this.replyIndicator = document.getElementById('replyIndicator');
    this.replyIndicatorText = document.getElementById('replyIndicatorText');
    this.replyIndicatorCancel = document.getElementById('replyIndicatorCancel');

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

  getFrom() {
    const params = new URLSearchParams(window.location.search);
    return params.get('from');
  }

  async init() {
    try {
      this.createLightbox();
      this.bindEvents();
      await this.checkSession();
      await this.getCurrentUser();
      await this.loadPost();
      // 点赞/收藏/评论相互独立且仅依赖 postId，可并行加载，减少串行等待
      await Promise.all([
        this.loadLikes(),
        this.loadFavorites(),
        this.loadComments()
      ]);
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
    this.detailAuthorName.innerHTML = `<a href="user-profile.html?uid=${escapeHtml(post.user?.id || post.user_id)}">${escapeHtml(post.user?.nickname || '用户')}</a>`;
    this.detailPostTime.textContent = this.formatTime(post.created_at);
    this.detailTitle.textContent = post.title;
    this.detailBody.textContent = post.content;
    this.detailViews.textContent = post.views_count || 0;
    this.detailFavorites.textContent = post.favorites_count || 0;

    // 同步操作栏数字
    this.actionLikeCount.textContent = post.likes_count || 0;
    this.actionCommentCount.textContent = post.comments_count || 0;

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
    this.lightboxImages = [];

    images.forEach((image, index) => {
      const renderUrl = image.image_url || image.url;
      if (renderUrl) {
        const lightboxIdx = this.lightboxImages.length;
        this.lightboxImages.push(renderUrl);

        const img = document.createElement('img');
        img.src = renderUrl;
        img.className = 'detail-image';
        img.alt = `帖子图片${index + 1}`;
        img.loading = 'lazy';
        img.dataset.lightboxIndex = String(lightboxIdx);
        img.onerror = () => {
          img.style.display = 'none';
        };
        const idx = lightboxIdx;
        img.addEventListener('click', () => {
          this.openLightbox(idx);
        });
        this.detailImages.appendChild(img);
      }
    });
  }

  createLightbox() {
    this.lightbox = document.createElement('div');
    this.lightbox.className = 'lightbox';
    this.lightbox.setAttribute('role', 'dialog');
    this.lightbox.setAttribute('aria-modal', 'true');
    this.lightbox.setAttribute('aria-label', '图片查看器');

    const wrapper = document.createElement('div');
    wrapper.className = 'lightbox-image-wrapper';

    this.lightboxImg = document.createElement('img');
    this.lightboxImg.className = 'lightbox-image';
    this.lightboxImg.alt = '放大查看的图片';
    wrapper.appendChild(this.lightboxImg);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lightbox-close';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.type = 'button';
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeLightbox();
    });

    this.lightboxPrevBtn = document.createElement('button');
    this.lightboxPrevBtn.className = 'lightbox-nav lightbox-prev';
    this.lightboxPrevBtn.setAttribute('aria-label', '上一张');
    this.lightboxPrevBtn.type = 'button';
    this.lightboxPrevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
    this.lightboxPrevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.prevLightboxImage();
    });

    this.lightboxNextBtn = document.createElement('button');
    this.lightboxNextBtn.className = 'lightbox-nav lightbox-next';
    this.lightboxNextBtn.setAttribute('aria-label', '下一张');
    this.lightboxNextBtn.type = 'button';
    this.lightboxNextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';
    this.lightboxNextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.nextLightboxImage();
    });

    this.lightboxCounter = document.createElement('div');
    this.lightboxCounter.className = 'lightbox-counter';

    this.lightbox.appendChild(wrapper);
    this.lightbox.appendChild(closeBtn);
    this.lightbox.appendChild(this.lightboxPrevBtn);
    this.lightbox.appendChild(this.lightboxNextBtn);
    this.lightbox.appendChild(this.lightboxCounter);

    this.lightbox.addEventListener('click', (e) => {
      if (e.target === this.lightbox || e.target === wrapper) {
        this.closeLightbox();
      }
    });

    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    this.lightbox.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    this.lightbox.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      this.handleLightboxSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
    }, { passive: true });

    document.addEventListener('keydown', (e) => {
      if (!this.lightbox.classList.contains('active')) return;
      if (e.key === 'Escape') {
        this.closeLightbox();
      } else if (e.key === 'ArrowLeft') {
        this.prevLightboxImage();
      } else if (e.key === 'ArrowRight') {
        this.nextLightboxImage();
      }
    });

    document.body.appendChild(this.lightbox);
  }

  handleLightboxSwipe(startX, startY, endX, endY) {
    const diffX = endX - startX;
    const diffY = endY - startY;
    if (Math.abs(diffX) < 50 || Math.abs(diffX) < Math.abs(diffY)) return;
    if (diffX > 0) {
      this.prevLightboxImage();
    } else {
      this.nextLightboxImage();
    }
  }

  openLightbox(index) {
    if (this.lightboxImages.length === 0) return;
    this.lightboxIndex = Math.max(0, Math.min(index, this.lightboxImages.length - 1));
    this.showLightboxImage(this.lightboxIndex);
    this.lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  closeLightbox() {
    this.lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }

  showLightboxImage(index) {
    if (index < 0 || index >= this.lightboxImages.length) return;
    this.lightboxIndex = index;
    this.lightboxImg.classList.add('changing');
    this.lightboxImg.src = this.lightboxImages[index];
    requestAnimationFrame(() => {
      this.lightboxImg.classList.remove('changing');
    });

    const hasMultiple = this.lightboxImages.length > 1;
    this.lightboxPrevBtn.style.display = hasMultiple ? '' : 'none';
    this.lightboxNextBtn.style.display = hasMultiple ? '' : 'none';
    this.lightboxCounter.style.display = hasMultiple ? '' : 'none';

    if (hasMultiple) {
      this.lightboxCounter.textContent = `${index + 1} / ${this.lightboxImages.length}`;
      this.lightboxPrevBtn.disabled = (index === 0);
      this.lightboxNextBtn.disabled = (index === this.lightboxImages.length - 1);
    }
  }

  nextLightboxImage() {
    if (this.lightboxIndex < this.lightboxImages.length - 1) {
      this.showLightboxImage(this.lightboxIndex + 1);
    }
  }

  prevLightboxImage() {
    if (this.lightboxIndex > 0) {
      this.showLightboxImage(this.lightboxIndex - 1);
    }
  }

  async loadLikes() {
    const response = await likeService.isLiked(this.postId);
    if (response.success) {
      this.isLiked = response.data;
      this.updateLikeButton();
    }
  }

  async loadFavorites() {
    const response = await favoriteService.isSaved(this.postId);
    if (response.success) {
      this.isSaved = response.data;
      this.updateFavoriteButton();
    }
  }

  async loadComments(isLoadMore = false) {
    if (this.isLoadingComments) return;

    if (!isLoadMore) {
      this.commentPage = 1;
      this.replyPages = {};
    } else {
      this.commentPage++;
    }

    this.isLoadingComments = true;

    if (isLoadMore) {
      const loadMoreBtn = this.bottomSheetCommentsList.querySelector('.load-more-comments-btn');
      if (loadMoreBtn) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = '加载中...';
      }
    }

    try {
      const response = await commentService.getComments(this.postId, this.commentPage, this.commentPageSize);

      if (response.success) {
        const newComments = response.data.comments || [];
        this.commentPagination = response.data.pagination;
        this.hasMoreComments = this.commentPagination ? this.commentPagination.page < this.commentPagination.totalPages : false;

        if (isLoadMore) {
          const oldWrapper = this.bottomSheetCommentsList.querySelector('.load-more-wrapper');
          if (oldWrapper) oldWrapper.remove();

          this.comments = [...this.comments, ...newComments];
          newComments.forEach(comment => {
            const commentCard = this.createCommentElement(comment);
            this.bottomSheetCommentsList.appendChild(commentCard);
          });

          if (this.hasMoreComments) {
            this.appendLoadMoreCommentsButton();
          }
        } else {
          this.comments = newComments;
          this.renderComments();
        }
      } else {
        if (isLoadMore) {
          this.commentPage--;
          const loadMoreBtn = this.bottomSheetCommentsList.querySelector('.load-more-comments-btn');
          if (loadMoreBtn) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = '加载更多评论';
          }
        } else {
          this.comments = [];
          this.renderComments();
        }
      }
    } catch (error) {
      if (isLoadMore) {
        this.commentPage--;
        const loadMoreBtn = this.bottomSheetCommentsList.querySelector('.load-more-comments-btn');
        if (loadMoreBtn) {
          loadMoreBtn.disabled = false;
          loadMoreBtn.textContent = '加载更多评论';
        }
      } else {
        this.comments = [];
        this.renderComments();
      }
    } finally {
      this.isLoadingComments = false;
    }
  }

  renderComments() {
    const container = this.bottomSheetCommentsList;
    container.innerHTML = '';

    const totalCount = this.countAllComments(this.comments);
    this.bottomSheetCommentCount.textContent = `${totalCount} 条评论`;
    this.actionCommentCount.textContent = totalCount;

    if (!this.comments || this.comments.length === 0) {
      container.innerHTML = '<p class="no-data" style="text-align:center;padding:2rem 0;color:var(--md-sys-color-on-surface-variant);">暂无评论，快来发表第一条吧</p>';
      return;
    }

    this.comments.forEach(comment => {
      const commentCard = this.createCommentElement(comment);
      container.appendChild(commentCard);
    });

    if (this.hasMoreComments) {
      this.appendLoadMoreCommentsButton();
    }
  }

  appendLoadMoreCommentsButton() {
    const wrapper = document.createElement('div');
    wrapper.className = 'load-more-wrapper';

    const btn = document.createElement('button');
    btn.className = 'load-more-comments-btn';
    btn.textContent = '加载更多评论';
    btn.addEventListener('click', () => this.loadComments(true));

    wrapper.appendChild(btn);
    this.bottomSheetCommentsList.appendChild(wrapper);
  }

  countAllComments(comments) {
    let count = 0;
    comments.forEach(c => {
      count++;
      if (c.replies && c.replies.length > 0) {
        count += c.replies.length;
      }
    });
    return count;
  }

  createCommentElement(comment, isReply = false) {
    const commentCard = document.createElement('div');
    commentCard.className = isReply ? 'comment-card reply-card' : 'comment-card';
    commentCard.dataset.commentId = comment.id;

    const avatarUrl = comment.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.user?.id || comment.user_id}`;
    const safeNickname = escapeHtml(comment.user?.nickname || '用户');
    const safeAvatarUrl = escapeHtml(avatarUrl);
    const safeCommentId = escapeHtml(comment.id);

    const commentHeader = document.createElement('div');
    commentHeader.className = 'comment-header';
    commentHeader.innerHTML = `
      <img src="${safeAvatarUrl}" class="comment-avatar" alt="${safeNickname}">
      <div class="comment-author-info">
        <span class="comment-author">${safeNickname}</span>
        <span class="comment-time">${this.formatTime(comment.created_at)}</span>
      </div>
    `;

    const commentContent = document.createElement('div');
    commentContent.className = 'comment-content';
    commentContent.textContent = comment.content;

    const commentActions = document.createElement('div');
    commentActions.className = 'comment-actions';
    commentActions.innerHTML = `
      <button class="comment-action-btn reply-btn" data-comment-id="${safeCommentId}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
        <span>回复</span>
      </button>
    `;

    const replyBtn = commentActions.querySelector('.reply-btn');
    if (replyBtn) {
      replyBtn.addEventListener('click', () => this.handleReplyClick(comment.id, comment.user?.nickname || '用户'));
    }

    commentCard.appendChild(commentHeader);
    commentCard.appendChild(commentContent);
    commentCard.appendChild(commentActions);

    if (comment.replies && comment.replies.length > 0) {
      const repliesList = document.createElement('div');
      repliesList.className = 'replies-list';
      comment.replies.forEach(reply => {
        const replyElement = this.createCommentElement(reply, true);
        repliesList.appendChild(replyElement);
      });

      if (comment.hasMoreReplies) {
        const loadMoreRepliesBtn = document.createElement('button');
        loadMoreRepliesBtn.className = 'load-more-replies-btn';
        loadMoreRepliesBtn.textContent = '展开更多回复';
        loadMoreRepliesBtn.addEventListener('click', () => this.loadMoreReplies(comment.id));
        repliesList.appendChild(loadMoreRepliesBtn);
      }

      commentCard.appendChild(repliesList);
    } else if (comment.hasMoreReplies) {
      const repliesList = document.createElement('div');
      repliesList.className = 'replies-list';

      const loadMoreRepliesBtn = document.createElement('button');
      loadMoreRepliesBtn.className = 'load-more-replies-btn';
      loadMoreRepliesBtn.textContent = '展开更多回复';
      loadMoreRepliesBtn.addEventListener('click', () => this.loadMoreReplies(comment.id));
      repliesList.appendChild(loadMoreRepliesBtn);

      commentCard.appendChild(repliesList);
    }

    return commentCard;
  }

  async loadMoreReplies(commentId) {
    if (this.loadingRepliesFor === commentId) return;

    this.loadingRepliesFor = commentId;

    const comment = this.comments.find(c => c.id === commentId);
    if (!comment) {
      this.loadingRepliesFor = null;
      return;
    }

    const replyPageSize = 10;
    const alreadyLoaded = comment.replies?.length || 0;
    const nextPage = Math.floor(alreadyLoaded / replyPageSize) + 1;

    const commentCard = this.bottomSheetCommentsList.querySelector(`[data-comment-id="${commentId}"]`);
    const loadMoreBtn = commentCard?.querySelector('.load-more-replies-btn');
    if (loadMoreBtn) {
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = '加载中...';
    }

    try {
      const response = await commentService.getReplies(commentId, nextPage, replyPageSize);

      if (response.success) {
        const newReplies = response.data.replies || [];
        const pagination = response.data.pagination;
        const hasMore = pagination ? pagination.page < pagination.totalPages : false;

        comment.replies = [...(comment.replies || []), ...newReplies];
        comment.hasMoreReplies = hasMore;

        if (commentCard) {
          const repliesList = commentCard.querySelector('.replies-list');
          if (repliesList) {
            newReplies.forEach(reply => {
              const replyElement = this.createCommentElement(reply, true);
              repliesList.insertBefore(replyElement, loadMoreBtn);
            });

            if (hasMore) {
              loadMoreBtn.disabled = false;
              loadMoreBtn.textContent = '展开更多回复';
            } else {
              loadMoreBtn.remove();
            }
          }
        }
      } else {
        if (loadMoreBtn) {
          loadMoreBtn.disabled = false;
          loadMoreBtn.textContent = '展开更多回复';
        }
        this.showSnackbar(response.message || '加载回复失败');
      }
    } catch (error) {
      if (loadMoreBtn) {
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = '展开更多回复';
      }
    } finally {
      this.loadingRepliesFor = null;
    }
  }

  handleReplyClick(commentId, nickname) {
    if (this.replyingTo === commentId) {
      this.cancelReply();
      return;
    }

    this.replyingTo = commentId;
    this.replyIndicator.style.display = 'flex';
    this.replyIndicatorText.textContent = `回复 ${nickname}`;
    this.bottomSheetCommentInput.placeholder = `回复 ${nickname}...`;
    this.bottomSheetCommentInput.focus();
  }

  cancelReply() {
    this.replyingTo = null;
    this.replyIndicator.style.display = 'none';
    this.replyIndicatorText.textContent = '';
    this.bottomSheetCommentInput.placeholder = '写下你的评论...';
  }

  async handleCommentSubmit() {
    const content = this.bottomSheetCommentInput.value.trim();
    if (!content) {
      this.showSnackbar('请输入评论内容');
      return;
    }

    if (this.isSubmitting) {
      return;
    }

    // 敏感词前端预检：命中则弹全屏警告，保留输入，不提交
    const hit = sensitiveWordService.check(content);
    if (hit.level > 0) {
      showContentWarnDialog();
      return;
    }

    this.isSubmitting = true;
    this.bottomSheetCommentSubmitBtn.disabled = true;

    try {
      const response = await commentService.createComment(this.postId, content, this.replyingTo);
      if (response.success) {
        this.bottomSheetCommentInput.value = '';
        this.cancelReply();
        await this.loadComments();
        await this.updateCommentCount();
        this.showSnackbar(this.replyingTo ? '回复发表成功' : '评论发表成功');
      } else {
        this.showSnackbar(response.message || '提交失败');
      }
    } catch (error) {
      this.showSnackbar('提交失败，请稍后重试');
    } finally {
      this.isSubmitting = false;
      this.bottomSheetCommentSubmitBtn.disabled = false;
    }
  }

  // Bottom Sheet
  getSheetSnap() {
    const h = window.innerHeight;
    return {
      max: Math.round(h * 0.90),
      def: Math.round(h * 0.68),
      min: Math.round(h * 0.45)
    };
  }

  setSheetHeight(px) {
    this.bottomSheet.style.setProperty('--sheet-h', `${px}px`);
  }

  openBottomSheet() {
    this.scrollY = window.scrollY;
    document.body.style.top = `-${this.scrollY}px`;
    // 初始给一个舒适的中间档位，保证评论区可见，且可上拉展开/下拉收起
    this.setSheetHeight(this.getSheetSnap().def);
    this.bottomSheetOverlay.classList.add('active');
    this.bottomSheet.classList.add('active');
    document.body.classList.add('sheet-open');

    setTimeout(() => {
      this.bottomSheetCommentInput.focus();
    }, 350);
  }

  closeBottomSheet() {
    this.bottomSheetOverlay.classList.remove('active');
    this.bottomSheet.classList.remove('active');
    document.body.classList.remove('sheet-open');
    document.body.style.top = '';
    this.cancelReply();

    window.scrollTo(0, this.scrollY);
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
    if (this.isLiking) return;
    this.isLiking = true;

    try {
      const response = await likeService.toggleLike(this.postId);
      if (response.success) {
        this.isLiked = response.data.liked;
        this.updateLikeButton();
        this.updateLikeCount();
        this.showSnackbar(response.message);
      } else {
        this.showSnackbar(response.message);
      }
    } catch (error) {
      this.showSnackbar('操作失败，请稍后重试');
    } finally {
      this.isLiking = false;
    }
  }

  updateLikeButton() {
    if (this.actionLikeBtn) {
      if (this.isLiked) {
        this.actionLikeBtn.classList.add('liked');
      } else {
        this.actionLikeBtn.classList.remove('liked');
      }
    }
  }

  async updateLikeCount() {
    const response = await likeService.getLikeCount(this.postId);
    if (response.success) {
      this.actionLikeCount.textContent = response.data;
    }
  }

  async handleFavorite() {
    if (this.isFavoriting) return;
    this.isFavoriting = true;

    try {
      const response = await favoriteService.toggleFavorite(this.postId);
      if (response.success) {
        this.isSaved = response.data.saved;
        this.updateFavoriteButton();
        this.updateFavoriteCount();
        this.showSnackbar(response.message);
      } else {
        this.showSnackbar(response.message);
      }
    } catch (error) {
      this.showSnackbar('操作失败，请稍后重试');
    } finally {
      this.isFavoriting = false;
    }
  }

  updateFavoriteButton() {
    if (this.detailFavoriteBtn) {
      if (this.isSaved) {
        this.detailFavoriteBtn.classList.add('saved');
      } else {
        this.detailFavoriteBtn.classList.remove('saved');
      }
    }
  }

  async updateFavoriteCount() {
    const response = await favoriteService.getFavoriteCount(this.postId);
    if (response.success) {
      this.detailFavorites.textContent = response.data;
    }
  }

  async updateCommentCount() {
    const response = await commentService.getCommentCount(this.postId);
    if (response.success) {
      const count = response.data;
      this.actionCommentCount.textContent = count;
      this.bottomSheetCommentCount.textContent = `${count} 条评论`;
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

  handleReport() {
    this.showReportModal();
  }

  showReportModal() {
    const existingModal = document.querySelector('.report-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'report-modal';
    modal.innerHTML = `
      <div class="report-modal-overlay"></div>
      <div class="report-modal-content">
        <div class="report-modal-header">
          <h3>举报帖子</h3>
          <button class="report-modal-close">&times;</button>
        </div>
        <div class="report-modal-body">
          <div class="report-type-group">
            <label>举报类型</label>
            <div class="report-type-options">
              ${REPORT_TYPES_ORDER.map(type => `
                <label class="report-type-option">
                  <input type="radio" name="reportType" value="${type}">
                  <span>${ReportTypeLabels[type]}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <div class="report-content-group">
            <label for="reportContent" id="reportContentLabel">补充说明（选填）</label>
            <textarea id="reportContent" placeholder="请说明举报原因..." rows="4"></textarea>
          </div>
        </div>
        <div class="report-modal-footer">
          <button class="report-cancel-btn">取消</button>
          <button class="report-submit-btn">提交举报</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('.report-modal-close');
    const overlay = modal.querySelector('.report-modal-overlay');
    const cancelBtn = modal.querySelector('.report-cancel-btn');
    const submitBtn = modal.querySelector('.report-submit-btn');
    const contentInput = modal.querySelector('#reportContent');
    const contentLabel = modal.querySelector('#reportContentLabel');
    const radioInputs = modal.querySelectorAll('input[name="reportType"]');

    const closeModal = () => modal.remove();

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    radioInputs.forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.value === ReportTypes.OTHER) {
          contentLabel.textContent = '补充说明（必填）';
          contentInput.placeholder = '选择「其他」时，请务必填写补充说明...';
        } else {
          contentLabel.textContent = '补充说明（选填）';
          contentInput.placeholder = '请说明举报原因...';
        }
      });
    });

    submitBtn.addEventListener('click', async () => {
      const selectedRadio = modal.querySelector('input[name="reportType"]:checked');

      if (!selectedRadio) {
        this.showSnackbar('请选择举报类型');
        return;
      }

      const selectedType = selectedRadio.value;
      const content = contentInput.value.trim();

      if (selectedType === ReportTypes.OTHER && !content) {
        this.showSnackbar('选择「其他」时，请填写补充说明');
        contentInput.focus();
        return;
      }

      if (this.isSubmitting) {
        return;
      }

      // 敏感词前端预检：命中则弹全屏警告，不提交
      if (content) {
        const hit = sensitiveWordService.check(content);
        if (hit.level > 0) {
          showContentWarnDialog();
          return;
        }
      }

      this.isSubmitting = true;
      submitBtn.disabled = true;
      submitBtn.textContent = '提交中...';

      try {
        const response = await reportService.createReport(
          'post',
          this.postId,
          selectedType,
          content
        );

        if (response.success) {
          this.showSnackbar('举报提交成功，我们会尽快处理');
          closeModal();
        } else {
          this.showSnackbar(response.message || '举报失败');
          submitBtn.disabled = false;
          submitBtn.textContent = '提交举报';
        }
      } catch (error) {
        this.showSnackbar('举报失败，请稍后重试');
        submitBtn.disabled = false;
        submitBtn.textContent = '提交举报';
      } finally {
        this.isSubmitting = false;
      }
    });
  }

  bindEvents() {
    const from = this.getFrom();
    if (from === 'create-post') {
      // 发布成功流程进入：返回 Home，绝不再回发帖页，避免重复发帖
      this.backButton.addEventListener('click', () => {
        window.location.href = 'home.html';
      });
    } else if (from === 'admin-reports') {
      // 管理员举报定位进入：返回举报审核
      const backSpan = this.backButton.querySelector('span');
      if (backSpan) backSpan.textContent = '返回举报审核';
      this.backButton.addEventListener('click', () => {
        window.location.href = 'admin.html#reports';
      });
    } else {
      // 普通来源：保持原有返回逻辑
      this.backButton.addEventListener('click', () => this.goBack());
    }
    this.editBtn.addEventListener('click', () => this.handleEdit());
    this.deleteBtn.addEventListener('click', () => this.handleDelete());
    this.moreButton.addEventListener('click', () => this.showSnackbar('更多功能开发中'));
    this.snackbarAction.addEventListener('click', () => this.hideSnackbar());

    if (this.actionLikeBtn) {
      this.actionLikeBtn.addEventListener('click', () => this.handleLike());
    }

    if (this.detailFavoriteBtn) {
      this.detailFavoriteBtn.addEventListener('click', () => this.handleFavorite());
    }

    if (this.actionCommentBtn) {
      this.actionCommentBtn.addEventListener('click', () => this.openBottomSheet());
    }

    if (this.actionReportBtn) {
      this.actionReportBtn.addEventListener('click', () => this.handleReport());
    }

    if (this.bottomSheetClose) {
      this.bottomSheetClose.addEventListener('click', () => this.closeBottomSheet());
    }

    if (this.bottomSheetOverlay) {
      this.bottomSheetOverlay.addEventListener('click', () => this.closeBottomSheet());
    }

    if (this.bottomSheetCommentSubmitBtn) {
      this.bottomSheetCommentSubmitBtn.addEventListener('click', () => this.handleCommentSubmit());
    }

    if (this.bottomSheetCommentInput) {
      this.bottomSheetCommentInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleCommentSubmit();
        }
      });
    }

    if (this.replyIndicatorCancel) {
      this.replyIndicatorCancel.addEventListener('click', () => this.cancelReply());
    }

    // 评论面板拖拽：上拉展开 / 下拉收起，内容区滚动与面板手势互不抢占
    let sheetStartY = 0;
    let sheetStartH = 0;
    let sheetDragging = false;
    const sheetContent = this.bottomSheet ? this.bottomSheet.querySelector('.bottom-sheet-content') : null;

    if (this.bottomSheet) {
      this.bottomSheet.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        sheetStartY = e.touches[0].clientY;
        sheetStartH = this.bottomSheet.offsetHeight;
        sheetDragging = false;
        this.bottomSheet.style.transition = 'none';
      }, { passive: true });

      this.bottomSheet.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;
        const deltaY = e.touches[0].clientY - sheetStartY;
        const atTop = !sheetContent || sheetContent.scrollTop <= 0;

        // 内容区已滚动且下拉 → 交还给列表滚动，不操作面板
        if (deltaY > 0 && !atTop) return;
        // 面板已到最大且上拉 → 交还给列表滚动
        if (deltaY < 0 && !atTop && sheetStartH >= this.getSheetSnap().max) return;

        // 拖拽面板：阻止原生滚动（仅在可取消时，避免 [Intervention] 警告）
        if (e.cancelable) e.preventDefault();
        sheetDragging = true;

        // 上拉(deltaY<0)→变高显示更多；下拉→变矮
        const snaps = this.getSheetSnap();
        let newH = sheetStartH - deltaY;
        newH = Math.max(snaps.min, Math.min(snaps.max, newH));
        this.setSheetHeight(newH);
      }, { passive: false });

      const snapToNearest = () => {
        const snaps = this.getSheetSnap();
        const candidates = [snaps.max, snaps.def, snaps.min];
        const curH = this.bottomSheet.offsetHeight;
        let best = snaps.def;
        let bestDist = Infinity;
        candidates.forEach(s => {
          const d = Math.abs(s - curH);
          if (d < bestDist) { bestDist = d; best = s; }
        });
        this.setSheetHeight(best);
      };

      this.bottomSheet.addEventListener('touchend', (e) => {
        if (sheetDragging) {
          sheetDragging = false;
          const endY = e.changedTouches[0] ? e.changedTouches[0].clientY : sheetStartY;
          const deltaY = endY - sheetStartY;
          this.bottomSheet.style.transition = '';

          // 快速下拉超过阈值 → 关闭
          if (deltaY > 140 && sheetContent && sheetContent.scrollTop <= 0) {
            this.closeBottomSheet();
            return;
          }
          // 否则吸附到最近档位
          this.bottomSheet.style.transition = 'height 0.25s cubic-bezier(0.32, 0.72, 0, 1)';
          snapToNearest();
          setTimeout(() => {
            if (this.bottomSheet) this.bottomSheet.style.transition = '';
          }, 260);
        }
      }, { passive: true });
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
