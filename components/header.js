import { authService } from '../services/auth.js';
import { messageService } from '../services/message.js';

export class HeaderComponent {
  constructor(options = {}) {
    this.onMenuClick = options.onMenuClick || (() => {});
    this.onSearch = options.onSearch || (() => {});

    this.currentUser = null;

    this.menuButton = document.getElementById('menuButton');
    this.searchInput = document.getElementById('searchInput');
    this.searchButton = document.getElementById('searchButton');
    this.userAvatar = document.getElementById('userAvatar');
    this.userNickname = document.getElementById('userNickname');
    this.userMenuButton = document.getElementById('userMenuButton');
    this.messageButton = null;
    this.messageBadge = null;

    this.snackbarTimer = null;

    this.init();
  }

  async init() {
    try {
      await this.getCurrentUser();
      this.renderUserInfo();
      this.bindEvents();
    } catch (error) {
    }
  }

  async getCurrentUser() {
    const response = await authService.getCurrentUser();
    if (response.success) {
      this.currentUser = response.data;
    }
  }

  renderUserInfo() {
    if (!this.currentUser) return;

    this.userNickname.textContent = this.currentUser.nickname || '用户';

    if (this.userAvatar) {
      if (this.currentUser.avatar) {
        this.userAvatar.src = this.currentUser.avatar;
      } else {
        this.userAvatar.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${this.currentUser.id}`;
      }
      this.userAvatar.onerror = () => {
        this.userAvatar.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=default';
      };
    }

    this.renderMessageButton();
  }

  renderMessageButton() {
    if (!this.currentUser) return;

    const headerRight = document.querySelector('.header-right');
    if (!headerRight) return;

    // 如果按钮已存在，不重复创建
    if (this.messageButton) return;

    this.messageButton = document.createElement('button');
    this.messageButton.className = 'message-btn';
    this.messageButton.setAttribute('aria-label', '消息通知');
    this.messageButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <span class="message-badge" style="display: none;">0</span>
    `;

    this.messageBadge = this.messageButton.querySelector('.message-badge');

    this.messageButton.addEventListener('click', () => {
      window.location.href = 'messages.html';
    });

    // 插入到用户菜单按钮之前
    if (this.userMenuButton) {
      headerRight.insertBefore(this.messageButton, this.userMenuButton);
    } else {
      headerRight.appendChild(this.messageButton);
    }

    this.updateUnreadBadge();
  }

  async updateUnreadBadge() {
    if (!this.currentUser || !this.messageBadge) return;

    try {
      const response = await messageService.getUnreadCount();
      if (response.success) {
        const count = response.data || 0;
        if (count > 0) {
          this.messageBadge.textContent = count > 99 ? '99+' : String(count);
          this.messageBadge.style.display = 'flex';
        } else {
          this.messageBadge.style.display = 'none';
        }
      }
    } catch (error) {
      // 静默失败，不影响用户体验
    }
  }

  bindEvents() {
    if (this.menuButton) {
      this.menuButton.addEventListener('click', () => this.onMenuClick());
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.handleSearch();
        }
      });
    }

    if (this.searchButton) {
      this.searchButton.addEventListener('click', () => this.handleSearch());
    }

    if (this.userMenuButton) {
      this.userMenuButton.addEventListener('click', () => this.handleUserMenu());
    }
  }

  handleSearch() {
    const keyword = this.searchInput.value.trim();
    if (!keyword) return;
    this.onSearch(keyword);
  }

  handleUserMenu() {
    window.location.href = 'profile.html';
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

export default HeaderComponent;
