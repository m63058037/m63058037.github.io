import { authService, UserRoles } from '../services/auth.js';
import { adminService } from '../services/admin.js';
import { announcementService } from '../services/announcement.js';
import { messageService } from '../services/message.js';
import { sensitiveWordService } from '../services/sensitive-word.js';
import { showContentWarnDialog } from '../components/content-warn-dialog.js';
import { themeService, isValidHexColor } from '../services/theme.js';
import { THEME_CATEGORY_LABELS, THEME_FIELD_LABELS } from '../config/theme-defaults.js';

// 与服务端 services/report.js 中 ReportTypes 枚举值保持一致的中文标签
// 键为短信/提交端真实存储的 report_type 值，而非旧版错误键名（spam/harassment/inappropriate/other）
const REPORT_TYPE_LABELS = {
  advertising: '广告行为',
  harassment: '存在骚扰行为',
  trading: '存在交易行为',
  abuse: '辱骂行为',
  not_student: '该用户疑似不是我校学生',
  other: '其他'
};

class AdminPage {
  constructor() {
    this.currentUser = null;
    this.userRole = null;
    this.currentSection = 'dashboard';
    this.passwordResetTab = 'pending';
    this.reportsTab = 'pending';
    this.penaltyHistoryPage = 1;
    this.auditLogsPage = 1;
    this.l4HitsTab = 'pending';
    // 公告编辑内容缓存：避免把长文塞进 data-* 属性
    this.announcementEditCache = new Map();
    this.themeDraft = null;
    this.themeSaved = null;
    this.themeName = '';

    // DOM 元素
    this.sidebar = document.querySelector('.admin-sidebar');
    this.adminMenuBtn = document.getElementById('adminMenuBtn');
    this.adminDrawerOverlay = document.getElementById('adminDrawerOverlay');
    this.navItems = document.querySelectorAll('.nav-item');
    this.accordionHeaders = document.querySelectorAll('.accordion-header');
    this.accordionBodies = document.querySelectorAll('.accordion-body');
    this.adminContent = document.getElementById('adminContent');
    this.topbarTitle = document.getElementById('topbarTitle');
    this.announcementsNavItem = document.querySelector('.nav-item[data-section="announcements"]');

    // Snackbar
    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');
    this.snackbarTimer = null;

    // 通知相关
    this.unreadCount = 0;
    this.notificationDropdown = null;
    this.notifications = [];

    this.init();
  }

  async init() {
    try {
      await this.checkAuthAndRole();
      this.setupSidebarVisibility();
      this.renderTopbarNotifications();
      this.bindSidebarEvents();
      this.bindDrawerEvents();
      this.bindSnackbarEvents();
      this.handleHashChange();
      window.addEventListener('hashchange', () => this.handleHashChange());
      this.loadUnreadNotifications();
    } catch (error) {
      console.error('[AdminPage] 初始化失败:', error);
      this.showSnackbar('页面加载失败');
    }
  }

  /**
   * 权限检查：登录状态 + 角色
   */
  async checkAuthAndRole() {
    const userResponse = await authService.getCurrentUser();
    if (!userResponse.success) {
      this.redirectToHome('请先登录');
      return;
    }
    this.currentUser = userResponse.data;

    const roleResponse = await adminService.getCurrentUserRole();
    if (!roleResponse.success) {
      this.redirectToHome('无法获取用户角色');
      return;
    }

    this.userRole = roleResponse.data;

    // 非管理员直接跳转
    if (this.userRole !== UserRoles.ADMIN && this.userRole !== UserRoles.DEV_ADMIN) {
      this.redirectToHome('您没有管理后台权限');
      return;
    }
  }

  redirectToHome(message) {
    this.showSnackbar(message);
    setTimeout(() => {
      window.location.href = 'home.html';
    }, 1500);
  }

  /** 敏感词前端预检（公告标题/正文）：命中则弹全屏警告并拒绝提交 */
  precheckAnnouncement(title, content) {
    if (sensitiveWordService.check(title).level > 0 || sensitiveWordService.check(content).level > 0) {
      showContentWarnDialog();
      return true;
    }
    return false;
  }

  isDevAdminOnlySection(section) {
    return section === 'announcements' || section === 'theme-ui'
      || section === 'admin-roles' || section === 'sensitive-l4';
  }

  /**
   * 根据角色设置侧边栏可见性
   */
  setupSidebarVisibility() {
    const isDevAdmin = this.userRole === UserRoles.DEV_ADMIN;
    // 对普通管理员隐藏「公告管理」整个分组（含 header + nav-item），
    // 避免仅隐藏 header 导致 nav-item 悬浮显示。不用 :has()（兼容性不稳）。
    this.navItems.forEach(item => {
      if ((item.dataset.section === 'announcements' || item.dataset.section === 'theme-ui'
        || item.dataset.section === 'admin-roles' || item.dataset.section === 'sensitive-l4') && !isDevAdmin) {
        item.style.display = 'none';
      }
    });
    if (!isDevAdmin) {
      this.accordionHeaders.forEach(header => {
        const key = header.dataset.accordion;
        if (key === 'announcement-group' || key === 'theme-group') {
          header.style.display = 'none';
          const body = this.sidebar.querySelector(`.accordion-body[data-accordion-body="${key}"]`);
          if (body) body.style.display = 'none';
        }
      });
    }
  }

