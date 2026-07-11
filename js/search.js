import { authService } from '../services/auth.js';

class SearchPage {
  constructor() {
    this.keyword = this.getKeyword();
    this.currentFilter = 'all';
    this.currentPage = 1;

    this.searchInput = document.getElementById('searchInput');
    this.searchButton = document.getElementById('searchButton');
    this.backButton = document.getElementById('backButton');

    this.searchResults = document.getElementById('searchResults');
    this.searchLoading = document.getElementById('searchLoading');
    this.resultsList = document.getElementById('resultsList');
    this.noResults = document.getElementById('noResults');
    this.pagination = document.getElementById('pagination');

    this.snackbar = document.getElementById('snackbar');
    this.snackbarLabel = document.getElementById('snackbarLabel');
    this.snackbarAction = document.getElementById('snackbarAction');

    this.init();
  }

  getKeyword() {
    const params = new URLSearchParams(window.location.search);
    return params.get('keyword') || '';
  }

  async init() {
    try {
      await this.checkSession();
      if (this.keyword) {
        this.searchInput.value = this.keyword;
        await this.performSearch();
      }
      this.bindEvents();
    } catch (error) {
      console.error('Search init error:', error);
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

  async performSearch() {
    const keyword = this.searchInput.value.trim();
    if (!keyword) return;

    this.showLoading(true);
    this.noResults.style.display = 'none';
    this.resultsList.innerHTML = '';

    setTimeout(() => {
      this.showLoading(false);
      this.noResults.style.display = 'flex';
    }, 500);
  }

  showLoading(isLoading) {
    if (isLoading) {
      this.searchLoading.style.display = 'flex';
      this.resultsList.style.display = 'none';
    } else {
      this.searchLoading.style.display = 'none';
      this.resultsList.style.display = 'block';
    }
  }

  bindEvents() {
    this.backButton.addEventListener('click', () => this.goBack());
    this.searchButton.addEventListener('click', () => this.handleSearch());
    this.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleSearch();
    });
    this.snackbarAction.addEventListener('click', () => this.hideSnackbar());

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.currentPage = 1;
        this.performSearch();
      });
    });
  }

  handleSearch() {
    const keyword = this.searchInput.value.trim();
    if (!keyword) return;
    window.location.href = `search.html?keyword=${encodeURIComponent(keyword)}`;
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
  new SearchPage();
});