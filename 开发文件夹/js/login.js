import { authService } from '../services/auth.js';

class LoginPage {
  constructor() {
    this.loginForm = document.getElementById('loginForm');
    this.uidInput = document.getElementById('uid');
    this.passwordInput = document.getElementById('password');
    this.loginButton = document.getElementById('loginButton');
    this.passwordToggle = document.getElementById('passwordToggle');
    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');
    this.uidError = document.getElementById('uidError');
    this.passwordError = document.getElementById('passwordError');

    this.init();
  }

  async init() {
    try {
      await this.checkSession();
      await this.getCurrentUser();
      this.renderPage();
      this.bindEvents();
    } catch (error) {
      console.error('Login init error:', error);
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
    this.loginForm.addEventListener('submit', (e) => this.handleSubmit(e));
    
    this.uidInput.addEventListener('input', () => this.validateUid());
    this.uidInput.addEventListener('blur', () => this.validateUid());
    
    this.passwordInput.addEventListener('input', () => this.validatePassword());
    this.passwordInput.addEventListener('blur', () => this.validatePassword());
    
    this.passwordToggle.addEventListener('click', () => this.togglePassword());
    
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
        this.loginForm.dispatchEvent(new Event('submit'));
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
    
    this.passwordError.textContent = '';
    return true;
  }

  async handleSubmit(e) {
    e.preventDefault();
    
    const isUidValid = this.validateUid();
    const isPasswordValid = this.validatePassword();
    
    if (!isUidValid || !isPasswordValid) {
      return;
    }
    
    this.setLoading(true);
    
    try {
      const uid = this.uidInput.value.trim();
      const password = this.passwordInput.value;
      
      const response = await authService.login(uid, password);
      
      if (response.success) {
        this.redirectToHome();
      } else {
        this.showSnackbar(response.message);
      }
    } catch (error) {
      console.error('Login error:', error);
      this.showSnackbar('登录失败，请稍后重试');
    } finally {
      this.setLoading(false);
    }
  }

  togglePassword() {
    const type = this.passwordInput.type === 'password' ? 'text' : 'password';
    this.passwordInput.type = type;
    
    const icon = this.passwordToggle.querySelector('.toggle-icon');
    if (type === 'password') {
      icon.innerHTML = '<path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>';
    } else {
      icon.innerHTML = '<path d="M17.9 17.39A7 7 0 0 1 10 15.2v1.7c-2.2.35-4.18 1.35-5.66 2.75L2.7 21l1.39-1.39c1.2-1.2 2.2-2.58 2.9-4.11a10.16 10.16 0 0 0 2.76-.76v1.3a8 8 0 0 0 11.96 6.92l1.4-1.42a9.96 9.96 0 0 0 2.86-11.18l-1.42 1.42zM12 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0-6a4 4 0 0 0-3.95 3h7.9a4 4 0 0 0-.05-3z"/>';
    }
  }

  setLoading(isLoading) {
    if (isLoading) {
      this.loginButton.classList.add('loading');
      this.loginButton.disabled = true;
      this.uidInput.disabled = true;
      this.passwordInput.disabled = true;
    } else {
      this.loginButton.classList.remove('loading');
      this.loginButton.disabled = false;
      this.uidInput.disabled = false;
      this.passwordInput.disabled = false;
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

  redirectToHome() {
    window.location.href = 'home.html';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new LoginPage();
});