  /**
   * 顶部通知栏
   */
  renderTopbarNotifications() {
    const topbar = document.querySelector('.admin-topbar');
    if (!topbar) return;

    // 移除已存在的通知按钮
    const existingBtn = topbar.querySelector('.topbar-notification-btn');
    if (existingBtn) existingBtn.remove();

    const btnWrapper = document.createElement('div');
    btnWrapper.className = 'topbar-notification-wrapper';
    btnWrapper.style.position = 'relative';
    btnWrapper.style.marginLeft = 'auto';

    const btn = document.createElement('button');
    btn.className = 'topbar-notification-btn';
    btn.style.cssText = `
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.5rem;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--md-sys-color-on-surface);
      transition: background-color 0.2s;
      position: relative;
    `;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
      </svg>
      <span class="notification-badge" style="
        position: absolute;
        top: 2px;
        right: 2px;
        min-width: 18px;
        height: 18px;
        border-radius: 9px;
        background-color: var(--md-sys-color-error);
        color: var(--md-sys-color-on-error);
        font-size: 11px;
        font-weight: 500;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 0 4px;
      ">0</span>
    `;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleNotificationDropdown(btnWrapper);
    });

    btnWrapper.appendChild(btn);
    topbar.appendChild(btnWrapper);

    // 点击外部关闭下拉
    document.addEventListener('click', (e) => {
      if (!btnWrapper.contains(e.target)) {
        this.closeNotificationDropdown();
      }
    });
  }

  updateNotificationBadge(count) {
    this.unreadCount = count;
    const badge = document.querySelector('.topbar-notification-btn .notification-badge');
    if (badge) {
      if (count > 0) {
        badge.style.display = 'flex';
        badge.textContent = count > 99 ? '99+' : count;
      } else {
        badge.style.display = 'none';
      }
    }
  }

  async loadUnreadNotifications() {
    try {
      const response = await messageService.getAdminNotifications(1, 20);
      if (response.success && response.data) {
        this.notifications = response.data;
        const unread = this.notifications.filter(n => !n.is_read).length;
        this.updateNotificationBadge(unread);
      }
    } catch (error) {
      console.error('[AdminPage] 加载通知失败:', error);
    }
  }

  toggleNotificationDropdown(btnWrapper) {
    const existing = document.getElementById('notificationDropdown');
    if (existing) {
      this.closeNotificationDropdown();
      return;
    }
    this.openNotificationDropdown(btnWrapper);
  }

  openNotificationDropdown(btnWrapper) {
    const dropdown = document.createElement('div');
    dropdown.id = 'notificationDropdown';
    dropdown.style.cssText = `
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 360px;
      max-height: 480px;
      overflow-y: auto;
      background-color: var(--md-sys-color-surface);
      border-radius: 0.75rem;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      z-index: 1000;
      border: 1px solid var(--md-sys-color-outline-variant);
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--md-sys-color-outline-variant);
      font-weight: 500;
      color: var(--md-sys-color-on-surface);
    `;
    header.textContent = '管理员通知';
    dropdown.appendChild(header);

    const list = document.createElement('div');
    list.className = 'notification-list';

    if (!this.notifications || this.notifications.length === 0) {
      list.innerHTML = `
        <div style="padding: 2rem 1rem; text-align: center; color: var(--md-sys-color-on-surface-variant);">
          暂无通知
        </div>
      `;
    } else {
      this.notifications.forEach(notification => {
        const item = document.createElement('div');
        item.className = 'notification-item';
        const isUnread = !notification.read_at;
        item.style.cssText = `
          padding: 0.875rem 1.25rem;
          border-bottom: 1px solid var(--md-sys-color-outline-variant);
          cursor: pointer;
          transition: background-color 0.2s;
          background-color: ${isUnread ? 'var(--md-sys-color-primary-container)' : 'transparent'};
        `;
        item.innerHTML = `
          <div style="font-size: 0.875rem; font-weight: ${isUnread ? '500' : '400'}; color: var(--md-sys-color-on-surface); margin-bottom: 0.25rem;">
            ${this.escapeHtml(notification.title || '通知')}
          </div>
          <div style="font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant);">
            ${this.formatTime(notification.created_at)}
          </div>
        `;
        item.addEventListener('click', () => this.handleNotificationClick(notification));
        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = 'var(--md-sys-color-surface-container-high)';
        });
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = isUnread ? 'var(--md-sys-color-primary-container)' : 'transparent';
        });
        list.appendChild(item);
      });
    }

    dropdown.appendChild(list);
    btnWrapper.appendChild(dropdown);
  }

  closeNotificationDropdown() {
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) dropdown.remove();
  }

  async handleNotificationClick(notification) {
    try {
      await messageService.markAdminNotificationRead(notification.id);
    } catch (e) { /* ignore */ }

    this.closeNotificationDropdown();

    // 根据 target_type 跳转
    const targetType = notification.target_type;
    if (targetType === 'password_reset' || targetType === 'password-reset') {
      this.switchSection('password-reset');
    } else if (targetType === 'report') {
      this.switchSection('reports');
    } else if (targetType === 'announcement') {
      if (this.userRole === UserRoles.DEV_ADMIN) {
        this.switchSection('announcements');
      }
    } else {
      this.switchSection('dashboard');
    }

    // 刷新通知列表
    this.loadUnreadNotifications();
  }

  /**
   * 侧边栏事件绑定
   */
  bindSidebarEvents() {
    this.navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.dataset.section;
        if (!section) return;
        // 普通管理员不能访问公告管理
        if (this.isDevAdminOnlySection(section) && this.userRole !== UserRoles.DEV_ADMIN) {
          this.showSnackbar('您没有权限访问此功能');
          return;
        }
        this.switchSection(section);
      });
    });

    this.bindAccordionEvents();
  }

  /**
   * 移动端 Accordion 分组导航：点击 header 展开/收起对应分组。
   * 桌面端默认全部展开；仅当处于移动端视口时才允许折叠。
   */
  bindAccordionEvents() {
    this.accordionHeaders.forEach(header => {
      header.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleAccordion(header);
      });
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.toggleAccordion(header);
        }
      });
    });
  }

  toggleAccordion(header) {
    const groupKey = header.dataset.accordion;
    const body = this.sidebar.querySelector(`.accordion-body[data-accordion-body="${groupKey}"]`);
    if (!body) return;
    const isOpen = header.classList.toggle('open');
    body.classList.toggle('open', isOpen);
  }

  /**
   * 移动端左侧 Drawer 导航：hamburger 打开，遮罩/再次点击/切换功能关闭。
   */
  bindDrawerEvents() {
    if (this.adminMenuBtn) {
      this.adminMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.sidebar.classList.contains('open')) {
          this.closeDrawer();
        } else {
          this.openDrawer();
        }
      });
    }
    if (this.adminDrawerOverlay) {
      this.adminDrawerOverlay.addEventListener('click', () => this.closeDrawer());
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeDrawer();
    });
  }

  openDrawer() {
    this.sidebar.classList.add('open');
    if (this.adminDrawerOverlay) {
      this.adminDrawerOverlay.classList.add('open');
      this.adminDrawerOverlay.setAttribute('aria-hidden', 'false');
    }
    if (this.adminMenuBtn) this.adminMenuBtn.setAttribute('aria-expanded', 'true');
    // 首次打开抽屉时展开当前账号有权限的全部导航分组，确保「更多」菜单即打开即完整，
    // 不再依赖是否先点击过其他菜单项（折叠态才导致菜单项随机缺失）。
    this.openAllAccordions();
  }

  openAllAccordions() {
    this.accordionHeaders.forEach(header => {
      const groupKey = header.dataset.accordion;
      const body = this.sidebar.querySelector(`.accordion-body[data-accordion-body="${groupKey}"]`);
      if (!body) return;
      header.classList.add('open');
      body.classList.add('open');
    });
  }

  closeDrawer() {
    this.sidebar.classList.remove('open');
    if (this.adminDrawerOverlay) {
      this.adminDrawerOverlay.classList.remove('open');
      this.adminDrawerOverlay.setAttribute('aria-hidden', 'true');
    }
    if (this.adminMenuBtn) this.adminMenuBtn.setAttribute('aria-expanded', 'false');
  }

  bindSnackbarEvents() {
    if (this.snackbarAction) {
      this.snackbarAction.addEventListener('click', () => this.hideSnackbar());
    }
  }

  handleHashChange() {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    // 权限检查
    if (this.isDevAdminOnlySection(hash) && this.userRole !== UserRoles.DEV_ADMIN) {
      this.switchSection('dashboard');
      return;
    }
    this.switchSection(hash, false);
  }

  switchSection(section, updateHash = true) {
    if (section === this.currentSection && this.adminContent.children.length > 0) return;

    if (this.currentSection === 'theme-ui' && section !== 'theme-ui' && this.themeSaved) {
      themeService.revertPreviewToSaved(this.themeSaved);
    }

    this.currentSection = section;

    // 更新 hash
    if (updateHash) {
      window.location.hash = section;
    }

    // 更新侧边栏高亮
    this.navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.section === section);
    });

    // 切换时自动展开所属 Accordion 分组（移动端折叠态下确保可见）
    this.accordionHeaders.forEach(header => {
      const groupKey = header.dataset.accordion;
      const body = this.sidebar.querySelector(`.accordion-body[data-accordion-body="${groupKey}"]`);
      if (!body) return;
      const containsActive = body.querySelector(`.nav-item[data-section="${section}"]`);
      if (containsActive) {
        body.classList.add('open');
        header.classList.add('open');
      }
    });

    // 更新标题
    const titles = {
      'dashboard': '总览',
      'password-reset': '忘记密码审核',
      'reports': '举报审核',
      'account-penalty': '处罚与解封',
      'penalty-history': '处罚历史',
      'audit-logs': '审计日志',
      'admin-roles': '管理员管理',
      'sensitive-l4': '敏感词 L4',
      'announcements': '公告管理',
      'theme-ui': 'UI 颜色系统'
    };
    if (this.topbarTitle) {
      this.topbarTitle.textContent = titles[section] || '管理后台';
    }

    // 渲染内容
    this.renderSection(section);

    // 切换功能后收起移动端 Drawer，避免挡住内容
    this.closeDrawer();
  }

  renderSection(section) {
    this.adminContent.innerHTML = '';

    switch (section) {
      case 'dashboard':
        this.renderDashboard();
        break;
      case 'password-reset':
        this.renderPasswordReset();
        break;
      case 'reports':
        this.renderReports();
        break;
      case 'account-penalty':
        this.renderAccountPenalty();
        break;
      case 'penalty-history':
        this.renderPenaltyHistory();
        break;
      case 'audit-logs':
        this.renderAuditLogs();
        break;
      case 'admin-roles':
        this.renderAdminRoles();
        break;
      case 'sensitive-l4':
        this.renderSensitiveL4();
        break;
      case 'announcements':
        this.renderAnnouncements();
        break;
      case 'theme-ui':
        this.renderThemeUi();
        break;
      default:
        this.renderDashboard();
    }
  }

  // ==================== Dashboard ====================

  async renderDashboard() {
    this.adminContent.innerHTML = this.renderLoading('正在加载数据...');

    try {
      const response = await adminService.getDashboardStats();

      if (!response.success) {
        this.adminContent.innerHTML = this.renderErrorState(response.error || '加载失败', () => this.renderDashboard());
        return;
      }

      const stats = response.data || {};
      const pendingResets = stats.pending_password_resets || 0;
      const pendingReports = stats.pending_reports || 0;
      const totalUsers = stats.total_users || 0;
      const totalPosts = stats.total_posts || 0;

      const html = `
        <div class="admin-dashboard">
          <h3 style="font-size: 1.25rem; font-weight: 500; margin-bottom: 1.25rem; color: var(--md-sys-color-on-surface);">数据概览</h3>
          <div class="stats-cards-grid" style="
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
          ">
            ${this.renderStatCard('待审核忘记密码', pendingResets, 'password-reset', 'var(--md-sys-color-warning)', `
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
            `)}
            ${this.renderStatCard('待处理举报', pendingReports, 'reports', 'var(--md-sys-color-error)', `
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            `)}
            ${this.renderStatCard('总用户数', totalUsers, null, 'var(--md-sys-color-primary)', `
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            `)}
            ${this.renderStatCard('总帖子数', totalPosts, null, 'var(--md-sys-color-tertiary)', `
              <path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z"/>
            `)}
          </div>
        </div>
      `;

      this.adminContent.innerHTML = html;

      // 绑定卡片点击事件
      this.adminContent.querySelectorAll('.stat-card[data-section]').forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
          const section = card.dataset.section;
          this.switchSection(section);
        });
      });

    } catch (error) {
      console.error('[AdminPage] Dashboard 加载失败:', error);
      this.adminContent.innerHTML = this.renderErrorState('加载失败，请稍后重试', () => this.renderDashboard());
    }
  }

  renderStatCard(label, value, section, color, iconPath) {
    return `
      <div class="stat-card" ${section ? `data-section="${section}"` : ''} style="
        background-color: var(--md-sys-color-surface);
        border-radius: 1rem;
        padding: 1.5rem;
        border: 1px solid var(--md-sys-color-outline-variant);
        transition: all 0.2s ease;
        ${section ? 'cursor: pointer;' : ''}
      " onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.08)'; this.style.transform='translateY(-2px)';"
         onmouseout="this.style.boxShadow='none'; this.style.transform='translateY(0)';">
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem;">
          <div style="
            width: 48px;
            height: 48px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            background-color: ${color};
          ">
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              ${iconPath}
            </svg>
          </div>
        </div>
        <div style="
          font-size: 2rem;
          font-weight: 700;
          color: var(--md-sys-color-on-surface);
          line-height: 1.2;
          margin-bottom: 0.25rem;
        ">${value}</div>
        <div style="
          font-size: 0.875rem;
          color: var(--md-sys-color-on-surface-variant);
        ">${label}</div>
      </div>
    `;
  }

  // ==================== 忘记密码审核 ====================

  async renderPasswordReset() {
    this.adminContent.innerHTML = `
      <div class="admin-section">
        <div class="tabs" style="
          display: flex;
          gap: 0.25rem;
          margin-bottom: 1.5rem;
          background-color: var(--md-sys-color-surface-container);
          padding: 0.25rem;
          border-radius: 0.75rem;
          max-width: 480px;
        ">
          <button class="tab-btn ${this.passwordResetTab === 'pending' ? 'active' : ''}" data-tab="pending" style="
            flex: 1;
            padding: 0.75rem;
            background: none;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 0.875rem;
            font-family: inherit;
            color: ${this.passwordResetTab === 'pending' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)'};
            background-color: ${this.passwordResetTab === 'pending' ? 'var(--md-sys-color-primary)' : 'transparent'};
            transition: all 0.2s ease;
            font-weight: 500;
          ">待处理</button>
          <button class="tab-btn ${this.passwordResetTab === 'approved' ? 'active' : ''}" data-tab="approved" style="
            flex: 1;
            padding: 0.75rem;
            background: none;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 0.875rem;
            font-family: inherit;
            color: ${this.passwordResetTab === 'approved' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)'};
            background-color: ${this.passwordResetTab === 'approved' ? 'var(--md-sys-color-primary)' : 'transparent'};
            transition: all 0.2s ease;
            font-weight: 500;
          ">已通过</button>
          <button class="tab-btn ${this.passwordResetTab === 'rejected' ? 'active' : ''}" data-tab="rejected" style="
            flex: 1;
            padding: 0.75rem;
            background: none;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 0.875rem;
            font-family: inherit;
            color: ${this.passwordResetTab === 'rejected' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)'};
            background-color: ${this.passwordResetTab === 'rejected' ? 'var(--md-sys-color-primary)' : 'transparent'};
            transition: all 0.2s ease;
            font-weight: 500;
          ">已驳回</button>
        </div>
        <div class="password-reset-list">
          ${this.renderLoading('正在加载申请列表...')}
        </div>
      </div>
    `;

    // 绑定 tab 事件
    this.adminContent.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab === this.passwordResetTab) return;
        this.passwordResetTab = tab;
        this.renderPasswordReset();
      });
    });

    await this.loadPasswordResetList();
  }

  async loadPasswordResetList() {
    const listContainer = this.adminContent.querySelector('.password-reset-list');
    if (!listContainer) return;

    listContainer.innerHTML = this.renderLoading('正在加载申请列表...');

    try {
      const response = await adminService.getPasswordResets(this.passwordResetTab, 1, 50);

      if (!response.success) {
        listContainer.innerHTML = this.renderErrorState(response.error || '加载失败', () => this.loadPasswordResetList());
        return;
      }

      const items = response.data || [];

      if (items.length === 0) {
        listContainer.innerHTML = this.renderEmptyState('暂无申请记录');
        return;
      }

      let html = '<div class="admin-list" style="display: flex; flex-direction: column; gap: 0.75rem;">';

      items.forEach(item => {
        html += this.renderPasswordResetItem(item);
      });

      html += '</div>';
      listContainer.innerHTML = html;

      // 绑定按钮事件
      listContainer.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', () => this.showApprovePasswordDialog(btn.dataset.id, btn.dataset.uid));
      });

      listContainer.querySelectorAll('.reject-btn').forEach(btn => {
        btn.addEventListener('click', () => this.showRejectPasswordDialog(btn.dataset.id));
      });

    } catch (error) {
      console.error('[AdminPage] 密码重置列表加载失败:', error);
      listContainer.innerHTML = this.renderErrorState('加载失败，请稍后重试', () => this.loadPasswordResetList());
    }
  }

  renderPasswordResetItem(item) {
    const statusLabel = {
      pending: { text: '待处理', class: 'status-pending' },
      approved: { text: '已通过', class: 'status-approved' },
      rejected: { text: '已驳回', class: 'status-rejected' }
    };
    const status = statusLabel[item.status] || statusLabel.pending;

    const statusColors = {
      pending: { bg: 'var(--md-sys-color-warning-container)', color: 'var(--md-sys-color-on-warning-container)' },
      approved: { bg: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' },
      rejected: { bg: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }
    };
    const colors = statusColors[item.status] || statusColors.pending;

    const showActions = this.passwordResetTab === 'pending';

    return `
      <div class="admin-list-item" style="
        background-color: var(--md-sys-color-surface);
        border-radius: 0.875rem;
        padding: 1.25rem;
        border: 1px solid var(--md-sys-color-outline-variant);
      ">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <span style="font-weight: 500; color: var(--md-sys-color-on-surface); font-size: 1rem;">
              ${this.escapeHtml(item.full_name || item.nickname || '未知用户')}
            </span>
            <span style="
              font-size: 0.75rem;
              padding: 0.125rem 0.5rem;
              border-radius: 999px;
              background-color: ${colors.bg};
              color: ${colors.color};
              font-weight: 500;
            ">${status.text}</span>
          </div>
          <span style="font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant); white-space: nowrap;">
            ${this.formatTime(item.created_at)}
          </span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.5rem 1.5rem; margin-bottom: 0.75rem; font-size: 0.875rem;">
          <div><span style="color: var(--md-sys-color-on-surface-variant);">学号：</span><span style="color: var(--md-sys-color-on-surface);">${this.escapeHtml(item.student_id || '')}</span></div>
          <div><span style="color: var(--md-sys-color-on-surface-variant);">校区：</span><span style="color: var(--md-sys-color-on-surface);">${this.escapeHtml(item.branch || '未设置')}</span></div>
          ${item.grade ? `<div><span style="color: var(--md-sys-color-on-surface-variant);">年级：</span><span style="color: var(--md-sys-color-on-surface);">${this.escapeHtml(item.grade)}</span></div>` : ''}
        </div>
        ${item.reason ? `
          <div style="font-size: 0.875rem; margin-bottom: 1rem;">
            <span style="color: var(--md-sys-color-on-surface-variant);">申请原因：</span>
            <span style="color: var(--md-sys-color-on-surface);">${this.escapeHtml(item.reason)}</span>
          </div>
        ` : ''}
        ${item.handle_note ? `
          <div style="font-size: 0.875rem; margin-bottom: 1rem;">
            <span style="color: var(--md-sys-color-on-surface-variant);">驳回原因：</span>
            <span style="color: var(--md-sys-color-on-surface);">${this.escapeHtml(item.handle_note)}</span>
          </div>
        ` : ''}
        ${showActions ? `
          <div class="admin-item-actions" style="display: flex; gap: 0.75rem; justify-content: flex-end;">
            <button class="reject-btn btn-danger-outline" data-id="${item.id}" style="
              padding: 0.5rem 1.25rem;
              font-size: 0.875rem;
              font-weight: 500;
              font-family: inherit;
              border: 1px solid var(--md-sys-color-error);
              background: none;
              color: var(--md-sys-color-error);
              border-radius: 0.5rem;
              cursor: pointer;
              transition: all 0.2s ease;
            " onmouseover="this.style.backgroundColor='var(--md-sys-color-error-container)';"
              onmouseout="this.style.backgroundColor='transparent';">否定</button>
            <button class="approve-btn btn-primary" data-id="${item.id}" data-uid="${item.student_id || ''}" style="
              padding: 0.5rem 1.25rem;
              font-size: 0.875rem;
              font-weight: 500;
              font-family: inherit;
              background-color: var(--md-sys-color-primary);
              color: var(--md-sys-color-on-primary);
              border: none;
              border-radius: 0.5rem;
              cursor: pointer;
              transition: all 0.2s ease;
            " onmouseover="this.style.backgroundColor='var(--md-sys-color-primary-dark)';"
              onmouseout="this.style.backgroundColor='var(--md-sys-color-primary)';">允许</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  showApprovePasswordDialog(requestId, uid) {
    this.showDialog({
      title: '批准密码重置',
      content: `
        <p style="margin-bottom: 1rem; color: var(--md-sys-color-on-surface-variant); font-size: 0.875rem;">
          确认批准 UID <strong style="color: var(--md-sys-color-on-surface);">${this.escapeHtml(uid)}</strong> 的密码重置申请。
        </p>
        <p style="margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: 0.875rem;">
          批准后用户将获得 7 天有效资格，自行设置新密码。管理员无法查看或设置用户密码。
        </p>
      `,
      confirmText: '确认批准',
      confirmType: 'primary',
      onConfirm: async () => {
        const response = await adminService.approvePasswordReset(requestId);
        if (response.success) {
          this.showSnackbar('密码重置已批准，用户需在 7 天内自行设置新密码');
          this.loadPasswordResetList();
          this.loadUnreadNotifications();
          return true;
        } else {
          this.showSnackbar(response.error || '操作失败');
          return false;
        }
      }
    });
  }

  showRejectPasswordDialog(requestId) {
    this.showDialog({
      title: '驳回密码重置申请',
      content: `
        <p style="margin-bottom: 1rem; color: var(--md-sys-color-on-surface-variant); font-size: 0.875rem;">
          请填写驳回原因
        </p>
        <div class="form-group">
          <label style="display: block; font-size: 0.875rem; color: var(--md-sys-color-on-surface-variant); margin-bottom: 0.5rem;">驳回原因</label>
          <textarea id="rejectReasonInput" rows="3" placeholder="请输入驳回原因" style="
            width: 100%;
            padding: 0.75rem 1rem;
            border: 1px solid var(--md-sys-color-outline);
            border-radius: 0.5rem;
            font-size: 1rem;
            font-family: inherit;
            background-color: var(--md-sys-color-surface);
            color: var(--md-sys-color-on-surface);
            box-sizing: border-box;
            resize: vertical;
          "></textarea>
        </div>
      `,
      confirmText: '确认驳回',
      confirmType: 'danger',
      onConfirm: async (dialog) => {
        const input = dialog.querySelector('#rejectReasonInput');
        const reason = input.value.trim();

        if (!reason) {
          this.showSnackbar('请填写驳回原因');
          return false;
        }

        const response = await adminService.rejectPasswordReset(requestId, reason);
        if (response.success) {
          this.showSnackbar('已驳回申请');
          this.loadPasswordResetList();
          this.loadUnreadNotifications();
          return true;
        } else {
          this.showSnackbar(response.error || '操作失败');
          return false;
        }
      }
    });
  }

  // ==================== 举报审核 ====================

  async renderReports() {
    this.adminContent.innerHTML = `
      <div class="admin-section">
        <div class="tabs" style="
          display: flex;
          gap: 0.25rem;
          margin-bottom: 1.5rem;
          background-color: var(--md-sys-color-surface-container);
          padding: 0.25rem;
          border-radius: 0.75rem;
          max-width: 480px;
        ">
          <button class="report-tab-btn ${this.reportsTab === 'pending' ? 'active' : ''}" data-tab="pending" style="
            flex: 1;
            padding: 0.75rem;
            background: none;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 0.875rem;
            font-family: inherit;
            color: ${this.reportsTab === 'pending' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)'};
            background-color: ${this.reportsTab === 'pending' ? 'var(--md-sys-color-primary)' : 'transparent'};
            transition: all 0.2s ease;
            font-weight: 500;
          ">待处理</button>
          <button class="report-tab-btn ${this.reportsTab === 'handled' ? 'active' : ''}" data-tab="handled" style="
            flex: 1;
            padding: 0.75rem;
            background: none;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 0.875rem;
            font-family: inherit;
            color: ${this.reportsTab === 'handled' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)'};
            background-color: ${this.reportsTab === 'handled' ? 'var(--md-sys-color-primary)' : 'transparent'};
            transition: all 0.2s ease;
            font-weight: 500;
          ">已处理</button>
          <button class="report-tab-btn ${this.reportsTab === 'rejected' ? 'active' : ''}" data-tab="rejected" style="
            flex: 1;
            padding: 0.75rem;
            background: none;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 0.875rem;
            font-family: inherit;
            color: ${this.reportsTab === 'rejected' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)'};
            background-color: ${this.reportsTab === 'rejected' ? 'var(--md-sys-color-primary)' : 'transparent'};
            transition: all 0.2s ease;
            font-weight: 500;
          ">已驳回</button>
        </div>
        <div class="reports-list">
          ${this.renderLoading('正在加载举报列表...')}
        </div>
      </div>
    `;

    this.adminContent.querySelectorAll('.report-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab === this.reportsTab) return;
        this.reportsTab = tab;
        this.renderReports();
      });
    });

    await this.loadReportsList();
  }

  async loadReportsList() {
    const listContainer = this.adminContent.querySelector('.reports-list');
    if (!listContainer) return;

    listContainer.innerHTML = this.renderLoading('正在加载举报列表...');

    try {
      const response = await adminService.getReports(this.reportsTab, 1, 50);

      if (!response.success) {
        listContainer.innerHTML = this.renderErrorState(response.error || '加载失败', () => this.loadReportsList());
        return;
      }

      const items = response.data || [];

      if (items.length === 0) {
        listContainer.innerHTML = this.renderEmptyState('暂无举报记录');
        return;
      }

      let html = '<div class="admin-list" style="display: flex; flex-direction: column; gap: 0.75rem;">';
      items.forEach(item => {
        html += this.renderReportItem(item);
      });
      html += '</div>';
      listContainer.innerHTML = html;

      listContainer.querySelectorAll('.handle-report-btn').forEach(btn => {
        btn.addEventListener('click', () => this.showHandleReportDialog(btn.dataset.id));
      });

      listContainer.querySelectorAll('.reject-report-btn').forEach(btn => {
        btn.addEventListener('click', () => this.showRejectReportDialog(btn.dataset.id));
      });

      listContainer.querySelectorAll('.locate-report-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const targetId = btn.dataset.targetId;
          const targetType = btn.dataset.targetType;
          if (!targetId) {
            this.showSnackbar('被举报对象ID缺失');
            return;
          }
          if (targetType === 'post') {
            // 直接使用举报记录中的真实被举报对象 ID 打开对应帖子详情，不做标题/关键词重搜
            window.location.href = `post-detail.html?id=${encodeURIComponent(targetId)}&from=admin-reports`;
          } else {
            this.showSnackbar('当前仅支持定位帖子类型的举报');
          }
        });
      });

    } catch (error) {
      console.error('[AdminPage] 举报列表加载失败:', error);
      listContainer.innerHTML = this.renderErrorState('加载失败，请稍后重试', () => this.loadReportsList());
    }
  }

  renderReportItem(item) {
    const statusColors = {
      pending: { bg: 'var(--md-sys-color-warning-container)', color: 'var(--md-sys-color-on-warning-container)', text: '待处理' },
      handled: { bg: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)', text: '已处理' },
      rejected: { bg: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)', text: '已驳回' }
    };
    const status = statusColors[item.status] || statusColors.pending;
    const showActions = this.reportsTab === 'pending';

    const typeLabel = REPORT_TYPE_LABELS[item.report_type] || item.report_type || '其他';

    return `
      <div class="admin-list-item" style="
        background-color: var(--md-sys-color-surface);
        border-radius: 0.875rem;
        padding: 1.25rem;
        border: 1px solid var(--md-sys-color-outline-variant);
      ">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <span style="font-weight: 500; color: var(--md-sys-color-on-surface); font-size: 1rem;">
              举报对象：${this.escapeHtml(item.target_type === 'post' ? '帖子' : item.target_type === 'comment' ? '评论' : this.escapeHtml(item.target_type || '未知'))}
            </span>
            <span style="
              font-size: 0.75rem;
              padding: 0.125rem 0.5rem;
              border-radius: 999px;
              background-color: ${status.bg};
              color: ${status.color};
              font-weight: 500;
            ">${status.text}</span>
            <span style="
              font-size: 0.75rem;
              padding: 0.125rem 0.5rem;
              border-radius: 999px;
              background-color: var(--md-sys-color-secondary-container);
              color: var(--md-sys-color-on-secondary-container);
              font-weight: 500;
            ">${this.escapeHtml(typeLabel)}</span>
          </div>
          <span style="font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant); white-space: nowrap;">
            ${this.formatTime(item.created_at)}
          </span>
        </div>
        <div style="font-size: 0.875rem; margin-bottom: 0.5rem;">
          <span style="color: var(--md-sys-color-on-surface-variant);">举报类型：</span>
          <span style="color: var(--md-sys-color-on-surface);">${this.escapeHtml(typeLabel)}</span>
        </div>
        <div style="font-size: 0.875rem; margin-bottom: 0.5rem;">
          <span style="color: var(--md-sys-color-on-surface-variant);">举报说明：</span>
          <span style="color: var(--md-sys-color-on-surface);">${this.escapeHtml(item.description || '无')}</span>
        </div>
        <div style="font-size: 0.875rem; margin-bottom: 0.75rem;">
          <span style="color: var(--md-sys-color-on-surface-variant);">举报人：</span>
          <span style="color: var(--md-sys-color-on-surface);">${this.escapeHtml(item.reporter_name || item.reporter_nickname || '匿名')}</span>
        </div>
        ${item.handle_result ? `
          <div style="font-size: 0.875rem; margin-bottom: 0.75rem;">
            <span style="color: var(--md-sys-color-on-surface-variant);">处理结果：</span>
            <span style="color: var(--md-sys-color-on-surface);">${this.escapeHtml(item.handle_result)}</span>
          </div>
        ` : ''}
        <div class="admin-item-actions" style="display: flex; gap: 0.75rem; justify-content: flex-end;">
          <button class="locate-report-btn" data-target-id="${this.escapeHtml(item.target_id || '')}" data-target-type="${item.target_type || ''}" style="
            padding: 0.5rem 1.25rem;
            font-size: 0.875rem;
            font-weight: 500;
            font-family: inherit;
            border: 1px solid var(--md-sys-color-outline);
            background: none;
            color: var(--md-sys-color-primary);
            border-radius: 0.5rem;
            cursor: pointer;
            transition: all 0.2s ease;
          " onmouseover="this.style.backgroundColor='var(--md-sys-color-primary-container)';"
            onmouseout="this.style.backgroundColor='transparent';">定位举报</button>
          ${showActions ? `
            <button class="reject-report-btn btn-danger-outline" data-id="${item.id}" style="
              padding: 0.5rem 1.25rem;
              font-size: 0.875rem;
              font-weight: 500;
              font-family: inherit;
              border: 1px solid var(--md-sys-color-error);
              background: none;
              color: var(--md-sys-color-error);
              border-radius: 0.5rem;
              cursor: pointer;
              transition: all 0.2s ease;
            " onmouseover="this.style.backgroundColor='var(--md-sys-color-error-container)';"
              onmouseout="this.style.backgroundColor='transparent';">驳回</button>
            <button class="handle-report-btn btn-primary" data-id="${item.id}" style="
              padding: 0.5rem 1.25rem;
              font-size: 0.875rem;
              font-weight: 500;
              font-family: inherit;
              background-color: var(--md-sys-color-primary);
              color: var(--md-sys-color-on-primary);
              border: none;
              border-radius: 0.5rem;
              cursor: pointer;
              transition: all 0.2s ease;
            " onmouseover="this.style.backgroundColor='var(--md-sys-color-primary-dark)';"
              onmouseout="this.style.backgroundColor='var(--md-sys-color-primary)';">处理</button>
          ` : ''}
        </div>
      </div>
    `;
  }

  showHandleReportDialog(reportId) {
    this.showDialog({
      title: '处理举报',
      content: `
        <p style="margin-bottom: 1rem; color: var(--md-sys-color-on-surface-variant); font-size: 0.875rem;">
          请填写处理结果
        </p>
        <div class="form-group">
          <label style="display: block; font-size: 0.875rem; color: var(--md-sys-color-on-surface-variant); margin-bottom: 0.5rem;">处理结果</label>
          <textarea id="handleResultInput" rows="3" placeholder="请输入处理结果" style="
            width: 100%;
            padding: 0.75rem 1rem;
            border: 1px solid var(--md-sys-color-outline);
            border-radius: 0.5rem;
            font-size: 1rem;
            font-family: inherit;
            background-color: var(--md-sys-color-surface);
            color: var(--md-sys-color-on-surface);
            box-sizing: border-box;
            resize: vertical;
          "></textarea>
        </div>
      `,
      confirmText: '确认处理',
      confirmType: 'primary',
      onConfirm: async (dialog) => {
        const input = dialog.querySelector('#handleResultInput');
        const result = input.value.trim();

        if (!result) {
          this.showSnackbar('请填写处理结果');
          return false;
        }

        const response = await adminService.handleReport(reportId, 'handled', result);
        if (response.success) {
          this.showSnackbar('举报已处理');
          this.loadReportsList();
          this.loadUnreadNotifications();
          return true;
        } else {
          this.showSnackbar(response.error || '操作失败');
          return false;
        }
      }
    });
  }

  showRejectReportDialog(reportId) {
    this.showDialog({
      title: '驳回举报',
      content: `
        <p style="margin-bottom: 1rem; color: var(--md-sys-color-on-surface-variant); font-size: 0.875rem;">
          请填写驳回原因
        </p>
        <div class="form-group">
          <label style="display: block; font-size: 0.875rem; color: var(--md-sys-color-on-surface-variant); margin-bottom: 0.5rem;">驳回原因</label>
          <textarea id="rejectReportInput" rows="3" placeholder="请输入驳回原因" style="
            width: 100%;
            padding: 0.75rem 1rem;
            border: 1px solid var(--md-sys-color-outline);
            border-radius: 0.5rem;
            font-size: 1rem;
            font-family: inherit;
            background-color: var(--md-sys-color-surface);
            color: var(--md-sys-color-on-surface);
            box-sizing: border-box;
            resize: vertical;
          "></textarea>
        </div>
      `,
      confirmText: '确认驳回',
      confirmType: 'danger',
      onConfirm: async (dialog) => {
        const input = dialog.querySelector('#rejectReportInput');
        const reason = input.value.trim();

        if (!reason) {
          this.showSnackbar('请填写驳回原因');
          return false;
        }

        const response = await adminService.handleReport(reportId, 'rejected', reason);
        if (response.success) {
          this.showSnackbar('举报已驳回');
          this.loadReportsList();
          this.loadUnreadNotifications();
          return true;
        } else {
          this.showSnackbar(response.error || '操作失败');
          return false;
        }
      }
    });
  }

  // ==================== 账户处罚 ====================

  fieldStyle() {
    return `width:100%;padding:0.75rem 1rem;border:1px solid var(--md-sys-color-outline);border-radius:0.5rem;font-size:1rem;font-family:inherit;background-color:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);box-sizing:border-box;`;
  }

  renderAccountPenalty() {
    const isDev = this.userRole === UserRoles.DEV_ADMIN;
    this.adminContent.innerHTML = `
      <div class="admin-section" style="max-width:720px;">
        <h3 style="margin:0 0 1rem;font-size:1.25rem;font-weight:500;">处罚账户</h3>
        <p style="margin:0 0 1rem;font-size:0.875rem;color:var(--md-sys-color-on-surface-variant);">权限由服务端校验。请先加载帖子并至少勾选一篇作为证据。结束时间由服务器按叠加规则计算。</p>
        <div class="form-group" style="margin-bottom:0.75rem;">
          <label style="display:block;font-size:0.875rem;margin-bottom:0.35rem;">目标 UID</label>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <input id="penaltyTargetUid" maxlength="8" placeholder="8位数字UID" style="${this.fieldStyle()};flex:1;min-width:160px;">
            <button type="button" class="btn-secondary" id="penaltyLoadPostsBtn">加载帖子</button>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:0.75rem;">
          <label style="display:block;font-size:0.875rem;margin-bottom:0.35rem;">处罚类型</label>
          <select id="penaltyType" style="${this.fieldStyle()}">
            <option value="temporary">临时封禁</option>
            ${isDev ? '<option value="permanent">永久封禁</option>' : ''}
          </select>
        </div>
        <div class="form-group" id="penaltyDurationWrap" style="margin-bottom:0.75rem;">
          <label style="display:block;font-size:0.875rem;margin-bottom:0.35rem;">临时封禁时长</label>
          <select id="penaltyDuration" style="${this.fieldStyle()}">
            <option value="1h">1 小时</option>
            <option value="3h">3 小时</option>
            <option value="1d">1 天</option>
            <option value="3d">3 天</option>
            <option value="7d">7 天</option>
            <option value="1m">1 个月</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0.75rem;">
          <label style="display:block;font-size:0.875rem;margin-bottom:0.35rem;">处罚理由</label>
          <textarea id="penaltyReason" rows="3" placeholder="必填" style="${this.fieldStyle()};resize:vertical;"></textarea>
        </div>
        <div id="penaltyPostList" style="margin-bottom:1rem;font-size:0.875rem;color:var(--md-sys-color-on-surface-variant);">请先加载该 UID 的帖子。</div>
        <button type="button" class="btn-primary" id="penaltySubmitBtn">确认并处罚</button>

