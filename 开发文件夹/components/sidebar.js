import { authService } from '../services/auth.js';

export class SidebarComponent {
  constructor() {
    this.sidebar = document.getElementById('sidebar');
    this.sidebarOverlay = document.getElementById('sidebarOverlay');
    this.sidebarClose = document.getElementById('sidebarClose');
    this.sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
    
    this.init();
  }
  
  init() {
    this.bindEvents();
  }
  
  open() {
    this.sidebar.classList.add('open');
    this.sidebarOverlay.classList.add('active');
  }
  
  close() {
    this.sidebar.classList.remove('open');
    this.sidebarOverlay.classList.remove('active');
  }
  
  bindEvents() {
    this.sidebarClose.addEventListener('click', () => this.close());
    this.sidebarOverlay.addEventListener('click', () => this.close());
    this.sidebarLogoutBtn.addEventListener('click', () => this.handleLogout());
  }
  
  async handleLogout() {
    if (!confirm('确定要退出登录吗？')) return;
    
    const response = await authService.logout();
    if (response.success) {
      window.location.href = 'login.html';
    }
  }
}

export default SidebarComponent;