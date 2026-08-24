import { authService } from '../services/auth.js';

export class SidebarComponent {
  constructor(options = {}) {
    this.sidebar = document.getElementById('sidebar');
    this.sidebarOverlay = document.getElementById('sidebarOverlay');
    this.sidebarClose = document.getElementById('sidebarClose');
    this.sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');

    this.snackbarTimer = null;

    this.init();
  }

  async init() {
    try {
      this.bindEvents();
    } catch (error) {
    }
  }

  open() {
    if (this.sidebar) this.sidebar.classList.add('open');
    if (this.sidebarOverlay) this.sidebarOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  close() {
    if (this.sidebar) this.sidebar.classList.remove('open');
    if (this.sidebarOverlay) this.sidebarOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  bindEvents() {
    this.sidebarClose.addEventListener('click', () => this.close());
    this.sidebarOverlay.addEventListener('click', () => this.close());
    this.sidebarLogoutBtn.addEventListener('click', () => this.handleLogout());
  }

  async handleLogout() {
    if (!confirm('确定要退出登录吗？')) return;

    try {
      const response = await authService.logout();
      if (response.success) {
        window.location.href = 'login.html';
      } else {
        this.showSnackbar('退出登录失败，请稍后重试');
      }
    } catch (error) {
      this.showSnackbar('退出登录失败，请稍后重试');
    }
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

  goBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'home.html';
    }
  }
}

export default SidebarComponent;
