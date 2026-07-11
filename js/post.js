import { authService } from '../services/auth.js';
import { postService } from '../services/post.js';
import { storageService } from '../services/storage.js';

class PostPage {
  constructor() {
    this.contentInput = document.getElementById('content');
    this.tagsInput = document.getElementById('tags');
    this.submitButton = document.getElementById('submitButton');
    this.backButton = document.getElementById('backButton');
    this.uploadButton = document.getElementById('uploadButton');
    this.imageFileInput = document.getElementById('imageFileInput');
    this.imagePreviewGrid = document.getElementById('imagePreviewGrid');

    this.contentCounter = document.getElementById('contentCounter');

    this.contentError = document.getElementById('contentError');
    this.imageError = document.getElementById('imageError');

    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');

    this.uploadedImages = [];

    this.init();
  }

  async init() {
    await this.checkSession();
    this.bindEvents();
  }

  async checkSession() {
    const isLoggedIn = await authService.isLoggedIn();
    if (!isLoggedIn) {
      window.location.href = 'login.html';
    }
  }

  bindEvents() {
    this.backButton.addEventListener('click', () => this.goBack());
    this.submitButton.addEventListener('click', () => this.handleSubmit());
    this.snackbarAction.addEventListener('click', () => this.hideSnackbar());

    this.contentInput.addEventListener('input', () => {
      this.contentCounter.textContent = this.contentInput.value.length;
      this.validateContent();
    });

    this.uploadButton.addEventListener('click', () => this.imageFileInput.click());
    this.imageFileInput.addEventListener('change', (e) => this.handleImageUpload(e));
  }

  validateContent() {
    this.contentError.textContent = '';
    return true;
  }

  _generateTitle(content) {
    const trimmed = content.trim();
    if (!trimmed) {
      return '分享图片';
    }
    return trimmed.length > 50 ? trimmed.substring(0, 50) + '...' : trimmed;
  }

  async handleSubmit() {
    const content = this.contentInput.value.trim();
    const hasImages = this.uploadedImages.length > 0;

    if (!content && !hasImages) {
      this.contentError.textContent = '请输入内容或上传图片';
      return;
    }

    this.setLoading(true);

    try {
      const tags = this.tagsInput.value.trim().split(/[,，]/).map(t => t.trim()).filter(Boolean);
      
      console.log('[DEBUG] Post submit start');
      console.log('[DEBUG] uploadedImages length:', this.uploadedImages.length);
      console.log('[DEBUG] uploadedImages:', this.uploadedImages);

      const title = this._generateTitle(content);

      const createResponse = await postService.createPost(
        title,
        this.contentInput.value,
        tags
      );

      if (!createResponse.success) {
        this.showSnackbar(createResponse.message);
        return;
      }

      const postId = createResponse.data.id;
      console.log('[DEBUG] Post created successfully, postId:', postId);

      if (this.uploadedImages.length > 0) {
        console.log('[DEBUG] Entering image upload section');
        
        const files = this.uploadedImages.map(img => img.file);
        console.log('[DEBUG] Extracted files:', files);
        console.log('[DEBUG] Files length:', files.length);
        
        const uploadResponse = await storageService.uploadPostImages(files, postId);
        console.log('[DEBUG] uploadResponse:', uploadResponse);
        
        if (!uploadResponse.success) {
          this.showSnackbar(`帖子已创建，但图片上传失败：${uploadResponse.message}`);
          setTimeout(() => {
            window.location.href = `post-detail.html?id=${postId}`;
          }, 2000);
          return;
        }

        const saveImagesResponse = await postService.savePostImages(postId, uploadResponse.data);
        console.log('[DEBUG] saveImagesResponse:', saveImagesResponse);
        
        if (!saveImagesResponse.success) {
          this.showSnackbar(`帖子已创建，但图片关联合保存失败：${saveImagesResponse.message}`);
          setTimeout(() => {
            window.location.href = `post-detail.html?id=${postId}`;
          }, 2000);
          return;
        }
      } else {
        console.log('[DEBUG] No images to upload');
      }

      this.showSnackbar('帖子发布成功');
      setTimeout(() => {
        window.location.href = `post-detail.html?id=${postId}`;
      }, 1500);
    } catch (error) {
      console.error('[ERROR] Submit post error:', error);
      this.showSnackbar('发布失败，请稍后重试');
    } finally {
      this.setLoading(false);
    }
  }

  handleImageUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) {
      console.log('[DEBUG] No files selected');
      return;
    }

    const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
    const MAX_SIZE = 10 * 1024 * 1024;

    if (this.uploadedImages.length + files.length > 9) {
      this.showSnackbar('最多只能上传9张图片');
      return;
    }

    console.log('[DEBUG] handleImageUpload called, files count:', files.length);

    for (const file of Array.from(files)) {
      console.log('[DEBUG] Processing file:', file.name, file.type, file.size);

      if (!file.type.startsWith('image/')) {
        this.showSnackbar('请上传图片文件');
        continue;
      }

      const fileExt = file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
        this.showSnackbar('不支持的图片格式，仅支持 jpg/jpeg/png/webp');
        continue;
      }

      if (file.size > MAX_SIZE) {
        this.showSnackbar('单张图片大小不能超过10MB');
        continue;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const imageData = {
          file,
          url: event.target.result,
          id: Date.now() + Math.random()
        };
        this.uploadedImages.push(imageData);
        console.log('[DEBUG] Image added to uploadedImages, current length:', this.uploadedImages.length);
        this.renderImagePreview();
      };
      reader.onerror = (error) => {
        console.error('[ERROR] FileReader error:', error);
        this.showSnackbar('图片读取失败');
      };
      reader.readAsDataURL(file);
    }

    this.imageFileInput.value = '';
  }

  renderImagePreview() {
    this.imagePreviewGrid.innerHTML = '';
    this.uploadedImages.forEach((image, index) => {
      const previewItem = document.createElement('div');
      previewItem.className = 'image-preview-item';
      previewItem.innerHTML = `
        <img src="${image.url}" alt="图片${index + 1}" />
        <button class="image-remove-btn" data-id="${image.id}" aria-label="删除图片">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      `;
      previewItem.querySelector('.image-remove-btn').addEventListener('click', () => {
        this.removeImage(image.id);
      });
      this.imagePreviewGrid.appendChild(previewItem);
    });
  }

  removeImage(id) {
    this.uploadedImages = this.uploadedImages.filter(img => img.id !== id);
    this.renderImagePreview();
  }

  setLoading(isLoading) {
    if (isLoading) {
      this.submitButton.disabled = true;
      this.submitButton.textContent = '发布中...';
    } else {
      this.submitButton.disabled = false;
      this.submitButton.textContent = '发布';
    }
  }

  showSnackbar(message) {
    this.snackbarLabel.textContent = message;
    this.snackbar.classList.add('show');
    setTimeout(() => this.hideSnackbar(), 5000);
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