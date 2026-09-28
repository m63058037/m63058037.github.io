import { authService } from '../services/auth.js';
import { escapeHtml, calculateCohort } from '../utils/helpers.js';
import { USER_AGREEMENT_TEXT, PRIVACY_POLICY_TEXT } from './agreement-data.js';
import { getBranchOptions } from '../config/branches.js';
import { sensitiveWordService } from '../services/sensitive-word.js';
import { showContentWarnDialog } from '../components/content-warn-dialog.js';

class RegisterPage {
  constructor() {
    this.registerForm = document.getElementById('registerForm');
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

    this.passwordError = document.getElementById('passwordError');
    this.confirmPasswordError = document.getElementById('confirmPasswordError');
    this.nicknameError = document.getElementById('nicknameError');
    this.termsError = document.getElementById('termsError');
    this.userAgreementLink = document.getElementById('userAgreementLink');
    this.privacyPolicyLink = document.getElementById('privacyPolicyLink');

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

    this.strengthSegments = [
      document.getElementById('strength1'),
      document.getElementById('strength2'),
      document.getElementById('strength3'),
      document.getElementById('strength4')
    ];
    this.strengthText = document.getElementById('strengthText');

    this.uidResultModal = document.getElementById('uidResultModal');
    this.uidDisplay = document.getElementById('uidDisplay');
    this.uidResultConfirm = document.getElementById('uidResultConfirm');

    this.duplicateIdentityModal = document.getElementById('duplicateIdentityModal');
    this.duplicateCancel = document.getElementById('duplicateCancel');
    this.duplicateConfirm = document.getElementById('duplicateConfirm');

    this.snackbarTimer = null;
    this.duplicateConfirmed = false;

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
    this.nicknameInput.focus();
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
    const select = this.classNumberSelect;
    select.innerHTML = '<option value="">请选择班级</option>';
    for (let i = 1; i <= 20; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `${i}班`;
      select.appendChild(option);
    }
  }

  populateStudentNumberOptions() {
    const select = this.studentNumberSelect;
    select.innerHTML = '<option value="">请选择学号</option>';
    for (let i = 1; i <= 50; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `${i}号`;
      select.appendChild(option);
    }
  }

