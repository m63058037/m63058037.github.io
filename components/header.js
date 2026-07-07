import { authService } from '../services/auth.js';
import { categoryService } from '../services/category.js';

export class HeaderComponent {
  constructor(options = {}) {
    this.onMenuClick = options.onMenuClick || (() => {});
    this.onCategoryChange = options.onCategoryChange || (() => {});
    this.onSearch = options.onSearch || (() => {});
    
    this.currentUser = null;
    this.categories = [];
    
    this.menuButton = document.getElementById('menuButton');
    this.searchInput = document.getElementById('searchInput');
    this.searchButton = document.getElementById('searchButton');
    this.userAvatar = document.getElementById('userAvatar');
    this.userNickname = document.getElementById('userNickname');
    this.userMenuButton = document.getElementById('userMenuButton');
    this.allCategory = document.getElementById('allCategory');
    this.categoryList = document.getElementById('categoryList');
    
    this.init();
  }
  
  async init() {
    try {
      await this.getCurrentUser();
      await this.loadCategories();
      this.renderUserInfo();
      this.renderCategories();
      this.bindEvents();
    } catch (error) {
      console.error('Header init error:', error);
    }
  }
  
  async getCurrentUser() {
    const response = await authService.getCurrentUser();
    if (response.success) {
      this.currentUser = response.data;
    }
  }
  
  async loadCategories() {
    const response = await categoryService.getCategories();
    if (response.success) {
      this.categories = response.data;
    }
  }
  
  renderUserInfo() {
    if (!this.currentUser) return;
    
    this.userNickname.textContent = this.currentUser.nickname || '用户';
    
    if (this.currentUser.avatar) {
      this.userAvatar.src = this.currentUser.avatar;
    } else {
      this.userAvatar.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${this.currentUser.id}`;
    }
  }
  
  renderCategories() {
    this.categoryList.innerHTML = '';
    
    this.categories.forEach(category => {
      const btn = document.createElement('button');
      btn.className = 'category-item';
      btn.dataset.categoryId = category.id;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
        </svg>
        <span>${category.name}</span>
      `;
      btn.addEventListener('click', () => this.handleCategoryClick(category.id));
      this.categoryList.appendChild(btn);
    });
  }
  
  handleCategoryClick(categoryId) {
    document.querySelectorAll('.category-item').forEach(btn => {
      btn.classList.remove('active');
    });
    
    if (!categoryId) {
      this.allCategory.classList.add('active');
    } else {
      const btn = document.querySelector(`.category-item[data-category-id="${categoryId}"]`);
      if (btn) btn.classList.add('active');
    }
    
    this.onCategoryChange(categoryId);
  }
  
  setActiveCategory(categoryId) {
    document.querySelectorAll('.category-item').forEach(btn => {
      btn.classList.remove('active');
    });
    
    if (!categoryId) {
      this.allCategory.classList.add('active');
    } else {
      const btn = document.querySelector(`.category-item[data-category-id="${categoryId}"]`);
      if (btn) btn.classList.add('active');
    }
  }
  
  bindEvents() {
    this.menuButton.addEventListener('click', () => this.onMenuClick());
    
    this.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleSearch();
      }
    });
    
    this.searchButton.addEventListener('click', () => this.handleSearch());
    
    this.allCategory.addEventListener('click', () => this.handleCategoryClick(null));
    
    this.userMenuButton.addEventListener('click', () => this.handleUserMenu());
  }
  
  handleSearch() {
    const keyword = this.searchInput.value.trim();
    if (!keyword) return;
    this.onSearch(keyword);
  }
  
  handleUserMenu() {
    window.location.href = 'profile.html';
  }
}

export default HeaderComponent;