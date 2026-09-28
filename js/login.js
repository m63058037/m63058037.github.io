import { authService } from '../services/auth.js';
import { calculateCohort, escapeHtml } from '../utils/helpers.js';
import { getBranchOptions } from '../config/branches.js';

class LoginPage {
  constructor() {
    this.loginForm = document.getElementById('loginForm');
    this.loginButton = document.getElementById('loginButton');
    this.passwordInput = document.getElementById('password');
    this.passwordToggle = document.getElementById('passwordToggle');
    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');

    this.studentTypeGroup = document.getElementById('studentTypeGroup');
    this.branchSelect = document.getElementById('branch');
    this.gradeSelect = document.getElementById('grade');
    this.cohortInput = document.getElementById('cohort');
    this.cohortField = document.getElementById('cohortField');
    this.cohortHint = document.getElementById('cohortHint');
    this.classField = document.getElementById('classField');
    this.classNumberSelect = document.getElementById('classNumber');
    this.studentNumberField = document.getElementById('studentNumberField');
    this.studentNumberSelect = document.getElementById('studentNumberInput');

    this.studentTypeError = document.getElementById('studentTypeError');
    this.branchError = document.getElementById('branchError');
    this.gradeError = document.getElementById('gradeError');
    this.classNumberError = document.getElementById('classNumberError');
    this.studentNumberError = document.getElementById('studentNumberError');
    this.passwordError = document.getElementById('passwordError');

    this.accountSelectionModal = document.getElementById('accountSelectionModal');
    this.accountSelectionList = document.getElementById('accountSelectionList');
    this.accountSelectionCancel = document.getElementById('accountSelectionCancel');

    this.snackbarTimer = null;
    this.pendingAccounts = null;

    this.init();
  }

