import { authService } from '../services/auth.js';
import { postService } from '../services/post.js';
import { storageService } from '../services/storage.js';
import { config } from '../config/supabase.js';
import { ALL_BRANCH, ALL_BRANCH_NAME } from '../config/branches.js';
import { escapeHtml } from '../utils/helpers.js';

class PostPage {
  constructor() {
    this.titleInput = document.getElementById('title');
    this.contentInput = document.getElementById('content');
    this.submitButton = document.getElementById('submitButton');
    this.backButton = document.getElementById('backButton');
    this.uploadButton = document.getElementById('uploadButton');
    this.imageFileInput = document.getElementById('imageFileInput');
    this.imagePreviewGrid = document.getElementById('imagePreviewGrid');
    this.postForm = document.getElementById('postForm');
    this.pageTitle = document.querySelector('.page-title');

    this.titleCounter = document.getElementById('titleCounter');
    this.contentCounter = document.getElementById('contentCounter');

    this.titleError = document.getElementById('titleError');
    this.contentError = document.getElementById('contentError');
    this.imageError = document.getElementById('imageError');
    this.branchError = document.getElementById('branchError');
    this.tagsError = document.getElementById('tagsError');

    this.branchSelectArea = document.getElementById('branchSelectArea');
    this.branchHint = document.getElementById('branchHint');

    this.tagsList = document.getElementById('tagsList');
    this.tagInput = document.getElementById('tagInput');
    this.tagAddBtn = document.getElementById('tagAddBtn');

    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');

    this.lightbox = document.getElementById('imageLightbox');
    this.lightboxImage = document.getElementById('lightboxImage');
    this.lightboxClose = document.getElementById('lightboxClose');

    this.uploadedImages = [];
    this.existingImages = [];
    this.removedImagePaths = [];
    this.tags = [];
    this.selectedBranches = [];
    this.userBranch = null;

    this.isEditMode = false;
    this.editPostId = null;

    this.snackbarTimer = null;

    this.init();
  }

  async init() {
    try {
      await this.checkSession();
      const urlParams = new URLSearchParams(window.location.search);
      this.editPostId = urlParams.get('id');

      if (this.editPostId) {
        this.isEditMode = true;
        await this.loadPostForEdit();
      }

      await this.checkPostPermission();
      await this.loadUserBranch();
      this.renderBranchOptions();

      if (this.isEditMode) {
        this.pageTitle.textContent = '编辑帖子';
        this.submitButton.textContent = '保存';
      }

      this.bindEvents();
    } catch (error) {
      if (!error.message?.includes('No post permission') && !error.message?.includes('not logged in')) {
      }
    }
  }

  async checkSession() {
    const isLoggedIn = await authService.isLoggedIn();
    if (!isLoggedIn) {
      window.location.href = 'login.html';
      throw new Error('User not logged in');
    }
  }

  async loadUserBranch() {
    const userResponse = await authService.getCurrentUser();
    if (userResponse.success) {
      this.userBranch = userResponse.data.branch;
    }
  }

  renderBranchOptions() {
    this.branchSelectArea.innerHTML = '';

    const hint = document.createElement('p');
    hint.className = 'form-hint';
    hint.textContent = '选择发布范围（可多选）';
    this.branchSelectArea.appendChild(hint);

    const options = document.createElement('div');
    options.className = 'branch-options';

    if (this.userBranch) {
      const userOption = this.createBranchCheckbox(this.userBranch, this.userBranch, false);
      options.appendChild(userOption);
    }

    const allOption = this.createBranchCheckbox(ALL_BRANCH, ALL_BRANCH_NAME, true);
    options.appendChild(allOption);

    this.branchSelectArea.appendChild(options);

    if (this.isEditMode && this.selectedBranches.length > 0) {
      this.selectedBranches.forEach(branch => {
        const cb = options.querySelector(`input[value="${branch}"]`);
        if (cb) cb.checked = true;
      });
    } else if (!this.isEditMode && this.userBranch) {
      const cb = options.querySelector(`input[value="${this.userBranch}"]`);
      if (cb) {
        cb.checked = true;
        this.selectedBranches = [this.userBranch];
      }
    }
  }

