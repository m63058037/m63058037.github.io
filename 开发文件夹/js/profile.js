import { authService } from '../services/auth.js';
import { storageService } from '../services/storage.js';

class ProfilePage {
  constructor() {
    this.profileForm = document.getElementById('profileForm');
    this.nicknameInput = document.getElementById('nickname');
    this.bioInput = document.getElementById('bio');
    this.signatureInput = document.getElementById('signature');
    this.saveBtn = document.getElementById('saveBtn');
    this.cancelBtn = document.getElementById('cancelBtn');
    this.logoutBtn = document.getElementById('logoutBtn');
    
    this.avatarImg = document.getElementById('avatarImg');
    this.avatarUploadBtn = document.getElementById('avatarUploadBtn');
    this.avatarFileInput = document.getElementById('avatarFileInput');
    this.avatarUploadStatus = document.getElementById('avatarUploadStatus');
    
    this.profileNickname = document.getElementById('profileNickname');
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
      console.error('Profile init error:', error);
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
      nickname: this.currentUser.nickname,
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
    
    this.updateCounter(this.bioInput, this.bioCounter);
    this.updateCounter(this.signatureInput, this.signatureCounter);
    
    if (this.currentUser.avatar) {
      this.avatarImg.src = this.currentUser.avatar;
    } else {
      this.avatarImg.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${this.currentUser.id}`;
    }
  }

  bindEvents() {
    this.profileForm.addEventListener('submit', (e) => this.handleSubmit(e));
    this.cancelBtn.addEventListener('click', () => this.handleCancel());
    this.logoutBtn.addEventListener('click', () => this.handleLogout());
    
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
      
      const response = await authService.updateUserMetadata(updates);
      
      if (response.success) {
        this.originalData = {
          nickname: this.nicknameInput.value.trim(),
          bio: this.bioInput.value.trim(),
          signature: this.signatureInput.value.trim()
        };
        this.profileNickname.textContent = this.nicknameInput.value.trim();
        this.showSnackbar('资料保存成功');
      } else {
        this.showSnackbar(response.message);
      }
    } catch (error) {
      console.error('Save profile error:', error);
      this.showSnackbar('保存失败，请稍后重试');
    } finally {
      this.setLoading(false);
    }
  }

  hasChanges() {
    return this.nicknameInput.value.trim() !== this.originalData.nickname ||
           this.bioInput.value.trim() !== this.originalData.bio ||
           this.signatureInput.value.trim() !== this.originalData.signature;
  }

  handleCancel() {
    if (this.hasChanges()) {
      if (!confirm('您有未保存的修改，确定要离开吗？')) {
        return;
      }
    }
    
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'home.html';
    }
  }

  resetForm() {
    this.nicknameInput.value = this.originalData.nickname;
    this.bioInput.value = this.originalData.bio;
    this.signatureInput.value = this.originalData.signature;
    
    this.updateCounter(this.bioInput, this.bioCounter);
    this.updateCounter(this.signatureInput, this.signatureCounter);
    
    this.nicknameError.textContent = '';
    this.bioError.textContent = '';
    this.signatureError.textContent = '';
  }

  async handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    this.avatarUploadStatus.textContent = '上传中...';
    
    try {
      if (!this.currentUser) {
        this.showSnackbar('请先登录');
        return;
      }
      
      const response = await storageService.uploadAvatar(file, this.currentUser.id);
      
      if (response.success) {
        const updateResponse = await authService.updateUserMetadata({ avatar: response.data.url });
        
        if (updateResponse.success) {
          this.avatarImg.src = response.data.url;
          this.avatarUploadStatus.textContent = '上传成功';
          setTimeout(() => {
            this.avatarUploadStatus.textContent = '';
          }, 2000);
          this.showSnackbar('头像更新成功');
        } else {
          this.avatarUploadStatus.textContent = '上传失败';
          this.showSnackbar(updateResponse.message);
        }
      } else {
        this.avatarUploadStatus.textContent = '上传失败';
        this.showSnackbar(response.message);
      }
    } catch (error) {
      console.error('Avatar upload error:', error);
      this.avatarUploadStatus.textContent = '上传失败';
      this.showSnackbar('头像上传失败');
    }
  }

  async handleLogout() {
    if (!confirm('确定要退出登录吗？')) {
      return;
    }
    
    try {
      const response = await authService.logout();
      if (response.success) {
        this.redirectToLogin();
      } else {
        this.showSnackbar(response.message);
      }
    } catch (error) {
      console.error('Logout error:', error);
      this.showSnackbar('退出登录失败');
    }
  }

  setLoading(isLoading) {
    if (isLoading) {
      this.saveBtn.classList.add('loading');
      this.saveBtn.disabled = true;
      this.cancelBtn.disabled = true;
      this.nicknameInput.disabled = true;
      this.bioInput.disabled = true;
      this.signatureInput.disabled = true;
    } else {
      this.saveBtn.classList.remove('loading');
      this.saveBtn.disabled = false;
      this.cancelBtn.disabled = false;
      this.nicknameInput.disabled = false;
      this.bioInput.disabled = false;
      this.signatureInput.disabled = false;
    }
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

  redirectToLogin() {
    window.location.href = 'login.html';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ProfilePage();
});