  bindEvents() {
    this.registerForm.addEventListener('submit', (e) => this.handleSubmit(e));

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

    this.studentTypeGroup.querySelectorAll('input[name="studentType"]').forEach(radio => {
      radio.addEventListener('change', () => this.onStudentTypeOrGradeChange());
    });

    this.gradeSelect.addEventListener('change', () => this.onStudentTypeOrGradeChange());

    if (this.snackbarAction) {
      this.snackbarAction.addEventListener('click', () => this.hideSnackbar());
    }

    this.userAgreementLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.showDocumentModal('用户协议', USER_AGREEMENT_TEXT);
    });

    this.privacyPolicyLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.showDocumentModal('隐私政策', PRIVACY_POLICY_TEXT);
    });

    this.uidResultConfirm.addEventListener('click', () => {
      this.uidResultModal.style.display = 'none';
      window.location.href = 'login.html';
    });

    this.duplicateCancel.addEventListener('click', () => {
      this.duplicateIdentityModal.style.display = 'none';
      this.duplicateConfirmed = false;
    });

    this.duplicateConfirm.addEventListener('click', () => {
      this.duplicateIdentityModal.style.display = 'none';
      this.duplicateConfirmed = true;
      this.doRegister();
    });
  }

  getStudentType() {
    const checked = this.studentTypeGroup.querySelector('input[name="studentType"]:checked');
    return checked ? checked.value : '';
  }

  getGrade() {
    return this.gradeSelect.value;
  }

  getBranch() {
    return this.branchSelect.value;
  }

  calculateCohort(grade) {
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
      const cohort = this.calculateCohort(grade);
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
    const branch = this.getBranch();
    if (!branch) {
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

    const letterCount = (password.match(/[a-zA-Z]/g) || []).length;
    const digitCount = (password.match(/[0-9]/g) || []).length;

    if (letterCount < 2) {
      this.passwordError.textContent = '密码至少需要2个英文字母';
      return false;
    }

    if (digitCount < 6) {
      this.passwordError.textContent = '密码至少需要6个数字';
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
      this.nicknameError.textContent = '请输入名称';
      return false;
    }

    if (nickname.length < 2) {
      this.nicknameError.textContent = '名称至少需要2个字符';
      return false;
    }

    if (nickname.length > 50) {
      this.nicknameError.textContent = '名称不能超过50个字符';
      return false;
    }

    if (!/^[\u4e00-\u9fa5a-zA-Z0-9_]+$/.test(nickname)) {
      this.nicknameError.textContent = '名称只能包含中文、英文、数字和下划线';
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

  async handleSubmit(e) {
    e.preventDefault();

    const isStudentTypeValid = this.validateStudentType();
    const isBranchValid = this.validateBranch();
    const isGradeValid = this.validateGrade();
    const isCohortValid = this.validateCohort();
    const isClassAndNumberValid = this.validateClassAndNumber();
    const isPasswordValid = this.validatePassword();
    const isConfirmPasswordValid = this.validateConfirmPassword();
    const isNicknameValid = this.validateNickname();
    const isTermsValid = this.validateTerms();

    if (!isStudentTypeValid || !isBranchValid || !isGradeValid || !isCohortValid ||
        !isClassAndNumberValid || !isPasswordValid || !isConfirmPasswordValid ||
        !isNicknameValid || !isTermsValid) {
      return;
    }

    this.duplicateConfirmed = false;

    if (this.needsDuplicateCheck()) {
      const isDuplicate = await this.checkDuplicateIdentity();
      if (isDuplicate) {
        this.duplicateIdentityModal.style.display = '';
        return;
      }
    }

    await this.doRegister();
  }

  needsDuplicateCheck() {
    const studentType = this.getStudentType();
    const grade = this.getGrade();
    return studentType === 'school' && ['初一', '初二', '初三'].includes(grade);
  }

  async checkDuplicateIdentity() {
    try {
      const branch = this.getBranch();
      const grade = this.getGrade();
      const cohort = this.calculateCohort(grade);
      const classNumber = this.classNumberSelect.value ? parseInt(this.classNumberSelect.value, 10) : null;
      const studentNumber = this.studentNumberSelect.value ? parseInt(this.studentNumberSelect.value, 10) : null;

      const response = await authService.checkDuplicateIdentity({
        branch, grade, cohort, class_number: classNumber, student_number: studentNumber
      });

      return response.success && response.data === true;
    } catch (error) {
      return false;
    }
  }

  async doRegister() {
    this.setLoading(true);
    let shouldKeepLoading = false;

    try {
      const password = this.passwordInput.value;
      const nickname = this.nicknameInput.value.trim();

      // 敏感词前端预检（昵称）：命中则弹全屏警告，保留输入，不提交
      if (nickname && sensitiveWordService.check(nickname).level > 0) {
        this.setLoading(false);
        showContentWarnDialog();
        return;
      }

      const studentType = this.getStudentType();
      const branch = this.getBranch();
      const grade = this.getGrade();

      let cohort = null;
      if (grade === '高中及以上') {
        cohort = parseInt(this.cohortInput.value.trim().replace(/[^0-9]/g, ''), 10);
      } else {
        cohort = this.calculateCohort(grade);
      }

      let classNumber = null;
      let studentNumber = null;
      if (studentType === 'school' && ['初一', '初二', '初三'].includes(grade)) {
        classNumber = this.classNumberSelect.value ? parseInt(this.classNumberSelect.value, 10) : null;
        studentNumber = this.studentNumberSelect.value ? parseInt(this.studentNumberSelect.value, 10) : null;
      }

      const response = await authService.register(password, nickname, {
        student_type: studentType,
        branch,
        grade,
        cohort,
        class_number: classNumber,
        student_number: studentNumber
      });

      if (response.success) {
        shouldKeepLoading = true;
        const uid = response.data.uid;
        this.uidDisplay.textContent = uid;
        this.uidResultModal.style.display = '';
      } else {
        const errorMessage = this.mapErrorMessage(response.message);
        this.showSnackbar(errorMessage);
      }
    } catch (error) {
      this.showSnackbar('网络异常，请稍后重试');
    } finally {
      if (!shouldKeepLoading) {
        this.setLoading(false);
      }
    }
  }

  mapErrorMessage(message) {
    if (message.includes('email') && message.includes('already')) {
      return '注册失败，该账号可能已存在，请重试';
    }
    if (message.includes('duplicate key') || message.includes('unique constraint') || message.includes('idx_profiles_uid_unique')) {
      return 'UID冲突，请重试注册';
    }
    if (message.includes('UID') && message.includes('生成')) {
      return 'UID生成失败，请重试';
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
    if (!icon) return;
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
      this.passwordInput.disabled = true;
      this.confirmPasswordInput.disabled = true;
      this.nicknameInput.disabled = true;
      this.agreeTermsCheckbox.disabled = true;
      this.gradeSelect.disabled = true;
      this.branchSelect.disabled = true;
      this.cohortInput.disabled = true;
      this.classNumberSelect.disabled = true;
      this.studentNumberSelect.disabled = true;
      this.studentTypeGroup.querySelectorAll('input').forEach(r => r.disabled = true);
    } else {
      this.registerButton.classList.remove('loading');
      this.registerButton.disabled = false;
      this.passwordInput.disabled = false;
      this.confirmPasswordInput.disabled = false;
      this.nicknameInput.disabled = false;
      this.agreeTermsCheckbox.disabled = false;
      this.gradeSelect.disabled = false;
      this.branchSelect.disabled = false;
      const grade = this.getGrade();
      if (grade !== '高中及以上') {
        this.cohortInput.disabled = true;
      }
      this.classNumberSelect.disabled = false;
      this.studentNumberSelect.disabled = false;
      this.studentTypeGroup.querySelectorAll('input').forEach(r => r.disabled = false);
    }
  }

  showDocumentModal(title, content) {
    const existingModal = document.querySelector('.document-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'document-modal';
    modal.innerHTML = `
      <div class="document-modal-overlay"></div>
      <div class="document-modal-content">
        <div class="document-modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button class="document-modal-close" aria-label="关闭">&times;</button>
        </div>
        <div class="document-modal-body">
          <pre class="document-modal-text"></pre>
        </div>
        <div class="document-modal-footer">
          <button class="document-modal-confirm-btn">我已阅读</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const textElement = modal.querySelector('.document-modal-text');
    textElement.textContent = content;

    const closeModal = () => modal.remove();

    modal.querySelector('.document-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.document-modal-overlay').addEventListener('click', closeModal);
    modal.querySelector('.document-modal-confirm-btn').addEventListener('click', closeModal);
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
  new RegisterPage();
});
