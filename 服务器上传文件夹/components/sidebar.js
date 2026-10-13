import { authService } from '../services/auth.js';

const KOOLESSON_URL = 'https://koolesson.com/#forum';
const KOOLESSON_ICON = `
  <svg class="koolesson-entry__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.4L3.6 7v10L12 21.6 20.4 17V7L12 2.4zm0 2.05l6.55 3.58L12 11.6 5.45 8.03 12 4.45zM4.9 9.2l6.2 3.48v6.85L4.9 16.08V9.2zm7.3 10.33v-6.85l6.2-3.48v6.88l-6.2 3.45z"/>
  </svg>
`;

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
      this.ensureKoolessonEntry();
      this.bindEvents();
    } catch (error) {
    }
  }

  /** 统一注入科创论坛入口（位于退出按钮上方；无退出按钮时仍显示） */
  ensureKoolessonEntry() {
    if (!this.sidebar) return;
    if (this.sidebar.querySelector('.koolesson-entry')) return;

    const content = this.sidebar.querySelector('.sidebar-content') || this.sidebar;
    let footer = this.sidebar.querySelector('.sidebar-footer');
    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'sidebar-footer';
      content.appendChild(footer);
    }

    const link = document.createElement('a');
    link.className = 'koolesson-entry koolesson-entry--sidebar';
    link.href = KOOLESSON_URL;
    link.setAttribute('aria-label', '前往科创论坛');
    link.innerHTML = `
      <span class="koolesson-entry__inner">
        ${KOOLESSON_ICON}
        <span class="koolesson-entry__label">科创论坛</span>
      </span>
    `;

    const logout = footer.querySelector('#sidebarLogoutBtn, .logout-btn');
    if (logout) {
      footer.insertBefore(link, logout);
    } else {
      footer.prepend(link);
    }
  }

  isDesktopPermanent() {
    return document.body.classList.contains('home-page')
      && window.matchMedia('(min-width: 1025px)').matches;
  }

  open() {
    if (this.isDesktopPermanent()) return;
    if (this.sidebar) this.sidebar.classList.add('open');
    if (this.sidebarOverlay) this.sidebarOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  close() {
    if (this.isDesktopPermanent()) return;
    if (this.sidebar) this.sidebar.classList.remove('open');
    if (this.sidebarOverlay) this.sidebarOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  bindEvents() {
    if (this.sidebarClose) {
      this.sidebarClose.addEventListener('click', () => this.close());
    }
    if (this.sidebarOverlay) {
      this.sidebarOverlay.addEventListener('click', () => this.close());
    }
    if (this.sidebarLogoutBtn) {
      this.sidebarLogoutBtn.addEventListener('click', () => this.handleLogout());
    }
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
