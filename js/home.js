import { authService } from '../services/auth.js';
import { announcementService } from '../services/announcement.js';
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

    // 公告弹窗相关
    this.announcementModal = null;
    this.unreadAnnouncements = [];
    this.currentAnnouncementIndex = 0;

    this.init();
  }

  async init() {
    try {
      await this.getCurrentUser();
      this.parseBranchFromURL();
      this.renderBranchNav();
      await this.initComponents();
      this.bindEvents();
      this.initAnnouncements();
      this.initLottieIcons();
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
      this.updateRoleUI();
      this.updatePostPermissionUI();
    }
  }

  updateRoleUI() {
    const entry = document.getElementById('navAdminEntry');
    if (!entry) return;
    const role = this.currentUser?.role;
    entry.style.display = (role === 'admin' || role === 'dev_admin') ? '' : 'none';
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

  async initAnnouncements() {
    try {
      const response = await announcementService.getUnread();
      if (!response.success || !response.data || response.data.length === 0) {
        return;
      }

      // 按发布时间倒序，最新的在前（RPC 返回 published_at）
      this.unreadAnnouncements = response.data.sort((a, b) =>
        new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at)
      );
      this.currentAnnouncementIndex = 0;
      this.showAnnouncementModal();
    } catch (error) {
      // 静默失败，不影响用户体验
    }
  }

  showAnnouncementModal() {
    if (this.announcementModal) {
      this.announcementModal.remove();
    }

    this.announcementModal = document.createElement('div');
    this.announcementModal.className = 'announcement-modal-overlay';
    this.announcementModal.innerHTML = `
      <div class="announcement-modal">
        <div class="announcement-modal-header">
          <h3 class="announcement-modal-title"></h3>
          <div class="announcement-modal-meta"></div>
        </div>
        <div class="announcement-modal-content"></div>
        <div class="announcement-modal-footer">
          <button class="announcement-modal-confirm" type="button">知道了</button>
        </div>
      </div>
    `;

    // 点击遮罩不关闭
    this.announcementModal.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    const confirmBtn = this.announcementModal.querySelector('.announcement-modal-confirm');
    confirmBtn.addEventListener('click', () => this.handleAnnouncementConfirm());

    // ESC 键关闭
    this._announcementKeyHandler = (e) => {
      if (e.key === 'Escape') {
        this.handleAnnouncementConfirm();
      }
    };
    document.addEventListener('keydown', this._announcementKeyHandler);

    document.body.appendChild(this.announcementModal);
    this.renderCurrentAnnouncement();
  }

  renderCurrentAnnouncement() {
    if (!this.announcementModal || this.unreadAnnouncements.length === 0) return;

    const announcement = this.unreadAnnouncements[this.currentAnnouncementIndex];
    if (!announcement) return;

    const titleEl = this.announcementModal.querySelector('.announcement-modal-title');
    const contentEl = this.announcementModal.querySelector('.announcement-modal-content');
    const metaEl = this.announcementModal.querySelector('.announcement-modal-meta');

    titleEl.textContent = announcement.title || '公告';
    contentEl.textContent = announcement.content || '';

    const publisher = announcement.author_name || announcement.publisher_name || '管理员';
    const publishTime = this.formatAnnouncementTime(announcement.published_at || announcement.created_at);
    metaEl.textContent = `${publisher} · ${publishTime}`;
  }

  async handleAnnouncementConfirm() {
    const currentAnnouncement = this.unreadAnnouncements[this.currentAnnouncementIndex];
    if (currentAnnouncement) {
      try {
        await announcementService.markRead(currentAnnouncement.id);
      } catch (error) {
        // 静默失败
      }
    }

    this.currentAnnouncementIndex++;

    if (this.currentAnnouncementIndex < this.unreadAnnouncements.length) {
      this.renderCurrentAnnouncement();
    } else {
      this.closeAnnouncementModal();
    }
  }

  closeAnnouncementModal() {
    if (this._announcementKeyHandler) {
      document.removeEventListener('keydown', this._announcementKeyHandler);
      this._announcementKeyHandler = null;
    }

    if (this.announcementModal) {
      this.announcementModal.remove();
      this.announcementModal = null;
    }

    this.unreadAnnouncements = [];
    this.currentAnnouncementIndex = 0;
  }

  formatAnnouncementTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  /**
   * 初始化Lottie图标
   * 暂停Lottie图标替换，确保基础UI正常
   */
  async initLottieIcons() {
    try {
      // 暂停所有Lottie图标替换，确保基础UI正常
      console.log('[LottieIcon] 暂停Lottie图标替换，确保基础UI正常');
      
      // 目前只保留Lottie库加载，但不进行图标替换
      // 这样可以避免破坏DOM结构和样式冲突
      
      console.log('[HomePage] Lottie图标初始化完成（暂停替换模式）');
    } catch (error) {
      console.warn('[HomePage] Lottie图标初始化失败:', error);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new HomePage();
});
