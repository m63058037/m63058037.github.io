import { authService } from '../services/auth.js';

class FavoritesPage {
  constructor() {
    this.currentPage = 1;
    this.pageSize = 10;

    this.postsList = document.getElementById('postsList');
    this.postsLoading = document.getElementById('postsLoading');
    this.noPosts = document.getElementById('noPosts');
    this.pagination = document.getElementById('pagination');
    this.backButton = document.getElementById('backButton');

    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');

    this.init();
  }

  async init() {
    try {
      await this.checkSession();
      await this.loadFavorites();
      this.bindEvents();
    } catch (error) {
      console.error('Favorites init error:', error);
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

  async loadFavorites() {
    this.showLoading(true);
    this.noPosts.style.display = 'none';
    this.postsList.innerHTML = '';

    setTimeout(() => {
      this.showLoading(false);
      this.noPosts.style.display = 'flex';
    }, 500);
  }

  showLoading(isLoading) {
    if (isLoading) {
      this.postsLoading.style.display = 'flex';
      this.postsList.style.display = 'none';
    } else {
      this.postsLoading.style.display = 'none';
      this.postsList.style.display = 'grid';
    }
  }

  bindEvents() {
    this.backButton.addEventListener('click', () => this.goBack());
    this.snackbarAction.addEventListener('click', () => this.hideSnackbar());
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
  new FavoritesPage();
});