import { authService } from '../services/auth.js';
import { HeaderComponent } from '../components/header.js';
import { FeedComponent } from '../components/feed.js';
import { SidebarComponent } from '../components/sidebar.js';
import { RightSidebarComponent } from '../components/right-sidebar.js';

class HomePage {
  constructor() {
    this.currentUser = null;
    this.currentCategoryId = null;
    
    this.header = null;
    this.feed = null;
    this.sidebar = null;
    this.rightSidebar = null;
    
    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');
    
    this.init();
  }
  
  async init() {
    try {
      await this.checkSession();
      await this.getCurrentUser();
      await this.initComponents();
      this.bindEvents();
    } catch (error) {
      console.error('Home init error:', error);
      this.showSnackbar('页面加载失败');
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
  
  async initComponents() {
    this.header = new HeaderComponent({
      onMenuClick: () => this.sidebar.open(),
      onCategoryChange: (categoryId) => this.handleCategoryChange(categoryId),
      onSearch: (keyword) => this.handleSearch(keyword)
    });
    
    this.feed = new FeedComponent({
      pageSize: 10
    });
    
    this.sidebar = new SidebarComponent({
      onCategoryChange: (categoryId) => this.handleCategoryChange(categoryId)
    });
    
    this.rightSidebar = new RightSidebarComponent();
  }
  
  handleCategoryChange(categoryId) {
    this.currentCategoryId = categoryId;
    this.header.setActiveCategory(categoryId);
    this.feed.loadPosts(1, categoryId);
  }
  
  handleSearch(keyword) {
    window.location.href = `search.html?keyword=${encodeURIComponent(keyword)}`;
  }
  
  bindEvents() {
    this.snackbarAction.addEventListener('click', () => this.hideSnackbar());
  }
  
  showSnackbar(message) {
    this.snackbarLabel.textContent = message;
    this.snackbar.classList.add('show');
    
    setTimeout(() => {
      this.hideSnackbar();
    }, 5000);
  }
  
  hideSnackbar() {
    this.snackbar.classList.remove('show');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new HomePage();
});