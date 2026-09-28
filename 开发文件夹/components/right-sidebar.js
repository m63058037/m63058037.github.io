import { postService } from '../services/post.js';

export class RightSidebarComponent {
  constructor() {
    this.hotPosts = document.getElementById('hotPosts');
    this.latestComments = document.getElementById('latestComments');
    this.totalPosts = document.getElementById('totalPosts');
    this.totalComments = document.getElementById('totalComments');
    this.totalUsers = document.getElementById('totalUsers');

    this.snackbarTimer = null;

    this.init();
  }
  
  async init() {
    try {
      await Promise.all([
        this.loadHotPosts(),
        this.loadStats()
      ]);
      this.renderLatestComments();
    } catch (error) {
    }
  }

  async loadHotPosts() {
    try {
      const response = await postService.getPosts(1, 5);
      
      if (!response.success) {
        this.renderHotPosts([]);
        return;
      }
      
      this.renderHotPosts(response.data.posts);
    } catch (error) {
      this.renderHotPosts([]);
    }
  }
  
  renderHotPosts(posts) {
    if (!posts || posts.length === 0) {
      this.hotPosts.innerHTML = '<p class="no-data">暂无热门帖子</p>';
      return;
    }
    
    this.hotPosts.innerHTML = posts.map((post, index) => `
      <div class="hot-post-item">
        <span class="hot-rank ${index < 3 ? 'top' : ''}">${index + 1}</span>
        <a href="post-detail.html?id=${post.id}" class="hot-post-title">${post.title}</a>
        <span class="hot-post-comments">${post.comments_count}评论</span>
      </div>
    `).join('');
  }
  
  async loadStats() {
    try {
      const response = await postService.getPosts(1, 1, null);
      
      if (!response.success) {
        this.renderStats({ totalPosts: 0, totalComments: 0, totalUsers: 0 });
        return;
      }
      
      const pagination = response.data.pagination;
      
      this.renderStats({
        totalPosts: pagination.total || pagination.totalItems || 0,
        totalComments: 0,
        totalUsers: 0
      });
    } catch (error) {
      this.renderStats({ totalPosts: 0, totalComments: 0, totalUsers: 0 });
    }
  }
  
  renderStats(stats) {
    this.totalPosts.textContent = (stats.totalPosts || 0).toLocaleString();
    this.totalComments.textContent = '—';
    this.totalUsers.textContent = '—';
  }

  renderLatestComments() {
    if (this.latestComments) {
      this.latestComments.innerHTML = '<p class="no-data">暂无最新回复</p>';
    }
  }

  showSnackbar(message) {
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
    }
    const snackbar = document.getElementById('snackbar');
    const snackbarLabel = document.getElementById('snackbarLabel');
    if (snackbar && snackbarLabel) {
      snackbarLabel.textContent = message;
      snackbar.classList.add('show');
      this.snackbarTimer = setTimeout(() => {
        snackbar.classList.remove('show');
      }, 5000);
    }
  }
}

export default RightSidebarComponent;