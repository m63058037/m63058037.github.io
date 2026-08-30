import { authService } from '../services/auth.js';
import { storageService } from '../services/storage.js';
import { profileService } from '../services/profile.js';
import { sensitiveWordService } from '../services/sensitive-word.js';
import { showContentWarnDialog } from '../components/content-warn-dialog.js';

class ProfilePage {
  constructor() {
    this.profileForm = document.getElementById('profileForm');
    this.nicknameInput = document.getElementById('nickname');
    this.bioInput = document.getElementById('bio');
    this.signatureInput = document.getElementById('signature');
    this.saveBtn = document.getElementById('saveBtn');
    this.cancelBtn = document.getElementById('cancelBtn');
    this.logoutBtn = document.getElementById('logoutBtn');
    this.backButton = document.getElementById('backButton');
    
    this.avatarImg = document.getElementById('avatarImg');
    this.avatarUploadBtn = document.getElementById('avatarUploadBtn');
    this.avatarFileInput = document.getElementById('avatarFileInput');
    this.avatarUploadStatus = document.getElementById('avatarUploadStatus');
    
    this.profileNickname = document.getElementById('profileNickname');
    this.profileRoleBadge = document.getElementById('profileRoleBadge');
    this.profileEmail = document.getElementById('profileEmail');
    
    this.bioCounter = document.getElementById('bioCounter');
    this.signatureCounter = document.getElementById('signatureCounter');
    
    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');
    
    this.nicknameError = document.getElementById('nicknameError');
    this.bioError = document.getElementById('bioError');
    this.signatureError = document.getElementById('signatureError');
    
    this.originalData = {};
    this.currentUser = null;
    this.snackbarTimer = null;

    // 头像状态：选择上传后的暂存 URL + 变更标记，纳入统一保存链路
    this.avatarUploadedUrl = null;
    this.avatarChanged = false;
    
    this.init();
  }

  async init() {
    try {
      await this.checkSession();
      await this.getCurrentUser();
      await this.loadUserProfile();
      this.renderPage();
      this.bindEvents();
    } catch (error) {
      this.showSnackbar('页面初始化失败');
    }
  }

  async checkSession() {
    const isLoggedIn = await authService.isLoggedIn();
    if (!isLoggedIn) {
      this.redirectToLogin();
      throw new Error('User not logged in');
    }
  }

  async getCurrentUser() {
    const response = await authService.getCurrentUser();
    if (!response.success) {
      throw new Error(response.message);
    }
    this.currentUser = response.data;
  }

  async loadUserProfile() {
    if (!this.currentUser) return;
    
    this.originalData = {
      nickname: this.currentUser.nickname || '',
      bio: this.currentUser.bio || '',
      signature: this.currentUser.signature || ''
    };
  }