        <h3 style="margin:2rem 0 1rem;font-size:1.25rem;font-weight:500;">解除临时封禁</h3>
        <div class="form-group" style="margin-bottom:0.75rem;">
          <input id="liftTempUid" maxlength="8" placeholder="目标 UID" style="${this.fieldStyle()};margin-bottom:0.5rem;">
          <textarea id="liftTempReason" rows="2" placeholder="解封理由（必填）" style="${this.fieldStyle()};resize:vertical;margin-bottom:0.5rem;"></textarea>
          <button type="button" class="btn-secondary" id="liftTempBtn">解除临时封禁</button>
        </div>
        ${isDev ? `
        <h3 style="margin:2rem 0 1rem;font-size:1.25rem;font-weight:500;color:var(--md-sys-color-error);">解除永久封禁</h3>
        <div class="form-group">
          <input id="liftPermUid" maxlength="8" placeholder="目标 UID" style="${this.fieldStyle()};margin-bottom:0.5rem;">
          <textarea id="liftPermReason" rows="2" placeholder="恢复理由（必填）" style="${this.fieldStyle()};resize:vertical;margin-bottom:0.5rem;"></textarea>
          <button type="button" class="btn-danger" id="liftPermBtn" style="background:var(--md-sys-color-error);color:var(--md-sys-color-on-error);border:none;padding:0.625rem 1.25rem;border-radius:0.5rem;cursor:pointer;">解除永久封禁</button>
        </div>` : ''}
      </div>
    `;
    this.bindAccountPenaltyEvents();
  }

  bindAccountPenaltyEvents() {
    const typeSel = document.getElementById('penaltyType');
    const durWrap = document.getElementById('penaltyDurationWrap');
    if (typeSel && durWrap) {
      typeSel.addEventListener('change', () => {
        durWrap.style.display = typeSel.value === 'permanent' ? 'none' : '';
      });
    }
    const loadBtn = document.getElementById('penaltyLoadPostsBtn');
    if (loadBtn) loadBtn.addEventListener('click', () => this.loadPenaltyPosts());
    const submitBtn = document.getElementById('penaltySubmitBtn');
    if (submitBtn) submitBtn.addEventListener('click', () => this.confirmApplyPenalty());
    const liftTempBtn = document.getElementById('liftTempBtn');
    if (liftTempBtn) liftTempBtn.addEventListener('click', () => this.confirmLiftTemporary());
    const liftPermBtn = document.getElementById('liftPermBtn');
    if (liftPermBtn) liftPermBtn.addEventListener('click', () => this.confirmLiftPermanent());
  }

  async loadPenaltyPosts() {
    const uid = (document.getElementById('penaltyTargetUid')?.value || '').trim();
    const box = document.getElementById('penaltyPostList');
    if (!/^\d{8}$/.test(uid)) {
      this.showSnackbar('请输入有效的8位UID');
      return;
    }
    box.textContent = '加载中...';
    const response = await adminService.listUserPosts(uid);
    if (!response.success) {
      box.textContent = response.error || '加载失败';
      return;
    }
    const rows = response.data || [];
    if (rows.length === 0) {
      box.textContent = '该 UID 没有可作为证据的帖子。';
      return;
    }
    box.innerHTML = rows.map(p => `
      <label style="display:flex;gap:0.5rem;align-items:flex-start;padding:0.5rem 0;border-bottom:1px solid var(--md-sys-color-outline-variant);">
        <input type="checkbox" class="penalty-post-cb" value="${this.escapeHtml(p.id || '')}">
        <span>
          <strong>${this.escapeHtml(p.title || '无标题')}</strong>
          <span style="color:var(--md-sys-color-on-surface-variant);"> · ${this.formatTime(p.created_at)}${p.is_deleted ? ' · 已删除' : ''}</span>
        </span>
      </label>
    `).join('');
  }

  selectedPenaltyPostIds() {
    return Array.from(this.adminContent.querySelectorAll('.penalty-post-cb:checked')).map(el => el.value).filter(Boolean);
  }

  durationLabel(code) {
    return { '1h': '1小时', '3h': '3小时', '1d': '1天', '3d': '3天', '7d': '7天', '1m': '1个月' }[code] || code;
  }

  confirmApplyPenalty() {
    const uid = (document.getElementById('penaltyTargetUid')?.value || '').trim();
    const type = document.getElementById('penaltyType')?.value;
    const duration = document.getElementById('penaltyDuration')?.value || null;
    const reason = (document.getElementById('penaltyReason')?.value || '').trim();
    const postIds = this.selectedPenaltyPostIds();
    if (!/^\d{8}$/.test(uid)) {
      this.showSnackbar('请输入有效的8位UID');
      return;
    }
    if (!reason) {
      this.showSnackbar('请填写处罚理由');
      return;
    }
    if (postIds.length < 1) {
      this.showSnackbar('请至少勾选一篇违规帖子');
      return;
    }
    const isPermanent = type === 'permanent';
    const durationText = isPermanent ? '永久' : this.durationLabel(duration);
    this.showDialog({
      title: isPermanent ? '确认永久封禁' : '确认处罚',
      confirmText: isPermanent ? '确认永久封禁' : '确认处罚',
      confirmType: isPermanent ? 'danger' : 'primary',
      content: `
        ${isPermanent ? '<p style="color:var(--md-sys-color-error);font-weight:500;margin:0 0 0.75rem;">高风险操作：永久封禁无法被普通管理员解除。</p>' : ''}
        <p style="margin:0 0 0.5rem;font-size:0.875rem;">目标 UID：<strong>${this.escapeHtml(uid)}</strong></p>
        <p style="margin:0 0 0.5rem;font-size:0.875rem;">类型：${isPermanent ? '永久封禁' : '临时封禁'}</p>
        <p style="margin:0 0 0.5rem;font-size:0.875rem;">时长：${this.escapeHtml(durationText)}${isPermanent ? '' : '（若目标仍在有效临时封禁中，服务器将从现有到期时间叠加）'}</p>
        <p style="margin:0 0 0.5rem;font-size:0.875rem;">违规帖子：${postIds.length} 篇</p>
        <p style="margin:0;font-size:0.875rem;">理由：${this.escapeHtml(reason)}</p>
      `,
      onConfirm: async () => {
        const response = await adminService.applyPenalty(
          uid,
          type,
          isPermanent ? null : duration,
          reason,
          postIds
        );
        if (response.success) {
          this.showSnackbar('处罚已执行');
          this.penaltyHistoryPage = 1;
          return true;
        }
        this.showSnackbar(response.error || '处罚失败');
        return false;
      }
    });
  }

  confirmLiftTemporary() {
    const uid = (document.getElementById('liftTempUid')?.value || '').trim();
    const reason = (document.getElementById('liftTempReason')?.value || '').trim();
    if (!/^\d{8}$/.test(uid) || !reason) {
      this.showSnackbar('请填写目标 UID 和解封理由');
      return;
    }
    this.showDialog({
      title: '确认解除临时封禁',
      confirmText: '确认解封',
      content: `<p style="font-size:0.875rem;margin:0;">解除 UID <strong>${this.escapeHtml(uid)}</strong> 的临时封禁。</p>`,
      onConfirm: async () => {
        const response = await adminService.liftTemporaryBan(uid, reason);
        if (response.success) {
          this.showSnackbar('已解除临时封禁');
          return true;
        }
        this.showSnackbar(response.error || '解封失败');
        return false;
      }
    });
  }

  confirmLiftPermanent() {
    if (this.userRole !== UserRoles.DEV_ADMIN) return;
    const uid = (document.getElementById('liftPermUid')?.value || '').trim();
    const reason = (document.getElementById('liftPermReason')?.value || '').trim();
    if (!/^\d{8}$/.test(uid) || !reason) {
      this.showSnackbar('请填写目标 UID 和恢复理由');
      return;
    }
    this.showDialog({
      title: '确认解除永久封禁',
      confirmText: '确认恢复',
      confirmType: 'danger',
      content: `<p style="color:var(--md-sys-color-error);font-size:0.875rem;margin:0;">将恢复 UID <strong>${this.escapeHtml(uid)}</strong> 的永久封禁状态。</p>`,
      onConfirm: async () => {
        const response = await adminService.liftPermanentBan(uid, reason);
        if (response.success) {
          this.showSnackbar('已解除永久封禁');
          return true;
        }
        this.showSnackbar(response.error || '恢复失败');
        return false;
      }
    });
  }

  renderPenaltyHistory() {
    this.adminContent.innerHTML = `
      <div class="admin-section">
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
          <input id="historyUid" maxlength="8" placeholder="按目标 UID 筛选（可空）" style="${this.fieldStyle()};max-width:240px;">
          <button type="button" class="btn-primary" id="historySearchBtn">查询</button>
        </div>
        <div id="penaltyHistoryList"></div>
      </div>
    `;
    document.getElementById('historySearchBtn')?.addEventListener('click', () => {
      this.penaltyHistoryPage = 1;
      this.loadPenaltyHistory();
    });
    this.loadPenaltyHistory();
  }

  async loadPenaltyHistory() {
    const box = document.getElementById('penaltyHistoryList');
    if (!box) return;
    box.innerHTML = this.renderLoading('正在加载处罚历史...');
    const uid = (document.getElementById('historyUid')?.value || '').trim() || null;
    const response = await adminService.listPenalties(uid, this.penaltyHistoryPage, 20);
    if (!response.success) {
      box.innerHTML = this.renderErrorState(response.error || '加载失败', () => this.loadPenaltyHistory());
      return;
    }
    const rows = response.data || [];
    if (rows.length === 0) {
      box.innerHTML = '<p style="color:var(--md-sys-color-on-surface-variant);">暂无处罚记录</p>';
      return;
    }
    const total = rows[0].total_count || rows.length;
    box.innerHTML = rows.map(item => `
      <div class="admin-list-item" style="padding:1rem;margin-bottom:0.75rem;background:var(--md-sys-color-surface-container);border-radius:0.75rem;">
        <div style="display:flex;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;font-size:0.875rem;">
          <strong>目标 ${this.escapeHtml(item.target_uid || '')}</strong>
          <span>${this.escapeHtml(item.penalty_type || '')} · ${this.escapeHtml(item.source || '')}</span>
        </div>
        <div style="font-size:0.8125rem;color:var(--md-sys-color-on-surface-variant);margin-top:0.35rem;">
          执行 ${this.escapeHtml(item.actor_uid || '')} (${this.escapeHtml(item.actor_role || '')})
          · 开始 ${this.formatTime(item.starts_at)}
          · 结束 ${item.ends_at ? this.formatTime(item.ends_at) : '永久/无'}
          ${item.lifted_at ? ' · 已解封 ' + this.formatTime(item.lifted_at) : ''}
        </div>
        <div style="margin-top:0.35rem;font-size:0.875rem;">${this.escapeHtml(item.reason || '')}</div>
        <button type="button" class="btn-secondary penalty-evidence-btn" data-id="${item.id}" style="margin-top:0.5rem;">查看证据</button>
      </div>
    `).join('') + `<p style="font-size:0.75rem;color:var(--md-sys-color-on-surface-variant);">第 ${this.penaltyHistoryPage} 页 · 共 ${total} 条</p>
      <div style="display:flex;gap:0.5rem;">
        <button type="button" class="btn-secondary" id="historyPrev" ${this.penaltyHistoryPage <= 1 ? 'disabled' : ''}>上一页</button>
        <button type="button" class="btn-secondary" id="historyNext" ${rows.length < 20 ? 'disabled' : ''}>下一页</button>
      </div>`;
    box.querySelectorAll('.penalty-evidence-btn').forEach(btn => {
      btn.addEventListener('click', () => this.showPenaltyPosts(btn.dataset.id));
    });
    document.getElementById('historyPrev')?.addEventListener('click', () => {
      if (this.penaltyHistoryPage > 1) {
        this.penaltyHistoryPage -= 1;
        this.loadPenaltyHistory();
      }
    });
    document.getElementById('historyNext')?.addEventListener('click', () => {
      this.penaltyHistoryPage += 1;
      this.loadPenaltyHistory();
    });
  }

  async showPenaltyPosts(penaltyId) {
    const response = await adminService.listPenaltyPosts(penaltyId);
    if (!response.success) {
      this.showSnackbar(response.error || '无法加载证据');
      return;
    }
    const rows = response.data || [];
    const body = rows.length === 0
      ? '<p>无证据帖子</p>'
      : rows.map(p => `<p style="font-size:0.875rem;margin:0 0 0.5rem;">${this.escapeHtml(p.post_id)} · ${this.escapeHtml(p.title || '无标题')}${p.was_deleted ? ' · 已删除' : ''}</p>`).join('');
    this.showDialog({
      title: '处罚证据',
      content: body,
      confirmText: '关闭',
      onConfirm: async () => true
    });
  }

  renderAuditLogs() {
    this.adminContent.innerHTML = `
      <div class="admin-section">
        <p style="font-size:0.875rem;color:var(--md-sys-color-on-surface-variant);margin:0 0 1rem;">日志范围由服务端按角色过滤，前端不做扩大。</p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
          <input id="auditTargetUid" maxlength="8" placeholder="目标 UID" style="${this.fieldStyle()};max-width:160px;">
          <input id="auditActorUid" maxlength="8" placeholder="操作者 UID" style="${this.fieldStyle()};max-width:160px;">
          <input id="auditAction" placeholder="action（可空）" style="${this.fieldStyle()};max-width:200px;">
          <button type="button" class="btn-primary" id="auditSearchBtn">查询</button>
        </div>
        <div id="auditLogList"></div>
      </div>
    `;
    document.getElementById('auditSearchBtn')?.addEventListener('click', () => {
      this.auditLogsPage = 1;
      this.loadAuditLogs();
    });
    this.loadAuditLogs();
  }

  async loadAuditLogs() {
    const box = document.getElementById('auditLogList');
    if (!box) return;
    box.innerHTML = this.renderLoading('正在加载审计日志...');
    const filters = {
      targetUid: (document.getElementById('auditTargetUid')?.value || '').trim() || null,
      actorUid: (document.getElementById('auditActorUid')?.value || '').trim() || null,
      action: (document.getElementById('auditAction')?.value || '').trim() || null
    };
    const response = await adminService.listAuditLogs(filters, this.auditLogsPage, 20);
    if (!response.success) {
      box.innerHTML = this.renderErrorState(response.error || '加载失败', () => this.loadAuditLogs());
      return;
    }
    const rows = response.data || [];
    if (rows.length === 0) {
      box.innerHTML = '<p style="color:var(--md-sys-color-on-surface-variant);">暂无审计记录</p>';
      return;
    }
    const total = rows[0].total_count || rows.length;
    box.innerHTML = rows.map(item => `
      <div class="admin-list-item" style="padding:1rem;margin-bottom:0.75rem;background:var(--md-sys-color-surface-container);border-radius:0.75rem;font-size:0.875rem;">
        <div><strong>${this.escapeHtml(item.action || '')}</strong> · ${this.formatTime(item.created_at)}</div>
        <div style="color:var(--md-sys-color-on-surface-variant);margin-top:0.25rem;">操作 ${this.escapeHtml(item.actor_uid || '')} (${this.escapeHtml(item.actor_role || '')}) → 目标 ${this.escapeHtml(item.target_uid || '')}</div>
      </div>
    `).join('') + `<p style="font-size:0.75rem;color:var(--md-sys-color-on-surface-variant);">第 ${this.auditLogsPage} 页 · 共 ${total} 条</p>
      <div style="display:flex;gap:0.5rem;">
        <button type="button" class="btn-secondary" id="auditPrev" ${this.auditLogsPage <= 1 ? 'disabled' : ''}>上一页</button>
        <button type="button" class="btn-secondary" id="auditNext" ${rows.length < 20 ? 'disabled' : ''}>下一页</button>
      </div>`;
    document.getElementById('auditPrev')?.addEventListener('click', () => {
      if (this.auditLogsPage > 1) {
        this.auditLogsPage -= 1;
        this.loadAuditLogs();
      }
    });
    document.getElementById('auditNext')?.addEventListener('click', () => {
      this.auditLogsPage += 1;
      this.loadAuditLogs();
    });
  }

  renderAdminRoles() {
    if (this.denyDevAdminIfNeeded()) return;
    this.adminContent.innerHTML = `
      <div class="admin-section" style="max-width:560px;">
        <p style="font-size:0.875rem;color:var(--md-sys-color-on-surface-variant);">仅可将 member 授予为 admin，或将 admin 撤销为 member。不能设置 dev_admin。</p>
        <div class="form-group" style="margin:1rem 0;">
          <label style="display:block;font-size:0.875rem;margin-bottom:0.35rem;">目标 UID</label>
          <input id="roleTargetUid" maxlength="8" placeholder="8位数字UID" style="${this.fieldStyle()}">
        </div>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
          <button type="button" class="btn-primary" id="grantAdminBtn">授予 admin</button>
          <button type="button" class="btn-secondary" id="revokeAdminBtn">撤销 admin</button>
        </div>
      </div>
    `;
    document.getElementById('grantAdminBtn')?.addEventListener('click', () => this.confirmGrantAdmin());
    document.getElementById('revokeAdminBtn')?.addEventListener('click', () => this.confirmRevokeAdmin());
  }

  confirmGrantAdmin() {
    const uid = (document.getElementById('roleTargetUid')?.value || '').trim();
    if (!/^\d{8}$/.test(uid)) {
      this.showSnackbar('请输入有效的8位UID');
      return;
    }
    this.showDialog({
      title: '授予管理员',
      content: `<p style="font-size:0.875rem;">将 UID <strong>${this.escapeHtml(uid)}</strong> 从 member 提升为 admin。</p>`,
      confirmText: '确认授予',
      onConfirm: async () => {
        const response = await adminService.grantAdmin(uid);
        if (response.success) {
          this.showSnackbar('已授予 admin');
          return true;
        }
        this.showSnackbar(response.error || '授予失败');
        return false;
      }
    });
  }

  confirmRevokeAdmin() {
    const uid = (document.getElementById('roleTargetUid')?.value || '').trim();
    if (!/^\d{8}$/.test(uid)) {
      this.showSnackbar('请输入有效的8位UID');
      return;
    }
    this.showDialog({
      title: '撤销管理员',
      confirmType: 'danger',
      content: `<p style="font-size:0.875rem;">将 UID <strong>${this.escapeHtml(uid)}</strong> 从 admin 降为 member。</p>`,
      confirmText: '确认撤销',
      onConfirm: async () => {
        const response = await adminService.revokeAdmin(uid);
        if (response.success) {
          this.showSnackbar('已撤销 admin');
          return true;
        }
        this.showSnackbar(response.error || '撤销失败');
        return false;
      }
    });
  }

  renderSensitiveL4() {
    if (this.denyDevAdminIfNeeded()) return;
    this.adminContent.innerHTML = `
      <div class="admin-section">
        <div class="tabs" style="display:flex;gap:0.25rem;margin-bottom:1rem;background-color:var(--md-sys-color-surface-container);padding:0.25rem;border-radius:0.75rem;max-width:360px;">
          <button type="button" class="l4-tab-btn ${this.l4HitsTab === 'pending' ? 'active' : ''}" data-tab="pending" style="flex:1;padding:0.75rem;border:none;background:${this.l4HitsTab === 'pending' ? 'var(--md-sys-color-primary)' : 'transparent'};color:${this.l4HitsTab === 'pending' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)'};border-radius:0.5rem;cursor:pointer;">待处理</button>
          <button type="button" class="l4-tab-btn ${this.l4HitsTab === 'all' ? 'active' : ''}" data-tab="all" style="flex:1;padding:0.75rem;border:none;background:${this.l4HitsTab === 'all' ? 'var(--md-sys-color-primary)' : 'transparent'};color:${this.l4HitsTab === 'all' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)'};border-radius:0.5rem;cursor:pointer;">全部 L4</button>
        </div>
        <div id="l4HitList"></div>
      </div>
    `;
    this.adminContent.querySelectorAll('.l4-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.l4HitsTab = btn.dataset.tab;
        this.renderSensitiveL4();
      });
    });
    this.loadSensitiveL4();
  }

  async loadSensitiveL4() {
    const box = document.getElementById('l4HitList');
    if (!box) return;
    box.innerHTML = this.renderLoading('正在加载 L4 命中...');
    const status = this.l4HitsTab === 'pending' ? 'pending' : null;
    const response = await adminService.getSensitiveHits(4, status, 1, 50);
    if (!response.success) {
      box.innerHTML = this.renderErrorState(response.error || '加载失败', () => this.loadSensitiveL4());
      return;
    }
    const rows = response.data || [];
    if (rows.length === 0) {
      box.innerHTML = '<p style="color:var(--md-sys-color-on-surface-variant);">暂无记录</p>';
      return;
    }
    box.innerHTML = rows.map(item => `
      <div class="admin-list-item" style="padding:1rem;margin-bottom:0.75rem;background:var(--md-sys-color-surface-container);border-radius:0.75rem;">
        <div style="font-size:0.875rem;"><strong>L${item.level}</strong> ${this.escapeHtml(item.matched_word || '')} · ${this.escapeHtml(item.handle_status || '')}</div>
        <div style="font-size:0.8125rem;color:var(--md-sys-color-on-surface-variant);margin:0.35rem 0;">${this.escapeHtml(item.user_name || item.user_id || '')} · ${this.escapeHtml(item.content_type || '')} ${this.escapeHtml(item.target_id || '')}</div>
        <div style="font-size:0.875rem;margin-bottom:0.5rem;">${this.escapeHtml(item.content_summary || '')}</div>
        ${item.handle_status === 'pending' ? `
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button type="button" class="btn-secondary l4-act" data-id="${item.id}" data-action="resolved">标记已处理</button>
            <button type="button" class="btn-secondary l4-act" data-id="${item.id}" data-action="ignored">忽略</button>
            <button type="button" class="btn-primary l4-act" data-id="${item.id}" data-action="ban" style="background:var(--md-sys-color-error);color:var(--md-sys-color-on-error);">L4 永久封禁</button>
          </div>` : ''}
      </div>
    `).join('');
    box.querySelectorAll('.l4-act').forEach(btn => {
      btn.addEventListener('click', () => this.confirmHandleL4(btn.dataset.id, btn.dataset.action));
    });
  }

  confirmHandleL4(hitId, action) {
    const labels = { resolved: '标记已处理', ignored: '忽略', ban: '按 L4 永久封禁' };
    this.showDialog({
      title: labels[action] || '处置',
      confirmType: action === 'ban' ? 'danger' : 'primary',
      confirmText: action === 'ban' ? '确认永久封禁' : '确认',
      content: action === 'ban'
        ? '<p style="color:var(--md-sys-color-error);font-size:0.875rem;">将通过服务端 penalty 核心执行永久封禁（理由：敏感词 L4）。</p>'
        : `<p style="font-size:0.875rem;">确认执行「${labels[action]}」？</p>`,
      onConfirm: async () => {
        const response = await adminService.handleSensitiveHit(hitId, action, action);
        if (response.success) {
          this.showSnackbar('已处置');
          this.loadSensitiveL4();
          return true;
        }
        this.showSnackbar(response.error || '处置失败');
        return false;
      }
    });
  }

  denyDevAdminIfNeeded() {
    if (this.userRole !== UserRoles.DEV_ADMIN) {
      this.adminContent.innerHTML = this.renderErrorState('您没有权限访问此功能', () => this.switchSection('dashboard'));
      return true;
    }
    return false;
  }

  // ==================== UI 颜色系统（仅 dev_admin） ====================

  denyThemeUiIfNeeded() {
    if (this.userRole !== UserRoles.DEV_ADMIN) {
      this.adminContent.innerHTML = this.renderErrorState('您没有权限访问此功能', () => this.switchSection('dashboard'));
      return true;
    }
    return false;
  }

  async renderThemeUi() {
    if (this.denyThemeUiIfNeeded()) return;

    this.adminContent.innerHTML = this.renderLoading('正在加载主题配置...');

    const response = await themeService.fetchThemeForAdmin();
    if (!response.success) {
      this.adminContent.innerHTML = this.renderErrorState(response.error || '加载失败', () => this.renderThemeUi());
      return;
    }

    this.themeName = response.data.themeName || '正式版 1.0';
    this.themeSaved = JSON.parse(JSON.stringify(response.data.config));
    this.themeDraft = JSON.parse(JSON.stringify(response.data.config));
    this.paintThemeUi();
  }

  paintThemeUi() {
    const draft = this.themeDraft;
    const warnings = themeService.getThemeContrastWarnings(draft);
    const categories = ['button', 'background', 'card', 'text'];

    let panels = '';
    for (const cat of categories) {
      const fields = THEME_FIELD_LABELS[cat] || {};
      let rows = '';
      for (const [key, label] of Object.entries(fields)) {
        const val = (draft[cat] && draft[cat][key]) || '#000000';
        const hex = val.toUpperCase();
        rows += `
          <div class="theme-ui-row">
            <label for="theme-${cat}-${key}">${this.escapeHtml(label)}</label>
            <input type="color" id="theme-color-${cat}-${key}" data-cat="${cat}" data-key="${key}" value="${hex.toLowerCase()}" aria-label="${this.escapeHtml(label)} 取色">
            <input type="text" id="theme-${cat}-${key}" data-cat="${cat}" data-key="${key}" value="${hex}" maxlength="7" spellcheck="false" aria-label="${this.escapeHtml(label)} HEX">
          </div>`;
      }
      panels += `
        <section class="theme-ui-panel">
          <h4>${this.escapeHtml(THEME_CATEGORY_LABELS[cat] || cat)}</h4>
          ${rows}
        </section>`;
    }

    this.adminContent.innerHTML = `
      <div class="theme-ui-page">
        <div class="theme-ui-toolbar">
          <div>
            <h3 style="margin:0 0 0.25rem;font-size:1.25rem;font-weight:500;">UI 颜色系统</h3>
            <p class="theme-ui-hint">当前主题：${this.escapeHtml(this.themeName)}。修改后仅实时预览，需点击「保存主题」才会写入数据库。</p>
          </div>
          <div class="theme-ui-actions">
            <button type="button" class="btn-secondary" id="themeResetBtn">恢复默认颜色</button>
            <button type="button" class="btn-primary" id="themeSaveBtn">保存主题</button>
          </div>
        </div>
        ${warnings.length ? `<div class="theme-ui-warnings" id="themeWarnings">${warnings.map(w => this.escapeHtml(w)).join('<br>')}</div>` : '<div id="themeWarnings"></div>'}
        <div class="theme-ui-preview">
          <button type="button" class="btn-primary">主按钮</button>
          <button type="button" class="btn-secondary">次按钮</button>
          <button type="button" class="btn-primary" disabled>禁用按钮</button>
          <div class="theme-ui-preview-card">
            <strong>卡片预览</strong>
            <p style="margin:0.25rem 0 0;font-size:0.8125rem;color:var(--md-sys-color-on-surface-variant);">次文字 / <a href="#" class="link-primary" onclick="return false;">链接文字</a></p>
          </div>
        </div>
        <div class="theme-ui-grid">${panels}</div>
      </div>
    `;

    this.bindThemeUiEvents();
  }

  bindThemeUiEvents() {
    this.adminContent.querySelectorAll('.theme-ui-row input[type="color"]').forEach(input => {
      input.addEventListener('input', () => {
        this.updateThemeDraftField(input.dataset.cat, input.dataset.key, input.value);
        const hexInput = this.adminContent.querySelector(`#theme-${input.dataset.cat}-${input.dataset.key}`);
        if (hexInput) hexInput.value = input.value.toUpperCase();
      });
    });
    this.adminContent.querySelectorAll('.theme-ui-row input[type="text"]').forEach(input => {
      input.addEventListener('change', () => {
        const raw = (input.value || '').trim();
        const hex = raw.startsWith('#') ? raw : `#${raw}`;
        if (!isValidHexColor(hex)) {
          this.showSnackbar('请输入有效的 #RRGGBB 颜色');
          input.value = this.themeDraft[input.dataset.cat][input.dataset.key];
          return;
        }
        const normalized = hex.toUpperCase();
        input.value = normalized;
        const colorInput = this.adminContent.querySelector(`#theme-color-${input.dataset.cat}-${input.dataset.key}`);
        if (colorInput) colorInput.value = normalized;
        this.updateThemeDraftField(input.dataset.cat, input.dataset.key, normalized);
      });
    });

    const saveBtn = document.getElementById('themeSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveThemeUi());
    const resetBtn = document.getElementById('themeResetBtn');
    if (resetBtn) resetBtn.addEventListener('click', () => this.confirmResetThemeUi());
  }

  updateThemeDraftField(cat, key, hex) {
    if (!this.themeDraft[cat]) this.themeDraft[cat] = {};
    this.themeDraft[cat][key] = hex.toUpperCase();
    themeService.previewTheme(this.themeDraft);
    this.refreshThemeWarnings();
  }

  refreshThemeWarnings() {
    const box = document.getElementById('themeWarnings');
    if (!box) return;
    const warnings = themeService.getThemeContrastWarnings(this.themeDraft);
    if (!warnings.length) {
      box.className = '';
      box.innerHTML = '';
      return;
    }
    box.className = 'theme-ui-warnings';
    box.innerHTML = warnings.map(w => this.escapeHtml(w)).join('<br>');
  }

  async saveThemeUi() {
    if (this.denyThemeUiIfNeeded()) return;
    const check = themeService.validateThemeConfigForSave(this.themeDraft);
    if (!check.valid) {
      this.showSnackbar(check.message);
      return;
    }
    const response = await themeService.saveTheme(check.config, this.themeName);
    if (!response.success) {
      this.showSnackbar(response.error || '保存失败');
      return;
    }
    this.themeSaved = JSON.parse(JSON.stringify(check.config));
    this.themeDraft = JSON.parse(JSON.stringify(check.config));
    this.showSnackbar('主题已保存，全站将使用新颜色');
  }

  confirmResetThemeUi() {
    this.showDialog({
      title: '恢复默认颜色',
      content: '<p style="margin:0;color:var(--md-sys-color-on-surface-variant);">将恢复正式版 1.0 默认颜色并立即保存。确定继续？</p>',
      confirmText: '恢复默认',
      confirmType: 'danger',
      onConfirm: async () => {
        const response = await themeService.resetThemeToDefault();
        if (!response.success) {
          this.showSnackbar(response.error || '恢复失败');
          return false;
        }
        this.showSnackbar('已恢复正式版 1.0 默认颜色');
        await this.renderThemeUi();
        return true;
      }
    });
  }

  // ==================== 公告管理 ====================

  async renderAnnouncements() {
    if (this.userRole !== UserRoles.DEV_ADMIN) {
      this.adminContent.innerHTML = this.renderErrorState('您没有权限访问此功能', () => this.switchSection('dashboard'));
      return;
    }

    this.adminContent.innerHTML = `
      <div class="admin-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
          <h3 style="font-size: 1.25rem; font-weight: 500; color: var(--md-sys-color-on-surface); margin: 0;">公告列表</h3>
          <button id="createAnnouncementBtn" style="
            padding: 0.625rem 1.25rem;
            font-size: 0.875rem;
            font-weight: 500;
            font-family: inherit;
            background-color: var(--md-sys-color-primary);
            color: var(--md-sys-color-on-primary);
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          " onmouseover="this.style.backgroundColor='var(--md-sys-color-primary-dark)';"
            onmouseout="this.style.backgroundColor='var(--md-sys-color-primary)';">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            创建公告
          </button>
        </div>
        <div class="announcements-list">
          ${this.renderLoading('正在加载公告列表...')}
        </div>
      </div>
    `;

    const createBtn = document.getElementById('createAnnouncementBtn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.showCreateAnnouncementDialog());
    }

    await this.loadAnnouncementsList();
  }

  async loadAnnouncementsList() {
    const listContainer = this.adminContent.querySelector('.announcements-list');
    if (!listContainer) return;

    listContainer.innerHTML = this.renderLoading('正在加载公告列表...');

    try {
      const response = await announcementService.adminGetAll(1, 50);

      if (!response.success) {
        listContainer.innerHTML = this.renderErrorState(response.error || '加载失败', () => this.loadAnnouncementsList());
        return;
      }

      const items = response.data || [];

      if (items.length === 0) {
        listContainer.innerHTML = this.renderEmptyState('暂无公告');
        return;
      }

      let html = '<div class="admin-list" style="display: flex; flex-direction: column; gap: 0.75rem;">';
      this.announcementEditCache.clear();
      items.forEach(item => {
        this.announcementEditCache.set(String(item.id), {
          title: item.title || '',
          content: item.content || ''
        });
        html += this.renderAnnouncementItem(item);
      });
      html += '</div>';
      listContainer.innerHTML = html;

      listContainer.querySelectorAll('.edit-announcement-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const cached = this.announcementEditCache.get(String(id)) || {};
          this.showEditAnnouncementDialog(id, cached.title || '', cached.content || '');
        });
      });

      listContainer.querySelectorAll('.publish-announcement-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const cached = this.announcementEditCache.get(String(id)) || {};
          this.showPublishAnnouncementDialog(id, cached.title || '');
        });
      });

    } catch (error) {
      console.error('[AdminPage] 公告列表加载失败:', error);
      listContainer.innerHTML = this.renderErrorState('加载失败，请稍后重试', () => this.loadAnnouncementsList());
    }
  }

  renderAnnouncementItem(item) {
    const isDraft = item.status === 'draft';
    const statusColors = isDraft
      ? { bg: 'var(--md-sys-color-surface-variant)', color: 'var(--md-sys-color-on-surface-variant)' }
      : { bg: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' };

    return `
      <div class="admin-list-item" style="
        background-color: var(--md-sys-color-surface);
        border-radius: 0.875rem;
        padding: 1.25rem;
        border: 1px solid var(--md-sys-color-outline-variant);
      ">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <span style="font-weight: 500; color: var(--md-sys-color-on-surface); font-size: 1rem;">
              ${this.escapeHtml(item.title || '无标题')}
            </span>
            <span style="
              font-size: 0.75rem;
              padding: 0.125rem 0.5rem;
              border-radius: 999px;
              background-color: ${statusColors.bg};
              color: ${statusColors.color};
              font-weight: 500;
            ">${isDraft ? '草稿' : '已发布'}</span>
          </div>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            ${isDraft ? `
              <button class="publish-announcement-btn" data-id="${item.id}" style="
                padding: 0.375rem 0.875rem;
                font-size: 0.8125rem;
                font-weight: 500;
                font-family: inherit;
                background-color: var(--md-sys-color-primary);
                color: var(--md-sys-color-on-primary);
                border: none;
                border-radius: 0.375rem;
                cursor: pointer;
                transition: all 0.2s ease;
              " onmouseover="this.style.backgroundColor='var(--md-sys-color-primary-dark)';"
                onmouseout="this.style.backgroundColor='var(--md-sys-color-primary)';">发布</button>
            ` : ''}
            <button class="edit-announcement-btn" data-id="${item.id}" style="
              padding: 0.375rem 0.875rem;
              font-size: 0.8125rem;
              font-weight: 500;
              font-family: inherit;
              border: 1px solid var(--md-sys-color-outline);
              background: none;
              color: var(--md-sys-color-on-surface);
              border-radius: 0.375rem;
              cursor: pointer;
              transition: all 0.2s ease;
            " onmouseover="this.style.backgroundColor='var(--md-sys-color-surface-container-high)';"
              onmouseout="this.style.backgroundColor='transparent';">编辑</button>
          </div>
        </div>
        <div style="font-size: 0.875rem; color: var(--md-sys-color-on-surface-variant); margin-bottom: 0.5rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${this.escapeHtml(item.content || '')}
        </div>
        <div style="display: flex; gap: 1rem; font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant); flex-wrap: wrap;">
          ${item.published_at ? `<span>发布时间：${this.formatTime(item.published_at)}</span>` : ''}
          <span>创建时间：${this.formatTime(item.created_at)}</span>
        </div>
      </div>
    `;
  }

  showCreateAnnouncementDialog() {
    this.showDialog({
      title: '创建公告',
      content: `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <div class="form-group">
            <label style="display: block; font-size: 0.875rem; color: var(--md-sys-color-on-surface-variant); margin-bottom: 0.5rem;">公告标题</label>
            <input type="text" id="announcementTitleInput" placeholder="请输入公告标题" style="
              width: 100%;
              padding: 0.75rem 1rem;
              border: 1px solid var(--md-sys-color-outline);
              border-radius: 0.5rem;
              font-size: 1rem;
              font-family: inherit;
              background-color: var(--md-sys-color-surface);
              color: var(--md-sys-color-on-surface);
              box-sizing: border-box;
            ">
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 0.875rem; color: var(--md-sys-color-on-surface-variant); margin-bottom: 0.5rem;">公告内容</label>
            <textarea id="announcementContentInput" rows="6" placeholder="请输入公告内容" style="
              width: 100%;
              padding: 0.75rem 1rem;
              border: 1px solid var(--md-sys-color-outline);
              border-radius: 0.5rem;
              font-size: 1rem;
              font-family: inherit;
              background-color: var(--md-sys-color-surface);
              color: var(--md-sys-color-on-surface);
              box-sizing: border-box;
              resize: vertical;
            "></textarea>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="checkbox" id="publishNowCheckbox" style="width: 18px; height: 18px; cursor: pointer;">
            <label for="publishNowCheckbox" style="font-size: 0.875rem; color: var(--md-sys-color-on-surface); cursor: pointer;">立即发布</label>
          </div>
        </div>
      `,
      confirmText: '创建',
      confirmType: 'primary',
      onConfirm: async (dialog) => {
        const titleInput = dialog.querySelector('#announcementTitleInput');
        const contentInput = dialog.querySelector('#announcementContentInput');
        const publishCheckbox = dialog.querySelector('#publishNowCheckbox');

        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        const publish = publishCheckbox.checked;

        if (!title) {
          this.showSnackbar('请输入公告标题');
          return false;
        }
        if (!content) {
          this.showSnackbar('请输入公告内容');
          return false;
        }

        // 敏感词前端预检：命中则弹全屏警告，不提交
        if (this.precheckAnnouncement(title, content)) return false;

        const response = await announcementService.adminCreate(title, content, publish);
        if (response.success) {
          this.showSnackbar(publish ? '公告已创建并发布' : '公告已创建（草稿）');
          this.loadAnnouncementsList();
          return true;
        } else {
          this.showSnackbar(response.error || '创建失败');
          return false;
        }
      }
    });
  }

  showEditAnnouncementDialog(id, title, content) {
    this.showDialog({
      title: '编辑公告',
      content: `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <div class="form-group">
            <label style="display: block; font-size: 0.875rem; color: var(--md-sys-color-on-surface-variant); margin-bottom: 0.5rem;">公告标题</label>
            <input type="text" id="editAnnouncementTitleInput" value="${this.escapeHtml(title)}" style="
              width: 100%;
              padding: 0.75rem 1rem;
              border: 1px solid var(--md-sys-color-outline);
              border-radius: 0.5rem;
              font-size: 1rem;
              font-family: inherit;
              background-color: var(--md-sys-color-surface);
              color: var(--md-sys-color-on-surface);
              box-sizing: border-box;
            ">
          </div>
          <div class="form-group">
            <label style="display: block; font-size: 0.875rem; color: var(--md-sys-color-on-surface-variant); margin-bottom: 0.5rem;">公告内容</label>
            <textarea id="editAnnouncementContentInput" rows="6" style="
              width: 100%;
              padding: 0.75rem 1rem;
              border: 1px solid var(--md-sys-color-outline);
              border-radius: 0.5rem;
              font-size: 1rem;
              font-family: inherit;
              background-color: var(--md-sys-color-surface);
              color: var(--md-sys-color-on-surface);
              box-sizing: border-box;
              resize: vertical;
            ">${this.escapeHtml(content)}</textarea>
          </div>
        </div>
      `,
      confirmText: '保存',
      confirmType: 'primary',
      onConfirm: async (dialog) => {
        const titleInput = dialog.querySelector('#editAnnouncementTitleInput');
        const contentInput = dialog.querySelector('#editAnnouncementContentInput');

        const newTitle = titleInput.value.trim();
        const newContent = contentInput.value.trim();

        if (!newTitle) {
          this.showSnackbar('请输入公告标题');
          return false;
        }
        if (!newContent) {
          this.showSnackbar('请输入公告内容');
          return false;
        }

        // 敏感词前端预检：命中则弹全屏警告，不提交
        if (this.precheckAnnouncement(newTitle, newContent)) return false;

        const response = await announcementService.adminUpdate(id, newTitle, newContent);
        if (response.success) {
          this.showSnackbar('公告已更新');
          this.loadAnnouncementsList();
          return true;
        } else {
          this.showSnackbar(response.error || '更新失败');
          return false;
        }
      }
    });
  }

  showPublishAnnouncementDialog(id, title) {
    this.showDialog({
      title: '发布公告',
      content: `
        <p style="color: var(--md-sys-color-on-surface-variant); font-size: 0.875rem; line-height: 1.5;">
          确定要发布公告 <strong style="color: var(--md-sys-color-on-surface);">「${this.escapeHtml(title)}」</strong> 吗？<br>
          发布后所有用户都将看到此公告。
        </p>
      `,
      confirmText: '确认发布',
      confirmType: 'primary',
      onConfirm: async () => {
        const response = await announcementService.adminPublish(id);
        if (response.success) {
          this.showSnackbar('公告已发布');
          this.loadAnnouncementsList();
          return true;
        } else {
          this.showSnackbar(response.error || '发布失败');
          return false;
        }
      }
    });
  }

  // ==================== 通用工具方法 ====================

  renderLoading(text = '加载中...') {
    return `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem 1rem;
        gap: 1rem;
      ">
        <span class="material-symbols-outlined loading-spinner" aria-hidden="true">progress_activity</span>
        <span style="font-size: 0.875rem; color: var(--md-sys-color-on-surface-variant);">${this.escapeHtml(text)}</span>
      </div>
    `;
  }

  renderEmptyState(text = '暂无数据') {
    return `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 4rem 1rem;
        gap: 1rem;
      ">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64" style="color: var(--md-sys-color-on-surface-variant); opacity: 0.5;">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="9" y1="9" x2="15" y2="9"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="11" y2="17"/>
        </svg>
        <span style="font-size: 0.875rem; color: var(--md-sys-color-on-surface-variant);">${this.escapeHtml(text)}</span>
      </div>
    `;
  }

  renderErrorState(message, retryCallback) {
    const errorId = 'error-' + Date.now();
    setTimeout(() => {
      const btn = document.getElementById(errorId);
      if (btn && retryCallback) {
        btn.addEventListener('click', retryCallback);
      }
    }, 0);

    return `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem 1rem;
        gap: 1rem;
      ">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="color: var(--md-sys-color-error); opacity: 0.7;">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style="font-size: 0.875rem; color: var(--md-sys-color-on-surface-variant);">${this.escapeHtml(message)}</span>
        <button id="${errorId}" style="
          padding: 0.5rem 1.25rem;
          font-size: 0.875rem;
          font-weight: 500;
          font-family: inherit;
          border: 1px solid var(--md-sys-color-outline);
          background: none;
          color: var(--md-sys-color-on-surface);
          border-radius: 0.5rem;
          cursor: pointer;
          transition: all 0.2s ease;
        ">重试</button>
      </div>
    `;
  }

  showDialog({ title, content, confirmText = '确认', cancelText = '取消', confirmType = 'primary', onConfirm }) {
    // 移除已有对话框
    const existing = document.querySelector('.admin-dialog-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'admin-dialog-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      padding: 1rem;
      animation: fadeIn 0.2s ease;
    `;

    const dialog = document.createElement('div');
    dialog.className = 'admin-dialog';
    dialog.style.cssText = `
      background-color: var(--md-sys-color-surface);
      border-radius: 1.25rem;
      width: 100%;
      max-width: 440px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      animation: dialogSlideIn 0.25s ease;
    `;

    const confirmBtnStyles = confirmType === 'danger'
      ? 'background-color: var(--md-sys-color-error); color: var(--md-sys-color-on-error);'
      : 'background-color: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary);';

    const confirmHoverStyles = confirmType === 'danger'
      ? 'background-color: #991b1b;'
      : 'background-color: var(--md-sys-color-primary-dark);';

    dialog.innerHTML = `
      <div style="padding: 1.5rem 1.5rem 0.5rem;">
        <h3 style="font-size: 1.25rem; font-weight: 500; color: var(--md-sys-color-on-surface); margin: 0;">${this.escapeHtml(title)}</h3>
      </div>
      <div style="padding: 0.5rem 1.5rem 1.5rem;">
        ${content}
      </div>
      <div style="
        display: flex;
        gap: 0.75rem;
        padding: 0 1.5rem 1.5rem;
        justify-content: flex-end;
      ">
        <button class="dialog-cancel-btn" style="
          padding: 0.625rem 1.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          font-family: inherit;
          border: 1px solid var(--md-sys-color-outline);
          background: none;
          color: var(--md-sys-color-on-surface);
          border-radius: 0.5rem;
          cursor: pointer;
          transition: all 0.2s ease;
        " onmouseover="this.style.backgroundColor='var(--md-sys-color-surface-container-high)';"
          onmouseout="this.style.backgroundColor='transparent';">${this.escapeHtml(cancelText)}</button>
        <button class="dialog-confirm-btn" style="
          padding: 0.625rem 1.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          font-family: inherit;
          border: none;
          border-radius: 0.5rem;
          cursor: pointer;
          transition: all 0.2s ease;
          ${confirmBtnStyles}
        " onmouseover="this.style.backgroundColor='${confirmType === 'danger' ? '#991b1b' : 'var(--md-sys-color-primary-dark)'}';"
          onmouseout="this.style.backgroundColor='${confirmType === 'danger' ? 'var(--md-sys-color-error)' : 'var(--md-sys-color-primary)'}';">${this.escapeHtml(confirmText)}</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 添加动画样式
    if (!document.getElementById('admin-dialog-styles')) {
      const style = document.createElement('style');
      style.id = 'admin-dialog-styles';
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes dialogSlideIn {
          from { opacity: 0; transform: translateY(-20px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `;
      document.head.appendChild(style);
    }

    const closeDialog = () => overlay.remove();

    // 取消按钮
    const cancelBtn = dialog.querySelector('.dialog-cancel-btn');
    cancelBtn.addEventListener('click', closeDialog);

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDialog();
    });

    // ESC 关闭
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeDialog();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);

    // 确认按钮
    const confirmBtn = dialog.querySelector('.dialog-confirm-btn');
    confirmBtn.addEventListener('click', async () => {
      if (!onConfirm) {
        closeDialog();
        return;
      }

      const originalText = confirmBtn.textContent;
      confirmBtn.disabled = true;
      confirmBtn.textContent = '处理中...';
      confirmBtn.style.opacity = '0.7';

      try {
        const result = await onConfirm(dialog);
        if (result !== false) {
          closeDialog();
        }
      } catch (error) {
        console.error('[AdminPage] 对话框操作失败:', error);
        this.showSnackbar('操作失败，请稍后重试');
      } finally {
        if (document.body.contains(confirmBtn)) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = originalText;
          confirmBtn.style.opacity = '1';
        }
      }
    });

    return dialog;
  }

  showSnackbar(message) {
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
    }
    if (this.snackbarLabel) {
      this.snackbarLabel.textContent = message;
    }
    if (this.snackbar) {
      this.snackbar.classList.add('show');
    }

    this.snackbarTimer = setTimeout(() => {
      this.hideSnackbar();
    }, 4000);
  }

  hideSnackbar() {
    if (this.snackbar) {
      this.snackbar.classList.remove('show');
    }
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
      this.snackbarTimer = null;
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatTime(dateStr) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;

      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return '刚刚';
      if (diffMins < 60) return `${diffMins} 分钟前`;
      if (diffHours < 24) return `${diffHours} 小时前`;
      if (diffDays < 7) return `${diffDays} 天前`;

      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const h = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');

      if (y === now.getFullYear()) {
        return `${m}-${d} ${h}:${min}`;
      }
      return `${y}-${m}-${d} ${h}:${min}`;
    } catch (e) {
      return dateStr;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AdminPage();
});
