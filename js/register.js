import { authService } from '../services/auth.js';

class RegisterPage {
  constructor() {
    this.registerForm = document.getElementById('registerForm');
    this.uidInput = document.getElementById('uid');
    this.passwordInput = document.getElementById('password');
    this.confirmPasswordInput = document.getElementById('confirmPassword');
    this.nicknameInput = document.getElementById('nickname');
    this.agreeTermsCheckbox = document.getElementById('agreeTerms');
    this.registerButton = document.getElementById('registerButton');
    this.passwordToggle = document.getElementById('passwordToggle');
    this.confirmPasswordToggle = document.getElementById('confirmPasswordToggle');
    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');
    
    this.uidError = document.getElementById('uidError');
    this.passwordError = document.getElementById('passwordError');
    this.confirmPasswordError = document.getElementById('confirmPasswordError');
    this.nicknameError = document.getElementById('nicknameError');
    this.termsError = document.getElementById('termsError');
    
    this.strengthSegments = [
      document.getElementById('strength1'),
      document.getElementById('strength2'),
      document.getElementById('strength3'),
      document.getElementById('strength4')
    ];
    this.strengthText = document.getElementById('strengthText');

    this.init();
  }

  async init() {
    try {
      await this.checkSession();
      await this.getCurrentUser();
      this.renderPage();
      this.bindEvents();
    } catch (error) {
      console.error('Register init error:', error);
    }
  }

  async checkSession() {
    const isLoggedIn = await authService.isLoggedIn();
    if (isLoggedIn) {
      this.redirectToHome();
      throw new Error('User already logged in');
    }
  }

  async getCurrentUser() {
    const response = await authService.getCurrentUser();
    if (response.success) {
      this.redirectToHome();
      throw new Error('User already logged in');
    }
  }

  renderPage() {
    this.uidInput.focus();
  }

