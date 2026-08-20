import { authService } from '../services/auth.js';
import { HeaderComponent } from '../components/header.js';
import { FeedComponent } from '../components/feed.js';
import { SidebarComponent } from '../components/sidebar.js';
import { RightSidebarComponent } from '../components/right-sidebar.js';
import { getBranchOptionsWithAll, ALL_BRANCH, getBranchByName } from '../config/branches.js';

class HomePage {
  constructor() {
    this.currentUser = null;
    this.currentBranch = ALL_BRANCH;

    this.header = null;
    this.feed = null;
    this.sidebar = null;
    this.rightSidebar = null;

    this.branchNav = document.getElementById('branchNav');
    this.branchScroll = document.getElementById('branchScroll');

    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');

    this.snackbarTimer = null;

    this.init();
  }

  async init() {
    try {
      await this.getCurrentUser();
      this.parseBranchFromURL();
      this.renderBranchNav();
      await this.initComponents();
      this.bindEvents();
    } catch (error) {
      console.error('[HomePage] 初始化失败:', error);
      this.showSnackbar('页面加载失败');
    }
  }

  parseBranchFromURL() {
    const params = new URLSearchParams(window.location.search);
    const branch = params.get('branch');
    if (branch) {
      const info = getBranchByName(branch);
      if (info) {
        this.currentBranch = branch;
      }
    }
  }

  renderBranchNav() {
    const options = getBranchOptionsWithAll();
    this.branchScroll.innerHTML = '';

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'category-item' + (opt.value === this.currentBranch ? ' active' : '');
      btn.dataset.branch = opt.value;
      btn.textContent = opt.label;
      btn.addEventListener('click', () => this.handleBranchChange(opt.value));
      this.branchScroll.appendChild(btn);
    });
  }

  handleBranchChange(branch) {
    if (branch === this.currentBranch) return;
    this.currentBranch = branch;

    this.branchScroll.querySelectorAll('.category-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.branch === branch);
    });

    const url = new URL(window.location);
    url.searchParams.set('branch', branch);
    window.history.replaceState({}, '', url);

    if (this.feed) {
      this.feed.setBranch(branch);
    }
  }

  async getCurrentUser() {
    const response = await authService.getCurrentUser();
    if (response.success) {
      this.currentUser = response.data;
      this.updatePostPermissionUI();
    }
  }

  async updatePostPermissionUI() {
    try {
      const permission = await authService.canPost();
      if (!permission.allowed) {
        const createPostCard = document.querySelector('.create-post-card');
        if (createPostCard) {
          createPostCard.style.display = 'none';
        }
        const postButtons = document.querySelectorAll('a[href="post.html"]');
        postButtons.forEach(btn => {
          btn.style.display = 'none';
        });
      }
    } catch (error) {
    }
  }

  async initComponents() {
    this.header = new HeaderComponent({
      onMenuClick: () => this.sidebar.open(),
      onSearch: (keyword) => this.handleSearch(keyword)
    });

    this.feed = new FeedComponent({
      pageSize: 20,
      branch: this.currentBranch
    });

    this.sidebar = new SidebarComponent();

    this.rightSidebar = new RightSidebarComponent();
  }

  handleSearch(keyword) {
    window.location.href = `search.html?keyword=${encodeURIComponent(keyword)}`;
  }

  bindEvents() {
    if (this.snackbarAction) {
      this.snackbarAction.addEventListener('click', () => this.hideSnackbar());
    }
    this.initHeaderScroll();
  }

  initHeaderScroll() {
    const header = document.querySelector('.home-header');
    if (!header) return;

    let lastScrollY = window.scrollY;
    let ticking = false;

    const updateHeader = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY <= 0) {
        header.classList.remove('header-hidden');
      } else if (currentScrollY > lastScrollY && currentScrollY > 80) {
        header.classList.add('header-hidden');
      } else if (currentScrollY < lastScrollY) {
        header.classList.remove('header-hidden');
      }

      lastScrollY = currentScrollY;
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(updateHeader);
        ticking = true;
      }
    }, { passive: true });
  }

  showSnackbar(message) {
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
    }
    this.snackbarLabel.textContent = message;
    this.snackbar.classList.add('show');

    this.snackbarTimer = setTimeout(() => {
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
