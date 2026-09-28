import { authService } from '../services/auth.js';
import { messageService } from '../services/message.js';
import { escapeHtml } from '../utils/helpers.js';

class MessagePage {
  constructor() {
    this.currentPage = 1;
    this.pageSize = 20;
    this.messages = [];
    this.isLoading = false;
    this.hasMore = true;
    this.intersectionObserver = null;

    this.messagesList = document.getElementById('messagesList');
    this.loadingState = document.getElementById('loadingState');
    this.emptyState = document.getElementById('emptyState');
    this.paginationSentinel = document.getElementById('paginationSentinel');
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
      await this.loadMessages(true);
      this.setupInfiniteScroll();
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

  async loadMessages(isInitial = false) {
    if (this.isLoading || (!isInitial && !this.hasMore)) return;

    this.isLoading = true;

    if (isInitial) {
      this.showLoading(true);
      this.emptyState.style.display = 'none';
    }

    try {
      const response = await messageService.getMessages(
        this.currentPage,
        this.pageSize
      );

      if (!response.success) {
        this.showSnackbar(response.error || '加载失败');
        if (isInitial) {
          this.showEmptyState();
        }
        return;
      }

      const result = response.data;
      const messages = this.extractMessages(result);
      const hasMore = this.extractHasMore(result, messages.length);

      if (isInitial && (!messages || messages.length === 0)) {
        this.showEmptyState();
        return;
      }

      this.messages = isInitial ? messages : [...this.messages, ...messages];
      this.renderMessages(messages, !isInitial);
      this.currentPage++;

      this.hasMore = hasMore;
      if (!this.hasMore) {
        this.paginationSentinel.style.display = 'none';
      }
    } catch (error) {
      this.showSnackbar('加载失败');
      if (isInitial) {
        this.showEmptyState();
      }
    } finally {
      this.isLoading = false;
      if (isInitial) {
        this.showLoading(false);
      }
    }
  }

  extractMessages(result) {
    if (!result) return [];
    if (Array.isArray(result)) return result;
    if (Array.isArray(result.data)) return result.data;
    if (Array.isArray(result.messages)) return result.messages;
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

  renderMessages(messages, append = false) {
    messages.forEach(message => {
      const messageElement = this.createMessageElement(message);
      this.messagesList.appendChild(messageElement);
    });
  }

  createMessageElement(message) {
    const card = document.createElement('div');
    card.className = 'message-card';
    card.dataset.messageId = message.id;

    const isUnread = !message.is_read;
    const unreadDot = isUnread
      ? '<span class="message-unread-dot"></span>'
      : '';

    const safeTitle = escapeHtml(message.title || '无标题');
    const safeContent = escapeHtml(
      (message.content || message.body || '').substring(0, 100)
    );
    const safeTime = escapeHtml(this.formatTime(message.created_at));

    card.innerHTML = `
      <div class="message-header">
        ${unreadDot}
        <span class="message-title">${safeTitle}</span>
        <span class="message-time">${safeTime}</span>
      </div>
      <div class="message-content">${safeContent}</div>
    `;

    card.addEventListener('click', () => this.handleMessageClick(message, card));

    return card;
  }

  async handleMessageClick(message, cardElement) {
    // 标记为已读
    if (!message.is_read) {
      try {
        const response = await messageService.markRead(message.id);
        if (response.success) {
          message.is_read = true;
          const dot = cardElement.querySelector('.message-unread-dot');
          if (dot) {
            dot.remove();
          }
        }
      } catch (error) {
        // 静默失败，不影响用户体验
      }
    }
  }

  setupInfiniteScroll() {
    if (!this.paginationSentinel) return;

    this.intersectionObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !this.isLoading && this.hasMore) {
        this.loadMessages(false);
      }
    }, {
      rootMargin: '200px'
    });

    this.intersectionObserver.observe(this.paginationSentinel);
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  showLoading(isLoading) {
    if (isLoading) {
      this.loadingState.style.display = 'flex';
    } else {
      this.loadingState.style.display = 'none';
    }
  }

  showEmptyState() {
    this.emptyState.style.display = 'flex';
    this.paginationSentinel.style.display = 'none';
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
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'home.html';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new MessagePage();
});