  renderPage() {
    if (!this.currentUser) return;
    
    this.nicknameInput.value = this.currentUser.nickname || '';
    this.bioInput.value = this.currentUser.bio || '';
    this.signatureInput.value = this.currentUser.signature || '';
    
    this.profileNickname.textContent = this.currentUser.nickname || '用户';
    this.profileEmail.textContent = this.currentUser.email;

    this.renderRoleBadge();
    
    this.updateCounter(this.bioInput, this.bioCounter);
    this.updateCounter(this.signatureInput, this.signatureCounter);
    
    if (this.currentUser.avatar) {
      this.avatarImg.src = this.currentUser.avatar;
    } else {
      this.avatarImg.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${this.currentUser.id}`;
    }
  }

  renderRoleBadge() {
    if (!this.currentUser || !this.profileRoleBadge) return;
    const role = this.currentUser.role;
    const roleText = role === 'dev_admin' ? '开发管理员'
      : role === 'admin' ? '管理员'
      : '';
    if (roleText) {
      this.profileRoleBadge.textContent = roleText;
      this.profileRoleBadge.style.display = 'inline-flex';
    } else {
      this.profileRoleBadge.style.display = 'none';
    }
  }

  bindEvents() {
    this.profileForm.addEventListener('submit', (e) => this.handleSubmit(e));
    this.cancelBtn.addEventListener('click', () => this.resetForm());
    this.logoutBtn.addEventListener('click', () => this.handleLogout());
    
    if (this.backButton) {
      this.backButton.addEventListener('click', () => this.goBack());
    }
    
    this.nicknameInput.addEventListener('input', () => this.validateNickname());
    this.bioInput.addEventListener('input', () => {
      this.updateCounter(this.bioInput, this.bioCounter);
      this.validateBio();
    });
    this.signatureInput.addEventListener('input', () => {
      this.updateCounter(this.signatureInput, this.signatureCounter);
      this.validateSignature();
    });
    
    this.avatarUploadBtn.addEventListener('click', () => this.avatarFileInput.click());
    this.avatarFileInput.addEventListener('change', (e) => this.handleAvatarUpload(e));
    
    this.snackbarAction.addEventListener('click', () => this.hideSnackbar());
  }

  updateCounter(input, counter) {
    counter.textContent = input.value.length;
  }

  validateNickname() {
    const nickname = this.nicknameInput.value.trim();
    
    if (!nickname) {
      this.nicknameError.textContent = '';
      return false;
    }
    
    if (nickname.length < 2) {
      this.nicknameError.textContent = '昵称至少需要2个字符';
      return false;
    }
    
    if (nickname.length > 50) {
      this.nicknameError.textContent = '昵称不能超过50个字符';
      return false;
    }
    
    if (!/^[\u4e00-\u9fa5a-zA-Z0-9_]+$/.test(nickname)) {
      this.nicknameError.textContent = '昵称只能包含中文、英文、数字和下划线';
      return false;
    }
    
    this.nicknameError.textContent = '';
    return true;
  }

  validateBio() {
    const bio = this.bioInput.value;
    
    if (bio.length > 200) {
      this.bioError.textContent = '个人简介不能超过200个字符';
      return false;
    }
    
    this.bioError.textContent = '';
    return true;
  }

  validateSignature() {
    const signature = this.signatureInput.value;
    
    if (signature.length > 100) {
      this.signatureError.textContent = '个性签名不能超过100个字符';
      return false;
    }
    
    this.signatureError.textContent = '';
    return true;
  }

  async handleSubmit(e) {
    e.preventDefault();
    
    const isNicknameValid = this.validateNickname();
    const isBioValid = this.validateBio();
    const isSignatureValid = this.validateSignature();
    
    if (!isNicknameValid || !isBioValid || !isSignatureValid) {
      return;
    }
    
    const hasChanges = this.hasChanges();
    if (!hasChanges) {
      this.showSnackbar('没有需要保存的修改');
      return;
    }
    
    this.setLoading(true);
    
    try {
      const updates = {};
      if (this.nicknameInput.value !== this.originalData.nickname) {
        updates.nickname = this.nicknameInput.value.trim();
      }
      if (this.bioInput.value !== this.originalData.bio) {
        updates.bio = this.bioInput.value.trim();
      }
      if (this.signatureInput.value !== this.originalData.signature) {
        updates.signature = this.signatureInput.value.trim();
      }
      if (this.avatarChanged && this.avatarUploadedUrl) {
        updates.avatar = this.avatarUploadedUrl;
      }

      // 敏感词前端预检（昵称/签名）：命中则弹全屏警告，保留输入，不提交
      const blockHit = [updates.nickname, updates.signature]
        .filter(Boolean)
        .map(t => sensitiveWordService.check(t))
        .find(h => h.level > 0);
      if (blockHit) {
        this.setLoading(false);
        showContentWarnDialog();
        return;
      }

      // 持久化到 profiles 表（唯一权威数据源）：头像/昵称/简介/签名在此真正落地
      const response = await profileService.updateProfile(updates, this.currentUser.id);

      if (response.success) {
        // 同步 Auth user_metadata，避免与 profiles 数据源不一致（仅兜底，失败不阻断保存）
        try {
          await authService.updateUserMetadata(updates);
        } catch (e) {}

        this.originalData = {
          nickname: this.nicknameInput.value.trim(),
          bio: this.bioInput.value.trim(),
          signature: this.signatureInput.value.trim()
        };
        // 头像已持久化到 profiles，同步到当前用户并重置头像变更状态
        this.currentUser.avatar = this.avatarUploadedUrl || this.currentUser.avatar;
        this.avatarUploadedUrl = null;
        this.avatarChanged = false;
        this.avatarUploadStatus.textContent = '';
        this.profileNickname.textContent = this.nicknameInput.value.trim();
        this.showSnackbar('资料保存成功');
      } else {
        // 保存失败（如 Storage 已成功但 profiles 更新失败）：明确提示失败并保留可重试状态
        this.showSnackbar(response.error || '资料保存失败，请点击保存重试');
      }
    } catch (error) {
      this.showSnackbar('保存失败，请稍后重试');
    } finally {
      this.setLoading(false);
    }
  }

  hasChanges() {
    return this.avatarChanged ||
           this.nicknameInput.value.trim() !== this.originalData.nickname ||
           this.bioInput.value.trim() !== this.originalData.bio ||
           this.signatureInput.value.trim() !== this.originalData.signature;
  }

  resetForm() {
    const hadChanges = this.hasChanges();

    this.nicknameInput.value = this.originalData.nickname || '';
    this.bioInput.value = this.originalData.bio || '';
    this.signatureInput.value = this.originalData.signature || '';

    // 取消时回滚未保存的头像变更
    if (this.avatarChanged) {
      this.avatarImg.src = this.currentUser.avatar
        ? this.currentUser.avatar
        : `https://api.dicebear.com/7.x/avataaars/svg?seed=${this.currentUser.id}`;
      this.avatarUploadedUrl = null;
      this.avatarChanged = false;
      this.avatarUploadStatus.textContent = '';
    }

    this.updateCounter(this.bioInput, this.bioCounter);
    this.updateCounter(this.signatureInput, this.signatureCounter);
    
    this.nicknameError.textContent = '';
    this.bioError.textContent = '';
    this.signatureError.textContent = '';

    if (hadChanges) {
      this.showSnackbar('已恢复原状态');
    } else {
      this.goBack();
    }
  }