  bindEvents() {
    this.registerForm.addEventListener('submit', (e) => this.handleSubmit(e));
    
    this.uidInput.addEventListener('input', () => this.validateUid());
    this.uidInput.addEventListener('blur', () => this.validateUid());
    
    this.passwordInput.addEventListener('input', () => {
      this.validatePassword();
      this.validateConfirmPassword();
      this.updatePasswordStrength();
    });
    this.passwordInput.addEventListener('blur', () => this.validatePassword());
    
    this.confirmPasswordInput.addEventListener('input', () => this.validateConfirmPassword());
    this.confirmPasswordInput.addEventListener('blur', () => this.validateConfirmPassword());
    
    this.nicknameInput.addEventListener('input', () => this.validateNickname());
    this.nicknameInput.addEventListener('blur', () => this.validateNickname());
    
    this.agreeTermsCheckbox.addEventListener('change', () => this.validateTerms());
    
    this.passwordToggle.addEventListener('click', () => this.togglePassword(this.passwordInput, this.passwordToggle));
    this.confirmPasswordToggle.addEventListener('click', () => this.togglePassword(this.confirmPasswordInput, this.confirmPasswordToggle));
    
    this.snackbarAction.addEventListener('click', () => this.hideSnackbar());

    this.uidInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.passwordInput.focus();
      }
    });

    this.passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmPasswordInput.focus();
      }
    });

    this.confirmPasswordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.nicknameInput.focus();
      }
    });

    this.nicknameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.registerForm.dispatchEvent(new Event('submit'));
      }
    });
  }

  validateUid() {
    const uid = this.uidInput.value.trim();
    
    if (!uid) {
      this.uidError.textContent = '';
      return false;
    }
    
    if (!/^\d{8}$/.test(uid)) {
      this.uidError.textContent = '请输入8位数字UID';
      return false;
    }
    
    this.uidError.textContent = '';
    return true;
  }

  validatePassword() {
    const password = this.passwordInput.value;
    
    if (!password) {
      this.passwordError.textContent = '';
      return false;
    }
    
    if (password.length < 6) {
      this.passwordError.textContent = '密码至少需要6个字符';
      return false;
    }
    
    if (!/[a-zA-Z]/.test(password)) {
      this.passwordError.textContent = '密码至少包含一个字母';
      return false;
    }
    
    this.passwordError.textContent = '';
    return true;
  }

  validateConfirmPassword() {
    const password = this.passwordInput.value;
    const confirmPassword = this.confirmPasswordInput.value;
    
    if (!confirmPassword) {
      this.confirmPasswordError.textContent = '';
      return false;
    }
    
    if (password !== confirmPassword) {
      this.confirmPasswordError.textContent = '两次输入的密码不一致';
      return false;
    }
    
    this.confirmPasswordError.textContent = '';
    return true;
  }

  validateNickname() {
    const nickname = this.nicknameInput.value.trim();
    
    if (!nickname) {
      this.nicknameError.textContent = '';
      return true;
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

  validateTerms() {
    if (!this.agreeTermsCheckbox.checked) {
      this.termsError.textContent = '请先阅读并同意用户协议和隐私政策';
      return false;
    }
    
    this.termsError.textContent = '';
    return true;
  }

  updatePasswordStrength() {
    const password = this.passwordInput.value;
    let strength = 0;
    
    if (password.length >= 6) strength++;
    if (password.length >= 8) strength++;
    if (/[a-zA-Z]/.test(password) && /[0-9]/.test(password)) strength++;
    if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) strength++;
    
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

  async handleSubmit(e) {
    e.preventDefault();
    
    const isUidValid = this.validateUid();
    const isPasswordValid = this.validatePassword();
    const isConfirmPasswordValid = this.validateConfirmPassword();
    const isNicknameValid = this.validateNickname();
    const isTermsValid = this.validateTerms();
    
    if (!isUidValid || !isPasswordValid || !isConfirmPasswordValid || !isNicknameValid || !isTermsValid) {
      return;
    }
    
    this.setLoading(true);
    
    try {
      const uid = this.uidInput.value.trim();
      const password = this.passwordInput.value;
      const nickname = this.nicknameInput.value.trim();
      
      const response = await authService.register(uid, password, nickname);
      
      if (response.success) {
        this.showSuccessSnackbar('注册成功！');
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 2000);
      } else {
        const errorMessage = this.mapErrorMessage(response.message);
        this.showSnackbar(errorMessage);
      }
    } catch (error) {
      console.error('Register error:', error);
      this.showSnackbar('网络异常，请稍后重试');
    } finally {
      this.setLoading(false);
    }
  }

  mapErrorMessage(message) {
    if (message.includes('email') && message.includes('already')) {
      return '该UID已被注册';
    }
    if (message.includes('password') && (message.includes('short') || message.includes('6'))) {
      return '密码至少需要6个字符';
    }
    if (message.includes('network') || message.includes('fetch')) {
      return '网络异常，请检查网络连接';
    }
    return message;
  }

  togglePassword(input, toggleButton) {
    const type = input.type === 'password' ? 'text' : 'password';
    input.type = type;
    
    const icon = toggleButton.querySelector('.toggle-icon');
    if (type === 'password') {
      icon.innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
    } else {
      icon.innerHTML = '<path d="M17.9 17.39A7 7 0 0 1 10 15.2v1.7c-2.2.35-4.18 1.35-5.66 2.75L2.7 21l1.39-1.39c1.2-1.2 2.2-2.58 2.9-4.11a10.16 10.16 0 0 0 2.76-.76v1.3a8 8 0 0 0 11.96 6.92l1.4-1.42a9.96 9.96 0 0 0 2.86-11.18l-1.42 1.42zM12 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0-6a4 4 0 0 0-3.95 3h7.9a4 4 0 0 0-.05-3z"/>';
    }
  }

  setLoading(isLoading) {
    if (isLoading) {
      this.registerButton.classList.add('loading');
      this.registerButton.disabled = true;
      this.uidInput.disabled = true;
      this.passwordInput.disabled = true;
      this.confirmPasswordInput.disabled = true;
      this.nicknameInput.disabled = true;
      this.agreeTermsCheckbox.disabled = true;
    } else {
      this.registerButton.classList.remove('loading');
      this.registerButton.disabled = false;
      this.uidInput.disabled = false;
      this.passwordInput.disabled = false;
      this.confirmPasswordInput.disabled = false;
      this.nicknameInput.disabled = false;
      this.agreeTermsCheckbox.disabled = false;
    }
  }

  showSnackbar(message) {
    this.snackbarLabel.textContent = message;
    this.snackbar.classList.add('show');
    
    setTimeout(() => {
      this.hideSnackbar();
    }, 5000);
  }

  showSuccessSnackbar(message) {
    this.snackbarLabel.textContent = message;
    this.snackbar.classList.add('show');
  }

  hideSnackbar() {
    this.snackbar.classList.remove('show');
  }

  redirectToHome() {
    window.location.href = 'home.html';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new RegisterPage();
});