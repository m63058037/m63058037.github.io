import { authService } from '../services/auth.js';
import { profileService } from '../services/profile.js';
import { escapeHtml } from '../utils/helpers.js';
import { getBranchByName } from '../config/branches.js';

class UserProfilePage {
  constructor() {
    this.userId = null;
    this.currentUser = null;
    this.isOwnProfile = false;
    this.profile = null;

    this.profileAvatar = document.getElementById('profileAvatar');
    this.profileName = document.getElementById('profileName');
    this.profileMeta = document.getElementById('profileMeta');
    this.metaCampus = document.getElementById('metaCampus');
    this.metaGrade = document.getElementById('metaGrade');
    this.postCount = document.getElementById('postCount');

    this.profilePrivateInfo = document.getElementById('profilePrivateInfo');
    this.privateUid = document.getElementById('privateUid');
    this.privateStudentId = document.getElementById('privateStudentId');
    this.privateAccountStatus = document.getElementById('privateAccountStatus');
    this.privateRoleRow = document.getElementById('privateRoleRow');
    this.privateRole = document.getElementById('privateRole');

    this.backButton = document.getElementById('backButton');

    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');

    this.snackbarTimer = null;

    this.init();
  }

  async init() {
    try {
      await this.checkSession();
      await this.getCurrentUser();
      this.parseUserIdFromURL();
      await this.loadProfile();
      this.bindEvents();
    } catch (error) {
      this.showSnackbar('加载失败');
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

  parseUserIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    const uid = params.get('uid');
    if (uid) {
      this.userId = uid;
    } else if (this.currentUser) {
      // 没有 uid 参数，显示自己的资料
      this.userId = this.currentUser.id;
    }
  }

  async loadProfile() {
    if (!this.userId) {
      this.showSnackbar('用户ID无效');
      return;
    }

    // 判断是否是查看自己的资料
    if (this.currentUser && this.currentUser.id === this.userId) {
      this.isOwnProfile = true;
    }

    try {
      // 获取公开资料
      const publicResponse = await profileService.getPublicProfile(this.userId);

      if (!publicResponse.success) {
        this.showSnackbar(publicResponse.error || '获取用户资料失败');
        return;
      }

      this.profile = publicResponse.data;

      if (!this.profile) {
        this.showSnackbar('用户不存在');
        return;
      }

      this.renderPublicProfile();

      // 如果是本人查看，加载完整资料（私密信息）
      if (this.isOwnProfile) {
        await this.loadFullProfile();
      }
    } catch (error) {
      this.showSnackbar('加载失败');
    }
  }

  async loadFullProfile() {
    try {
      const fullResponse = await profileService.getFullProfile();

      if (!fullResponse.success) {
        return;
      }

      const fullProfile = fullResponse.data;
      if (!fullProfile) return;

      this.renderPrivateInfo(fullProfile);
    } catch (error) {
      // 静默失败，私密信息加载失败不影响主页面
    }
  }

  renderPublicProfile() {
    const profile = this.profile;

    // 名称（RPC 返回 name 字段，兼容 nickname）
    this.profileName.textContent = profile.name || profile.nickname || '用户';

    // 头像（公开资料不含头像，使用首字母生成）
    this.renderAvatar(profile);

    // 校区
    if (profile.branch) {
      const branchInfo = getBranchByName(profile.branch);
      this.metaCampus.textContent = branchInfo ? branchInfo.name : profile.branch;
      this.metaCampus.style.display = '';
    } else {
      this.metaCampus.style.display = 'none';
    }

    // 年级
    if (profile.grade) {
      this.metaGrade.textContent = profile.grade;
      this.metaGrade.style.display = '';
    } else {
      this.metaGrade.style.display = 'none';
    }

    // 发帖数量
    const postCount = profile.post_count || profile.posts_count || 0;
    this.postCount.textContent = postCount;
  }

  renderAvatar(profile) {
    const avatarContainer = this.profileAvatar.parentElement;

    if (profile.avatar) {
      this.profileAvatar.src = profile.avatar;
      this.profileAvatar.style.display = '';
      // 移除可能存在的首字母元素
      const letterEl = avatarContainer.querySelector('.avatar-letter');
      if (letterEl) letterEl.remove();
    } else {
      // 首字母圆形头像
      this.profileAvatar.style.display = 'none';
      const name = profile.nickname || '用';
      const firstLetter = name.charAt(0).toUpperCase();

      // 生成背景色（基于名称哈希）
      const bgColor = this.generateAvatarColor(profile.id || name);

      let letterEl = avatarContainer.querySelector('.avatar-letter');
      if (!letterEl) {
        letterEl = document.createElement('div');
        letterEl.className = 'avatar-letter';
        avatarContainer.appendChild(letterEl);
      }
      letterEl.textContent = firstLetter;
      letterEl.style.backgroundColor = bgColor;
      letterEl.style.color = '#ffffff';
      letterEl.style.width = '100%';
      letterEl.style.height = '100%';
      letterEl.style.borderRadius = '50%';
      letterEl.style.display = 'flex';
      letterEl.style.alignItems = 'center';
      letterEl.style.justifyContent = 'center';
      letterEl.style.fontSize = '32px';
      letterEl.style.fontWeight = '500';
    }
  }

  generateAvatarColor(seed) {
    const colors = [
      '#5B8FF9', '#5AD8A6', '#5D7092', '#F6BD16', '#E8684A',
      '#6DC8EC', '#9270CA', '#FF9D4D', '#269A99', '#FF99C3'
    ];
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }

  renderPrivateInfo(fullProfile) {
    this.profilePrivateInfo.style.display = 'block';

    // UID
    if (this.privateUid) {
      this.privateUid.textContent = fullProfile.uid || '-';
    }

    // 学号（RPC 返回 student_id 字段，兼容 student_number）
    if (this.privateStudentId) {
      this.privateStudentId.textContent = fullProfile.student_id || fullProfile.student_number || '-';
    }

    // 账号状态（RPC 返回 status 字段，兼容 account_status）
    if (this.privateAccountStatus) {
      const status = fullProfile.status || fullProfile.account_status || 'active';
      const statusText = this.getAccountStatusText(status);
      this.privateAccountStatus.textContent = statusText;
    }

    // 角色状态（仅本人可见；普通 member 不显示）
    if (this.privateRoleRow && this.privateRole) {
      const role = fullProfile.role || this.currentUser?.role;
      const roleText = this.getRoleText(role);
      if (roleText) {
        this.privateRole.textContent = roleText;
        this.privateRoleRow.style.display = 'flex';
      } else {
        this.privateRoleRow.style.display = 'none';
      }
    }
  }

  getRoleText(role) {
    if (role === 'dev_admin') return '开发管理员';
    if (role === 'admin') return '管理员';
    return '';
  }

  getAccountStatusText(status) {
    if (status === 'normal' || status === 'active') {
      return '正常';
    }
    return '受限';
  }

  bindEvents() {
    if (this.backButton) {
      this.backButton.addEventListener('click', () => this.goBack());
    }
    if (this.snackbarAction) {
      this.snackbarAction.addEventListener('click', () => this.hideSnackbar());
    }
  }

  showSnackbar(message) {
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
    }
    this.snackbarLabel.textContent = message;
    this.snackbar.classList.add('show');
    this.snackbarTimer = setTimeout(() => this.hideSnackbar(), 5000);
  }

  hideSnackbar() {
    this.snackbar.classList.remove('show');
  }

  goBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'home.html';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new UserProfilePage();
});