  async handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      this.showSnackbar('请选择图片文件');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      this.showSnackbar('图片大小不能超过5MB');
      return;
    }
    
    this.avatarUploadBtn.disabled = true;
    this.avatarUploadStatus.textContent = '上传中...';
    
    try {
      if (!this.currentUser) {
        this.showSnackbar('请先登录');
        return;
      }
      
      const response = await storageService.uploadAvatar(file, this.currentUser.id);

      if (response.success) {
        // 文件已上传到存储桶，先暂存 URL 并标记变更，随保存一起持久化 avatar 字段
        this.avatarUploadedUrl = response.data.url;
        this.avatarChanged = true;
        this.avatarImg.src = response.data.url;
        this.avatarUploadStatus.textContent = '图片已上传，点击保存生效';
        setTimeout(() => {
          if (!this.avatarChanged) {
            this.avatarUploadStatus.textContent = '';
          }
        }, 4000);
        this.showSnackbar('头像已选择，请点击保存');
      } else {
        this.avatarUploadStatus.textContent = '上传失败';
        this.showSnackbar(response.message || '头像上传失败');
      }
    } catch (error) {
      this.avatarUploadStatus.textContent = '上传失败';
      this.showSnackbar('头像上传失败');
    } finally {
      this.avatarUploadBtn.disabled = false;
      this.avatarFileInput.value = '';
    }
  }

  async handleLogout() {
    if (!confirm('确定要退出登录吗？')) {
      return;
    }
    
    this.logoutBtn.disabled = true;
    
    try {
      const response = await authService.logout();
      if (response.success) {
        this.redirectToLogin();
      } else {
        this.showSnackbar(response.message || '退出登录失败');
      }
    } catch (error) {
      this.showSnackbar('退出登录失败');
    } finally {
      this.logoutBtn.disabled = false;
    }
  }

  setLoading(isLoading) {
    if (isLoading) {
      this.saveBtn.classList.add('loading');
      this.saveBtn.disabled = true;
      this.cancelBtn.disabled = true;
      this.logoutBtn.disabled = true;
      this.avatarUploadBtn.disabled = true;
      this.nicknameInput.disabled = true;
      this.bioInput.disabled = true;
      this.signatureInput.disabled = true;
    } else {
      this.saveBtn.classList.remove('loading');
      this.saveBtn.disabled = false;
      this.cancelBtn.disabled = false;
      this.logoutBtn.disabled = false;
      this.avatarUploadBtn.disabled = false;
      this.nicknameInput.disabled = false;
      this.bioInput.disabled = false;
      this.signatureInput.disabled = false;
    }
  }

  showSnackbar(message) {
    this.snackbarLabel.textContent = message;
    this.snackbar.classList.add('show');
    
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
    }
    this.snackbarTimer = setTimeout(() => {
      this.hideSnackbar();
    }, 5000);
  }

  hideSnackbar() {
    this.snackbar.classList.remove('show');
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
      this.snackbarTimer = null;
    }
  }

  goBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'home.html';
    }
  }

  redirectToLogin() {
    window.location.href = 'login.html';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ProfilePage();
});