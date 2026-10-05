import { authService } from '../services/auth.js';

class ForgotPasswordPage {
  constructor() {
    this.stepInput = document.getElementById('stepInput');
    this.stepPending = document.getElementById('stepPending');
    this.stepApproved = document.getElementById('stepApproved');
    this.stepRejected = document.getElementById('stepRejected');
    this.stepSuccess = document.getElementById('stepSuccess');

    this.fpUidInput = document.getElementById('fpUid');
    this.fpUidError = document.getElementById('fpUidError');
    this.requestResetBtn = document.getElementById('requestResetBtn');

    this.checkStatusBtn = document.getElementById('checkStatusBtn');

    this.newPasswordInput = document.getElementById('newPassword');
    this.confirmNewPasswordInput = document.getElementById('confirmNewPassword');
    this.newPasswordError = document.getElementById('newPasswordError');
    this.confirmNewPasswordError = document.getElementById('confirmNewPasswordError');
    this.newPasswordToggle = document.getElementById('newPasswordToggle');
    this.confirmNewPasswordToggle = document.getElementById('confirmNewPasswordToggle');
    this.resetPasswordBtn = document.getElementById('resetPasswordBtn');

    this.retryRequestBtn = document.getElementById('retryRequestBtn');

    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');

    this.strengthSegments = [
      document.getElementById('newStrength1'),
      document.getElementById('newStrength2'),
      document.getElementById('newStrength3'),
      document.getElementById('newStrength4')
    ];
    this.strengthText = document.getElementById('newStrengthText');

    this.currentUid = '';
    this.snackbarTimer = null;

    this.init();
  }

  isResetEligible(data) {
    if (!data || data.status !== 'approved') {
      return false;
    }
    if (!data.expires_at) {
      return false;
    }
    const expires = new Date(data.expires_at);
    if (Number.isNaN(expires.getTime())) {
      return false;
    }
    return expires.getTime() > Date.now();
  }

  init() {
    this.bindEvents();
    this.fpUidInput.focus();
  }