  createBranchCheckbox(value, label, isAll) {
    const wrapper = document.createElement('label');
    wrapper.className = 'branch-checkbox-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = value;
    input.dataset.isAll = isAll ? 'true' : 'false';
    input.addEventListener('change', () => this.handleBranchChange());

    const labelText = document.createElement('span');
    labelText.textContent = label;

    wrapper.appendChild(input);
    wrapper.appendChild(labelText);

    return wrapper;
  }

  handleBranchChange() {
    this.selectedBranches = [];
    const checkboxes = this.branchSelectArea.querySelectorAll('input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
      this.selectedBranches.push(cb.value);
    });
    this.branchError.textContent = '';
  }

  async loadPostForEdit() {
    const response = await postService.getPostById(this.editPostId);
    if (!response.success) {
      this.showSnackbar('帖子不存在');
      setTimeout(() => { window.location.href = 'home.html'; }, 2000);
      throw new Error('Post not found');
    }

    const post = response.data;
    const userResponse = await authService.getCurrentUser();
    if (!userResponse.success || post.user_id !== userResponse.data.id) {
      this.showSnackbar('无权编辑此帖子');
      setTimeout(() => { window.location.href = 'home.html'; }, 2000);
      throw new Error('No edit permission');
    }

    this.titleInput.value = post.title || '';
    this.contentInput.value = post.content || '';
    this.titleCounter.textContent = this.titleInput.value.length;
    this.contentCounter.textContent = this.contentInput.value.length;

    if (post.tags && Array.isArray(post.tags)) {
      this.tags = [...post.tags];
      this.renderTags();
    }

    if (post.branches && Array.isArray(post.branches)) {
      this.selectedBranches = [...post.branches];
    }

    const imagesResponse = await postService.getPostImages(this.editPostId);
    if (imagesResponse.success && imagesResponse.data) {
      this.existingImages = imagesResponse.data.map(img => ({
        url: img.url,
        path: img.path,
        fileName: img.file_name,
        id: img.id,
        isExisting: true
      }));
      this.renderImagePreview();
    }
  }

  async checkPostPermission() {
    const permission = await authService.canPost();
    if (!permission.allowed) {
      this.snackbarLabel.textContent = permission.reason || '您没有发帖权限';
      this.snackbar.classList.add('show');
      this.submitButton.disabled = true;
      this.submitButton.style.opacity = '0.5';
      this.submitButton.style.cursor = 'not-allowed';
      this.titleInput.disabled = true;
      this.contentInput.disabled = true;
      this.tagInput.disabled = true;
      this.tagAddBtn.disabled = true;
      this.uploadButton.disabled = true;
      setTimeout(() => {
        window.location.href = 'home.html';
      }, 3000);
      throw new Error('No post permission');
    }
  }

  bindEvents() {
    this.backButton.addEventListener('click', () => this.goBack());
    this.submitButton.addEventListener('click', () => this.handleSubmit());
    if (this.postForm) {
      this.postForm.addEventListener('submit', (e) => this.handleSubmit(e));
    }
    this.snackbarAction.addEventListener('click', () => this.hideSnackbar());

    if (this.titleInput) {
      this.titleInput.addEventListener('input', () => {
        if (this.titleCounter) {
          this.titleCounter.textContent = this.titleInput.value.length;
        }
        this.validateTitle();
      });
    }

    this.contentInput.addEventListener('input', () => {
      this.contentCounter.textContent = this.contentInput.value.length;
      this.validateContent();
    });

    this.uploadButton.addEventListener('click', () => this.imageFileInput.click());
    this.imageFileInput.addEventListener('change', (e) => this.handleImageUpload(e));

    this.tagAddBtn.addEventListener('click', () => this.handleAddTag());
    this.tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleAddTag();
      }
    });

    if (this.lightboxClose) {
      this.lightboxClose.addEventListener('click', () => this.closeLightbox());
    }
    if (this.lightbox) {
      this.lightbox.addEventListener('click', (e) => {
        if (e.target === this.lightbox || e.target.classList.contains('image-lightbox-content')) {
          this.closeLightbox();
        }
      });
    }
  }

  handleAddTag() {
    const raw = this.tagInput.value.trim();
    if (!raw) return;

    let tag = raw;
    if (!tag.startsWith('#')) {
      tag = '#' + tag;
    }

    const content = tag.slice(1);
    if (!content) {
      this.tagsError.textContent = '标签不能为空';
      return;
    }
    if (/[0-9]/.test(content)) {
      this.tagsError.textContent = '标签不能包含数字';
      return;
    }
    if (!/^[\u4e00-\u9fa5a-zA-Z]+$/.test(content)) {
      this.tagsError.textContent = '标签只能包含中文和英文字母';
      return;
    }
    if (this.tags.length >= 5) {
      this.tagsError.textContent = '标签最多5个';
      return;
    }

    const lower = tag.toLowerCase();
    if (this.tags.some(t => t.toLowerCase() === lower)) {
      this.tagsError.textContent = '标签不能重复';
      return;
    }

    this.tags.push(tag);
    this.tagInput.value = '';
    this.tagsError.textContent = '';
    this.renderTags();
  }

  renderTags() {
    this.tagsList.innerHTML = '';
    this.tags.forEach((tag, index) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = `
        ${escapeHtml(tag)}
        <button type="button" class="tag-remove-btn" data-index="${index}" aria-label="删除标签">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      `;
      chip.querySelector('.tag-remove-btn').addEventListener('click', () => {
        this.tags.splice(index, 1);
        this.renderTags();
      });
      this.tagsList.appendChild(chip);
    });
  }

  validateTitle() {
    const title = this.titleInput.value.trim();
    if (!title) {
      this.titleError.textContent = '请输入标题';
      return false;
    }
    if (title.length < 2) {
      this.titleError.textContent = '标题至少需要2个字符';
      return false;
    }
    if (title.length > 200) {
      this.titleError.textContent = '标题不能超过200个字符';
      return false;
    }
    this.titleError.textContent = '';
    return true;
  }

  validateContent() {
    const content = this.contentInput.value.trim();
    if (!content) {
      this.contentError.textContent = '请输入内容';
      return false;
    }
    if (content.length < 2) {
      this.contentError.textContent = '内容至少需要2个字符';
      return false;
    }
    this.contentError.textContent = '';
    return true;
  }

  validateBranches() {
    if (!this.selectedBranches || this.selectedBranches.length === 0) {
      this.branchError.textContent = '请选择至少一个校区范围';
      return false;
    }
    for (const branch of this.selectedBranches) {
      if (branch !== ALL_BRANCH && branch !== this.userBranch) {
        this.branchError.textContent = '只能选择自己的校区或全部校区';
        return false;
      }
    }
    this.branchError.textContent = '';
    return true;
  }

  async handleSubmit() {
    const isTitleValid = this.validateTitle();
    const isContentValid = this.validateContent();
    const isBranchValid = this.validateBranches();

    if (!isTitleValid || !isContentValid || !isBranchValid) {
      return;
    }

    this.setLoading(true);

    try {
      const titleText = this.titleInput.value.trim();
      const contentText = this.contentInput.value;

      if (this.isEditMode) {
        await this.handleEditSubmit(titleText, contentText);
      } else {
        await this.handleCreateSubmit(titleText, contentText);
      }
    } catch (error) {
      this.showSnackbar('操作失败，请稍后重试');
    } finally {
      this.setLoading(false);
    }
  }

  async handleCreateSubmit(titleText, contentText) {
    const createResponse = await postService.createPost(
      titleText,
      contentText,
      this.tags,
      this.selectedBranches
    );

    if (!createResponse.success) {
      this.showSnackbar(createResponse.message);
      return;
    }

    const postId = createResponse.data.id;

    if (this.uploadedImages.length > 0) {
      const files = this.uploadedImages.map(img => img.file);
      const uploadResponse = await storageService.uploadPostImages(files, postId);

      if (!uploadResponse.success) {
        this.showSnackbar(`帖子已创建，但图片上传失败：${uploadResponse.message}`);
        setTimeout(() => {
          window.location.href = `post-detail.html?id=${postId}&from=create-post`;
        }, 2000);
        return;
      }

      const saveImagesResponse = await postService.savePostImages(postId, uploadResponse.data);
      if (!saveImagesResponse.success) {
        this.showSnackbar(`帖子已创建，但图片关联保存失败：${saveImagesResponse.message}`);
        setTimeout(() => {
          window.location.href = `post-detail.html?id=${postId}&from=create-post`;
        }, 2000);
        return;
      }
    }

    this.showSnackbar('帖子发布成功');
    setTimeout(() => {
      window.location.href = `post-detail.html?id=${postId}&from=create-post`;
    }, 1500);
  }

  async handleEditSubmit(titleText, contentText) {
    const updateResponse = await postService.updatePost(
      this.editPostId,
      titleText,
      contentText,
      this.tags,
      this.selectedBranches
    );

    if (!updateResponse.success) {
      this.showSnackbar(updateResponse.message);
      return;
    }

    for (const imgPath of this.removedImagePaths) {
      await storageService.deleteImage('post-images', imgPath);
    }

    if (this.uploadedImages.length > 0) {
      const files = this.uploadedImages.map(img => img.file);
      const uploadResponse = await storageService.uploadPostImages(files, this.editPostId);

      if (uploadResponse.success) {
        await postService.savePostImages(this.editPostId, uploadResponse.data);
      }
    }

    this.showSnackbar('帖子更新成功');
    setTimeout(() => {
      window.location.href = `post-detail.html?id=${this.editPostId}`;
    }, 1500);
  }

  handleImageUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
    const MAX_SIZE = config.maxPostImageSize;
    const currentCount = this.uploadedImages.length + this.existingImages.length;

    if (currentCount + files.length > 9) {
      this.showSnackbar('最多只能上传9张图片');
      return;
    }

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) {
        this.showSnackbar('请上传图片文件');
        return;
      }

      const fileExt = file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
        this.showSnackbar('不支持的图片格式，仅支持 jpg/jpeg/png/webp');
        return;
      }

      if (file.size > MAX_SIZE) {
        this.showSnackbar(`单张图片大小不能超过${MAX_SIZE / 1024 / 1024}MB`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const imageData = {
          file,
          url: event.target.result,
          id: Date.now() + Math.random()
        };
        this.uploadedImages.push(imageData);
        this.renderImagePreview();
      };
      reader.readAsDataURL(file);
    });

    this.imageFileInput.value = '';
  }

  renderImagePreview() {
    this.imagePreviewGrid.innerHTML = '';
    const allImages = [...this.existingImages, ...this.uploadedImages];

    allImages.forEach((image, index) => {
      const previewItem = document.createElement('div');
      previewItem.className = 'image-preview-item';

      const img = document.createElement('img');
      img.src = image.url;
      img.alt = `图片${index + 1}`;
      img.className = 'preview-thumb-img';
      img.addEventListener('click', () => {
        this.openLightbox(image.url);
      });
      previewItem.appendChild(img);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'image-remove-btn';
      removeBtn.setAttribute('aria-label', '删除图片');
      removeBtn.type = 'button';
      removeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeImage(image.id);
      });
      previewItem.appendChild(removeBtn);

      this.imagePreviewGrid.appendChild(previewItem);
    });
  }

  openLightbox(url) {
    if (!this.lightbox || !this.lightboxImage) return;
    this.lightboxImage.src = url;
    this.lightbox.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  closeLightbox() {
    if (!this.lightbox) return;
    this.lightbox.classList.remove('show');
    document.body.style.overflow = '';
  }

  removeImage(id) {
    const existingIdx = this.existingImages.findIndex(img => img.id === id);
    if (existingIdx !== -1) {
      const removed = this.existingImages.splice(existingIdx, 1)[0];
      if (removed.path) {
        this.removedImagePaths.push(removed.path);
      }
    } else {
      this.uploadedImages = this.uploadedImages.filter(img => img.id !== id);
    }
    this.renderImagePreview();
  }

  setLoading(isLoading) {
    if (isLoading) {
      this.submitButton.disabled = true;
      this.submitButton.textContent = this.isEditMode ? '保存中...' : '发布中...';
    } else {
      this.submitButton.disabled = false;
      this.submitButton.textContent = this.isEditMode ? '保存' : '发布';
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
    window.history.back();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PostPage();
});