  async init() {
    try {
      await this.checkSession();
      await this.getCurrentUser();
      this.renderPage();
      this.bindEvents();
    } catch (error) {
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
    this.populateBranchOptions();
    this.populateClassOptions();
    this.populateStudentNumberOptions();
  }

  populateBranchOptions() {
    const options = getBranchOptions();
    this.branchSelect.innerHTML = '<option value="">请选择所属分校</option>';
    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      this.branchSelect.appendChild(option);
    });
  }

  populateClassOptions() {
    this.classNumberSelect.innerHTML = '<option value="">请选择班级</option>';
    for (let i = 1; i <= 20; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `${i}班`;
      this.classNumberSelect.appendChild(option);
    }
  }

  populateStudentNumberOptions() {
    this.studentNumberSelect.innerHTML = '<option value="">请选择学号</option>';
    for (let i = 1; i <= 50; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `${i}号`;
      this.studentNumberSelect.appendChild(option);
    }
  }

  bindEvents() {
    this.loginForm.addEventListener('submit', (e) => this.handleSubmit(e));

    this.studentTypeGroup.querySelectorAll('input[name="studentType"]').forEach(radio => {
      radio.addEventListener('change', () => this.onStudentTypeOrGradeChange());
    });

    this.gradeSelect.addEventListener('change', () => this.onStudentTypeOrGradeChange());

    this.passwordInput.addEventListener('input', () => this.validatePassword());
    this.passwordInput.addEventListener('blur', () => this.validatePassword());

    this.passwordToggle.addEventListener('click', () => this.togglePassword());

    if (this.snackbarAction) {
      this.snackbarAction.addEventListener('click', () => this.hideSnackbar());
    }

    this.accountSelectionCancel.addEventListener('click', () => this.hideAccountSelection());
  }

  getStudentType() {
    const checked = this.studentTypeGroup.querySelector('input[name="studentType"]:checked');
    return checked ? checked.value : '';
  }

  getGrade() {
    return this.gradeSelect.value;
  }

  getCohort() {
    const grade = this.getGrade();
    if (grade === '高中及以上') {
      const value = this.cohortInput.value.trim();
      const num = parseInt(value.replace(/[^0-9]/g, ''), 10);
      return (num && num >= 2000 && num <= 2100) ? num : null;
    }
    return calculateCohort(grade);
  }

  onStudentTypeOrGradeChange() {
    const studentType = this.getStudentType();
    const grade = this.getGrade();

    this.studentTypeError.textContent = '';
    this.gradeError.textContent = '';

    const isSchoolStudent = studentType === 'school';
    const isJuniorHigh = ['初一', '初二', '初三'].includes(grade);
    const isHighSchoolOrAbove = grade === '高中及以上';
    const needsClassAndNumber = isSchoolStudent && isJuniorHigh;

    if (isHighSchoolOrAbove) {
      this.cohortInput.value = '';
      this.cohortInput.placeholder = '请输入届次（如 2024）';
      this.cohortInput.readOnly = false;
      this.cohortInput.disabled = false;
      this.cohortHint.textContent = '高中及以上用户需手动填写届次';
    } else if (isJuniorHigh) {
      const cohort = calculateCohort(grade);
      this.cohortInput.value = cohort ? `${cohort}届` : '';
      this.cohortInput.placeholder = '选择年级后自动计算';
      this.cohortInput.readOnly = true;
      this.cohortInput.disabled = true;
      this.cohortHint.textContent = `${cohort}届（系统自动计算，不可修改）`;
    } else {
      this.cohortInput.value = '';
      this.cohortInput.placeholder = '请先选择年级';
      this.cohortInput.readOnly = true;
      this.cohortInput.disabled = true;
      this.cohortHint.textContent = '';
    }

    if (needsClassAndNumber) {
      this.classField.style.display = '';
      this.studentNumberField.style.display = '';
    } else {
      this.classField.style.display = 'none';
      this.studentNumberField.style.display = 'none';
      this.classNumberSelect.value = '';
      this.studentNumberSelect.value = '';
      this.classNumberError.textContent = '';
      this.studentNumberError.textContent = '';
    }
  }

  validateStudentType() {
    const studentType = this.getStudentType();
    if (!studentType) {
      this.studentTypeError.textContent = '请选择学生身份';
      return false;
    }
    this.studentTypeError.textContent = '';
    return true;
  }

  validateBranch() {
    if (!this.branchSelect.value) {
      this.branchError.textContent = '请选择所属分校';
      return false;
    }
    this.branchError.textContent = '';
    return true;
  }

  validateGrade() {
    const grade = this.getGrade();
    if (!grade) {
      this.gradeError.textContent = '请选择年级';
      return false;
    }
    this.gradeError.textContent = '';
    return true;
  }

  validateCohort() {
    const grade = this.getGrade();
    if (grade === '高中及以上') {
      const value = this.cohortInput.value.trim();
      if (!value) {
        this.cohortHint.textContent = '请填写届次';
        this.cohortHint.style.color = 'var(--md-sys-color-error)';
        return false;
      }
      const num = parseInt(value.replace(/[^0-9]/g, ''), 10);
      if (!num || num < 2000 || num > 2100) {
        this.cohortHint.textContent = '请输入有效的届次年份（如 2024）';
        this.cohortHint.style.color = 'var(--md-sys-color-error)';
        return false;
      }
      this.cohortHint.style.color = '';
      this.cohortHint.textContent = '';
      return true;
    }
    this.cohortHint.style.color = '';
    return true;
  }

  validateClassAndNumber() {
    const studentType = this.getStudentType();
    const grade = this.getGrade();
    const isSchoolStudent = studentType === 'school';
    const isJuniorHigh = ['初一', '初二', '初三'].includes(grade);

    if (!isSchoolStudent || !isJuniorHigh) {
      return true;
    }

    let valid = true;

    if (!this.classNumberSelect.value) {
      this.classNumberError.textContent = '请选择班级';
      valid = false;
    } else {
      this.classNumberError.textContent = '';
    }

    if (!this.studentNumberSelect.value) {
      this.studentNumberError.textContent = '请选择学号';
      valid = false;
    } else {
      this.studentNumberError.textContent = '';
    }

    return valid;
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

    const isStudentTypeValid = this.validateStudentType();
    const isBranchValid = this.validateBranch();
    const isGradeValid = this.validateGrade();
    const isCohortValid = this.validateCohort();
    const isClassAndNumberValid = this.validateClassAndNumber();
    const isPasswordValid = this.validatePassword();

    if (!isStudentTypeValid || !isBranchValid || !isGradeValid || !isCohortValid || !isClassAndNumberValid || !isPasswordValid) {
      return;
    }

    this.setLoading(true);

    try {
      const password = this.passwordInput.value;
      const identityData = {
        student_type: this.getStudentType(),
        branch: this.branchSelect.value,
        grade: this.getGrade(),
        cohort: this.getCohort(),
        class_number: this.classNumberSelect.value ? parseInt(this.classNumberSelect.value, 10) : null,
        student_number: this.studentNumberSelect.value ? parseInt(this.studentNumberSelect.value, 10) : null
      };

      const findResponse = await authService.findAccountsByIdentity(identityData);

      if (!findResponse.success) {
        this.showSnackbar(findResponse.message);
        return;
      }

      const accounts = findResponse.data;

      if (accounts.length === 1) {
        const loginResponse = await authService.login(accounts[0].uid, password);
        if (loginResponse.success) {
          this.redirectToHome();
        } else {
          this.showSnackbar(loginResponse.message);
        }
      } else {
        this.pendingAccounts = accounts;
        this.pendingPassword = password;
        this.showAccountSelection(accounts);
      }
    } catch (error) {
      console.error('[登录] 异常:', error.message);
      this.showSnackbar('登录失败，请稍后重试');
    } finally {
      this.setLoading(false);
    }
  }

  showAccountSelection(accounts) {
    this.accountSelectionList.innerHTML = '';

    accounts.forEach(account => {
      const item = document.createElement('div');
      item.className = 'account-selection-item';
      item.innerHTML = `
        <div class="account-item-avatar">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>
        <div class="account-item-info">
          <div class="account-item-name">${escapeHtml(account.nickname || '未知用户')}</div>
          <div class="account-item-uid">UID：${escapeHtml(account.uid)}</div>
        </div>
        <div class="account-item-arrow">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
        </div>
      `;

      item.addEventListener('click', () => this.selectAccount(account));
      this.accountSelectionList.appendChild(item);
    });

    this.accountSelectionModal.style.display = '';
  }

  hideAccountSelection() {
    this.accountSelectionModal.style.display = 'none';
    this.pendingAccounts = null;
    this.pendingPassword = null;
  }

  async selectAccount(account) {
    this.accountSelectionModal.style.display = 'none';

    const uid = account.uid;
    const password = this.pendingPassword;
    this.pendingPassword = null;

    this.setLoading(true);

    try {
      const loginResponse = await authService.login(uid, password);
      if (loginResponse.success) {
        this.redirectToHome();
      } else {
        this.showSnackbar(loginResponse.message);
      }
    } catch (error) {
      console.error('[登录] 账号选择后异常:', error.message);
      this.showSnackbar('登录失败，请稍后重试');
    } finally {
      this.setLoading(false);
    }
  }

  togglePassword() {
    const type = this.passwordInput.type === 'password' ? 'text' : 'password';
    this.passwordInput.type = type;

    const icon = this.passwordToggle.querySelector('.toggle-icon');
    if (!icon) return;
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
      const inputs = this.loginForm.querySelectorAll('input, select');
      inputs.forEach(input => input.disabled = true);
    } else {
      this.loginButton.classList.remove('loading');
      this.loginButton.disabled = false;
      const inputs = this.loginForm.querySelectorAll('input, select');
      inputs.forEach(input => {
        if (!this.isFieldAlwaysDisabled(input)) {
          input.disabled = false;
        }
      });
    }
  }

  isFieldAlwaysDisabled(input) {
    if (input.id === 'cohort') {
      const grade = this.getGrade();
      if (grade && grade !== '高中及以上') {
        return true;
      }
    }
    return false;
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

  redirectToHome() {
    window.location.href = 'home.html';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new LoginPage();
});