  bindEvents() {
    this.requestResetBtn.addEventListener('click', () => this.handleRequest());
    this.checkStatusBtn.addEventListener('click', () => this.checkStatus());
    this.retryRequestBtn.addEventListener('click', () => this.showStep('stepInput'));
    this.resetPasswordBtn.addEventListener('click', () => this.handleResetPassword());

    this.fpUidInput.addEventListener('input', () => this.validateUid());
    this.fpUidInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleRequest();
      }
    });

    this.newPasswordInput.addEventListener('input', () => {
      this.validateNewPassword();
      this.updatePasswordStrength();
    });
    this.confirmNewPasswordInput.addEventListener('input', () => this.validateConfirmNewPassword());

    this.newPasswordToggle.addEventListener('click', () => this.togglePassword(this.newPasswordInput, this.newPasswordToggle));
    this.confirmNewPasswordToggle.addEventListener('click', () => this.togglePassword(this.confirmNewPasswordInput, this.confirmNewPasswordToggle));

    if (this.snackbarAction) {
      this.snackbarAction.addEventListener('click', () => this.hideSnackbar());
    }
  }

  showStep(stepId) {
    [this.stepInput, this.stepPending, this.stepApproved, this.stepRejected, this.stepSuccess].forEach(step => {
      step.style.display = 'none';
    });
    const target = document.getElementById(stepId);
    if (target) target.style.display = '';
  }

  validateUid() {
    const uid = this.fpUidInput.value.trim();
    if (!uid) {
      this.fpUidError.textContent = '';
      return false;
    }
    if (!/^\d{8}$/.test(uid)) {
      this.fpUidError.textContent = '请输入8位数字UID';
      return false;
    }
    this.fpUidError.textContent = '';
    return true;
  }

  async handleRequest() {
    if (!this.validateUid()) return;

    this.currentUid = this.fpUidInput.value.trim();
    this.requestResetBtn.disabled = true;
    this.requestResetBtn.querySelector('.button-text').textContent = '处理中...';

    try {
      const statusResponse = await authService.checkPasswordResetStatus(this.currentUid);

      if (statusResponse.success && statusResponse.data) {
        const status = statusResponse.data.status;
        if (status === 'pending') {
          this.showStep('stepPending');
          this.showSnackbar('您已有待处理的请求，请等待管理员处理');
          return;
        }
        if (status === 'approved') {
          if (this.isResetEligible(statusResponse.data)) {
            this.showStep('stepApproved');
            return;
          }
          this.showStep('stepInput');
          this.showSnackbar('重置资格已过期，请重新申请');
          return;
        }
        if (status === 'rejected') {
          this.showStep('stepRejected');
          return;
        }
        if (status === 'completed') {
          this.showStep('stepInput');
          this.showSnackbar('您之前的请求已完成，请重新申请');
          return;
        }
      }

      const response = await authService.forgotPassword(this.currentUid);

      if (response.success) {
        this.showStep('stepPending');
        this.showSnackbar(response.message);
      } else {
        this.showSnackbar(response.message || '请求失败，请稍后重试');
      }
    } catch (error) {
      this.showSnackbar('网络异常，请稍后重试');
    } finally {
      this.requestResetBtn.disabled = false;
      this.requestResetBtn.querySelector('.button-text').textContent = '向管理员验证身份';
    }
  }

  async checkStatus() {
    if (!this.currentUid) return;

    this.checkStatusBtn.disabled = true;
    this.checkStatusBtn.querySelector('.button-text').textContent = '检查中...';

    try {
      const response = await authService.checkPasswordResetStatus(this.currentUid);

      if (response.success && response.data) {
        const status = response.data.status;
        if (status === 'approved') {
          if (this.isResetEligible(response.data)) {
            this.showStep('stepApproved');
          } else {
            this.showStep('stepInput');
            this.showSnackbar('重置资格已过期，请重新申请');
          }
        } else if (status === 'rejected') {
          this.showStep('stepRejected');
        } else if (status === 'pending') {
          this.showSnackbar('管理员尚未处理，请耐心等待');
        } else {
          this.showStep('stepInput');
          this.showSnackbar('请求状态已变化，请重新操作');
        }
      } else {
        this.showStep('stepInput');
        this.showSnackbar('未找到请求记录，请重新申请');
      }
    } catch (error) {
      this.showSnackbar('网络异常，请稍后重试');
    } finally {
      this.checkStatusBtn.disabled = false;
      this.checkStatusBtn.querySelector('.button-text').textContent = '检查处理状态';
    }
  }

  validateNewPassword() {
    const password = this.newPasswordInput.value;
    if (!password) {
      this.newPasswordError.textContent = '';
      return false;
    }
    const letterCount = (password.match(/[a-zA-Z]/g) || []).length;
    const digitCount = (password.match(/[0-9]/g) || []).length;
    if (letterCount < 2) {
      this.newPasswordError.textContent = '密码至少需要2个英文字母';
      return false;
    }
    if (digitCount < 6) {
      this.newPasswordError.textContent = '密码至少需要6个数字';
      return false;
    }
    this.newPasswordError.textContent = '';
    return true;
  }

  validateConfirmNewPassword() {
    const password = this.newPasswordInput.value;
    const confirmPassword = this.confirmNewPasswordInput.value;
    if (!confirmPassword) {
      this.confirmNewPasswordError.textContent = '';
      return false;
    }
    if (password !== confirmPassword) {
      this.confirmNewPasswordError.textContent = '两次输入的密码不一致';
      return false;
    }
    this.confirmNewPasswordError.textContent = '';
    return true;
  }

  updatePasswordStrength() {
    const password = this.newPasswordInput.value;
    let strength = 0;

    const letterCount = (password.match(/[a-zA-Z]/g) || []).length;
    const digitCount = (password.match(/[0-9]/g) || []).length;
    const specialCount = (password.match(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/g) || []).length;

    if (letterCount >= 2 && digitCount >= 6) strength++;
    if (password.length >= 10) strength++;
    if (letterCount >= 3 || digitCount >= 8) strength++;
    if (specialCount > 0) strength++;

    this.strengthSegments.forEach((segment, index) => {
      segment.className = 'strength-segment';
      if (index < strength) {
        segment.classList.add(`strength-${strength}`);
      }
    });

    const strengthLabels = ['', '弱', '一般', '强', '非常强'];
    const strengthColors = ['', 'var(--md-sys-color-error)', 'var(--md-sys-color-warning)', 'var(--md-sys-color-primary)', 'var(--md-sys-color-primary)'];

    if (password) {
      this.strengthText.textContent = strengthLabels[strength] || '';
      this.strengthText.style.color = strengthColors[strength] || '';
    } else {
      this.strengthText.textContent = '';
    }
  }

  async handleResetPassword() {
    const isPasswordValid = this.validateNewPassword();
    const isConfirmValid = this.validateConfirmNewPassword();

    if (!isPasswordValid || !isConfirmValid) return;

    this.resetPasswordBtn.disabled = true;
    this.resetPasswordBtn.querySelector('.button-text').textContent = '重置中...';

    try {
      const statusResponse = await authService.checkPasswordResetStatus(this.currentUid);
      if (!statusResponse.success || !this.isResetEligible(statusResponse.data)) {
        this.showStep('stepInput');
        this.showSnackbar('重置资格无效或已过期，请重新申请');
        return;
      }

      const newPassword = this.newPasswordInput.value;
      const response = await authService.resetPasswordWithApproval(this.currentUid, newPassword);

      if (response.success) {
        this.showStep('stepSuccess');
      } else {
        this.showSnackbar(response.message || '密码重置失败');
      }
    } catch (error) {
      this.showSnackbar('网络异常，请稍后重试');
    } finally {
      this.resetPasswordBtn.disabled = false;
      this.resetPasswordBtn.querySelector('.button-text').textContent = '重置密码';
    }
  }

  togglePassword(input, toggleButton) {
    const type = input.type === 'password' ? 'text' : 'password';
    input.type = type;
    const icon = toggleButton.querySelector('.toggle-icon');
    if (!icon) return;
    if (type === 'password') {
      icon.innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
    } else {
      icon.innerHTML = '<path d="M17.9 17.39A7 7 0 0 1 10 15.2v1.7c-2.2.35-4.18 1.35-5.66 2.75L2.7 21l1.39-1.39c1.2-1.2 2.2-2.58 2.9-4.11a10.16 10.16 0 0 0 2.76-.76v1.3a8 8 0 0 0 11.96 6.92l1.4-1.42a9.96 9.96 0 0 0 2.86-11.18l-1.42 1.42zM12 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0-6a4 4 0 0 0-3.95 3h7.9a4 4 0 0 0-.05-3z"/>';
    }
  }

  showSnackbar(message) {
    if (this.snackbarTimer) clearTimeout(this.snackbarTimer);
    this.snackbarLabel.textContent = message;
    this.snackbar.classList.add('show');
    this.snackbarTimer = setTimeout(() => this.hideSnackbar(), 5000);
  }

  hideSnackbar() {
    this.snackbar.classList.remove('show');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ForgotPasswordPage();
});
