import { authService } from '../services/auth.js';
import { categoryService } from '../services/category.js';

export class SidebarComponent {
  constructor(options = {}) {
    this.onCategoryChange = options.onCategoryChange || (() => {});
    
    this.sidebar = document.getElementById('sidebar');
    this.sidebarOverlay = document.getElementById('sidebarOverlay');
    this.sidebarClose = document.getElementById('sidebarClose');
    this.sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
    this.sidebarCategoryList = document.getElementById('sidebarCategoryList');

    this.snackbarTimer = null;

    this.init();
  }
  
  async init() {
    try {
      await this.loadCategories();
      this.bindEvents();
    } catch (error) {
    }
  }
  
  async loadCategories() {
    const response = await categoryService.getCategories();
    if (response.success) {
      this.renderCategories(response.data);
    }
  }
  
  renderCategories(categories) {
    if (!categories) return;
    categories.forEach(category => {
      const li = document.createElement('li');
      li.className = 'nav-item';
      li.innerHTML = `
        <a href="#" data-category-id="${category.id}">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
          </svg>
          <span>${category.name}</span>
        </a>
      `;
      li.addEventListener('click', (e) => {
        e.preventDefault();
        this.onCategoryChange(category.id);
        this.close();
      });
      this.sidebarCategoryList.appendChild(li);
    });
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