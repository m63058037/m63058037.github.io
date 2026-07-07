/**
 * 时间格式化工具函数
 * 将日期对象转换为指定格式的字符串
 * @param {Date} date - 日期对象
 * @param {string} format - 格式化字符串，支持 YYYY-MM-DD HH:mm:ss 等
 * @returns {string} 格式化后的时间字符串
 */
export function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * 计算相对时间
 * 将日期转换为相对于当前时间的描述（如：刚刚、5分钟前、昨天等）
 * @param {Date} date - 日期对象
 * @returns {string} 相对时间描述
 */
export function formatRelativeTime(date) {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;
  if (diff < week) return `${Math.floor(diff / day)}天前`;
  if (diff < month) return `${Math.floor(diff / week)}周前`;
  return formatDate(date, 'YYYY-MM-DD');
}

/**
 * 生成UUID v4
 * @returns {string} UUID字符串
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 防抖函数
 * @param {Function} fn - 需要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 节流函数
 * @param {Function} fn - 需要节流的函数
 * @param {number} limit - 限制时间（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(fn, limit) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * 截断字符串并添加省略号
 * @param {string} str - 原始字符串
 * @param {number} maxLength - 最大长度
 * @returns {string} 截断后的字符串
 */
export function truncateString(str, maxLength) {
  if (!str) return '';
  return str.length > maxLength ? str.slice(0, maxLength) + '...' : str;
}

/**
 * 移除字符串中的HTML标签
 * @param {string} str - 包含HTML的字符串
 * @returns {string} 纯文本字符串
 */
export function stripHtml(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '');
}

/**
 * 安全获取嵌套属性
 * @param {object} obj - 目标对象
 * @param {string} path - 属性路径，如 'a.b.c'
 * @param {any} defaultValue - 默认值
 * @returns {any} 属性值或默认值
 */
export function getNested(obj, path, defaultValue = null) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : defaultValue;
  }, obj);
}

/**
 * 格式化文件大小
 * @param {number} bytes - 文件大小（字节）
 * @returns {string} 格式化后的大小字符串
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 生成随机颜色
 * @returns {string} 十六进制颜色值
 */
export function generateRandomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

/**
 * 验证邮箱格式
 * @param {string} email - 邮箱地址
 * @returns {boolean} 是否有效
 */
export function validateEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * 验证用户名格式
 * @param {string} username - 用户名
 * @returns {boolean} 是否有效
 */
export function validateUsername(username) {
  const regex = /^[a-zA-Z0-9_]{3,20}$/;
  return regex.test(username);
}

/**
 * 获取图片URL的缩略图版本
 * @param {string} url - 原始图片URL
 * @param {number} width - 缩略图宽度
 * @returns {string} 缩略图URL
 */
export function getThumbnailUrl(url, width = 200) {
  if (!url) return '';
  if (url.includes('supabase.co')) {
    return url.replace('/storage/v1/object/public/', `/storage/v1/object/public/`) + `?width=${width}`;
  }
  return url;
}

/**
 * 压缩图片
 * @param {File} file - 图片文件
 * @param {number} maxWidth - 最大宽度
 * @param {number} quality - 压缩质量 (0-1)
 * @returns {Promise<Blob>} 压缩后的图片Blob
 */
export function compressImage(file, maxWidth = 1024, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), file.type, quality);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}

/**
 * 数组去重
 * @param {Array} arr - 原始数组
 * @param {string} key - 对象数组的去重键（可选）
 * @returns {Array} 去重后的数组
 */
export function uniqueArray(arr, key = null) {
  if (!arr || !Array.isArray(arr)) return [];
  if (key) {
    const seen = new Set();
    return arr.filter((item) => {
      const value = item[key];
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }
  return [...new Set(arr)];
}

/**
 * 对象深拷贝
 * @param {object} obj - 原始对象
 * @returns {object} 拷贝后的对象
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map((item) => deepClone(item));
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}

export default {
  formatDate,
  formatRelativeTime,
  generateUUID,
  debounce,
  throttle,
  truncateString,
  stripHtml,
  getNested,
  formatFileSize,
  generateRandomColor,
  validateEmail,
  validateUsername,
  getThumbnailUrl,
  compressImage,
  uniqueArray,
  deepClone
};