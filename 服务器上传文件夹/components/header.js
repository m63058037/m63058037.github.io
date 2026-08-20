import { authService } from '../services/auth.js';

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
