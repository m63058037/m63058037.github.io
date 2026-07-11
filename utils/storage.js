/**
 * LocalStorage 操作封装
 */
const localStorageService = {
  /**
   * 获取存储值
   * @param {string} key - 存储键名
   * @param {any} defaultValue - 默认值
   * @returns {any} 存储值或默认值
   */
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('LocalStorage get error:', error);
      return defaultValue;
    }
  },

  /**
   * 设置存储值
   * @param {string} key - 存储键名
   * @param {any} value - 存储值
   * @returns {boolean} 是否成功
   */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('LocalStorage set error:', error);
      return false;
    }
  },

  /**
   * 删除存储值
   * @param {string} key - 存储键名
   * @returns {boolean} 是否成功
   */
  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('LocalStorage remove error:', error);
      return false;
    }
  },

  /**
   * 清除所有存储
   * @returns {boolean} 是否成功
   */
  clear() {
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.error('LocalStorage clear error:', error);
      return false;
    }
  },

  /**
   * 检查键是否存在
   * @param {string} key - 存储键名
   * @returns {boolean} 是否存在
   */
  has(key) {
    try {
      return localStorage.getItem(key) !== null;
    } catch (error) {
      console.error('LocalStorage has error:', error);
      return false;
    }
  },

  /**
   * 获取所有键名
   * @returns {string[]} 键名数组
   */
  keys() {
    try {
      return Object.keys(localStorage);
    } catch (error) {
      console.error('LocalStorage keys error:', error);
      return [];
    }
  },

  /**
   * 获取存储大小
   * @returns {number} 存储大小（字节）
   */
  getSize() {
    try {
      return JSON.stringify(localStorage).length * 2;
    } catch (error) {
      console.error('LocalStorage getSize error:', error);
      return 0;
    }
  }
};

/**
 * SessionStorage 操作封装
 */
const sessionStorageService = {
  /**
   * 获取存储值
   * @param {string} key - 存储键名
   * @param {any} defaultValue - 默认值
   * @returns {any} 存储值或默认值
   */
  get(key, defaultValue = null) {
    try {
      const item = sessionStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('SessionStorage get error:', error);
      return defaultValue;
    }
  },

  /**
   * 设置存储值
   * @param {string} key - 存储键名
   * @param {any} value - 存储值
   * @returns {boolean} 是否成功
   */
  set(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('SessionStorage set error:', error);
      return false;
    }
  },

  /**
   * 删除存储值
   * @param {string} key - 存储键名
   * @returns {boolean} 是否成功
   */
  remove(key) {
    try {
      sessionStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('SessionStorage remove error:', error);
      return false;
    }
  },

  /**
   * 清除所有存储
   * @returns {boolean} 是否成功
   */
  clear() {
    try {
      sessionStorage.clear();
      return true;
    } catch (error) {
      console.error('SessionStorage clear error:', error);
      return false;
    }
  },

  /**
   * 检查键是否存在
   * @param {string} key - 存储键名
   * @returns {boolean} 是否存在
   */
  has(key) {
    try {
      return sessionStorage.getItem(key) !== null;
    } catch (error) {
      console.error('SessionStorage has error:', error);
      return false;
    }
  },

  /**
   * 获取所有键名
   * @returns {string[]} 键名数组
   */
  keys() {
    try {
      return Object.keys(sessionStorage);
    } catch (error) {
      console.error('SessionStorage keys error:', error);
      return [];
    }
  },

  /**
   * 获取存储大小
   * @returns {number} 存储大小（字节）
   */
  getSize() {
    try {
      return JSON.stringify(sessionStorage).length * 2;
    } catch (error) {
      console.error('SessionStorage getSize error:', error);
      return 0;
    }
  }
};

/**
 * 存储键名常量
 */
export const STORAGE_KEYS = {
  USER_INFO: 'campus_forum_user_info',
  ACCESS_TOKEN: 'campus_forum_access_token',
  REFRESH_TOKEN: 'campus_forum_refresh_token',
  THEME: 'campus_forum_theme',
  LANGUAGE: 'campus_forum_language',
  NOTIFICATION_SETTINGS: 'campus_forum_notification_settings',
  SEARCH_HISTORY: 'campus_forum_search_history',
  FAVORITE_POSTS: 'campus_forum_favorite_posts'
};

export { localStorageService, sessionStorageService };

export default {
  localStorage: localStorageService,
  sessionStorage: sessionStorageService,
  keys: STORAGE_KEYS
};