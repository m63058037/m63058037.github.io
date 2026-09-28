/**
 * Lottie动画图标工具库
 * 使用 /图标/ 资源库中的Lottie动画统一视觉风格
 */

class LottieIconUtils {
  constructor() {
    this.loadedIcons = new Map();
    this.iconBaseUrl = '/图标/src/lib/';
  }

  /**
   * 加载Lottie动画图标
   * @param {string} iconName - 图标名称
   * @param {Object} options - 配置选项
   * @returns {Promise} 加载Promise
   */
  async loadIcon(iconName, options = {}) {
    if (this.loadedIcons.has(iconName)) {
      return this.loadedIcons.get(iconName);
    }

    const iconPath = `${this.iconBaseUrl}${iconName}/${iconName}.json`;
    
    try {
      const response = await fetch(iconPath);
      if (!response.ok) {
        throw new Error(`Failed to load icon: ${iconName}`);
      }
      
      const animationData = await response.json();
      const iconElement = this.createIconElement(iconName, animationData, options);
      
      this.loadedIcons.set(iconName, iconElement);
      return iconElement;
    } catch (error) {
      console.warn(`[LottieIcon] 加载图标失败 ${iconName}:`, error);
      return this.createFallbackIcon(iconName);
    }
  }

  /**
   * 创建图标元素
   * @param {string} iconName - 图标名称
   * @param {Object} animationData - 动画数据
   * @param {Object} options - 配置选项
   * @returns {HTMLElement} 图标元素
   */
  createIconElement(iconName, animationData, options = {}) {
    const container = document.createElement('div');
    container.className = `lottie-icon lottie-icon-${iconName}`;
    
    // 设置尺寸，优先使用options中的尺寸，否则使用默认尺寸
    const width = options.width || '24px';
    const height = options.height || '24px';
    
    // 设置容器尺寸
    container.style.width = width;
    container.style.height = height;
    container.style.maxWidth = width;
    container.style.maxHeight = height;
    container.style.minWidth = width;
    container.style.minHeight = height;
    
    // 应用Material Design 3颜色
    const primaryColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--md-sys-color-primary').trim() || '#D8B66A';
    const onSurfaceColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--md-sys-color-on-surface').trim() || '#403A34';
    
    // 根据图标类型设置默认颜色
    let defaultColor = onSurfaceColor;
    if (iconName === 'heart' || iconName === 'star') {
      defaultColor = primaryColor;
    } else if (iconName === 'notification') {
      defaultColor = primaryColor;
    }
    
    // 创建动画
    const animation = lottie.loadAnimation({
      container: container,
      renderer: 'svg',
      loop: options.loop !== false,
      autoplay: options.autoplay !== false,
      animationData: animationData,
      rendererSettings: {
        progressiveLoad: true,
        preserveAspectRatio: 'xMidYMid meet',
        clearCanvas: false
      }
    });

    // 设置颜色
    if (options.color) {
      this.setAnimationColor(animation, options.color);
    } else {
      this.setAnimationColor(animation, defaultColor);
    }

    // 添加交互效果
    if (options.interactive) {
      this.addInteractiveEffects(container, animation, options);
    }

    return container;
  }

  /**
   * 设置动画颜色
   * @param {Object} animation - Lottie动画对象
   * @param {string} color - 颜色值
   */
  setAnimationColor(animation, color) {
    if (animation.renderer && animation.renderer.domElement) {
      const svg = animation.renderer.domElement;
      // 只修改Lottie图标内部的SVG元素，避免影响页面其他SVG
      const lottiePaths = svg.querySelectorAll('path[data-lottie], circle[data-lottie], rect[data-lottie], polygon[data-lottie]');
      lottiePaths.forEach(path => {
        if (path.getAttribute('stroke')) {
          path.setAttribute('stroke', color);
        }
        if (path.getAttribute('fill')) {
          path.setAttribute('fill', color);
        }
      });
      
      // 如果没有data-lottie属性，则给所有路径添加标记
      if (lottiePaths.length === 0) {
        const allPaths = svg.querySelectorAll('path, circle, rect, polygon');
        allPaths.forEach(path => {
          // 添加临时标记
          path.setAttribute('data-lottie', 'true');
          if (path.getAttribute('stroke')) {
            path.setAttribute('stroke', color);
          }
          if (path.getAttribute('fill')) {
            path.setAttribute('fill', color);
          }
        });
      }
    }
  }

  /**
   * 添加交互效果
   * @param {HTMLElement} element - 图标元素
   * @param {Object} animation - Lottie动画对象
   * @param {Object} options - 配置选项
   */
  addInteractiveEffects(element, animation, options = {}) {
    element.style.cursor = 'pointer';
    element.style.transition = 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
    
    // 点击效果
    element.addEventListener('click', () => {
      if (options.onClick) {
        options.onClick();
      }
      
      // 添加点击动画
      element.style.transform = 'scale(0.95)';
      setTimeout(() => {
        element.style.transform = 'scale(1)';
      }, 100);
    });

    // Hover效果
    element.addEventListener('mouseenter', () => {
      element.style.transform = 'scale(1.05)';
    });

    element.addEventListener('mouseleave', () => {
      element.style.transform = 'scale(1)';
    });
  }

  /**
   * 创建备用图标（当Lottie加载失败时）
   * @param {string} iconName - 图标名称
   * @returns {HTMLElement} SVG图标元素
   */
  createFallbackIcon(iconName) {
    const container = document.createElement('div');
    container.className = `lottie-icon lottie-icon-${iconName} fallback-icon`;
    
    // 设置默认尺寸
    container.style.width = '24px';
    container.style.height = '24px';
    container.style.maxWidth = '24px';
    container.style.maxHeight = '24px';
    container.style.minWidth = '24px';
    container.style.minHeight = '24px';
    
    const primaryColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--md-sys-color-primary').trim() || '#D8B66A';
    
    container.innerHTML = this.getFallbackSVG(iconName, primaryColor);
    return container;
  }

  /**
   * 获取备用SVG
   * @param {string} iconName - 图标名称
   * @param {string} color - 颜色
   * @returns {string} SVG字符串
   */
  getFallbackSVG(iconName, color) {
    const svgTemplates = {
      heart: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>`,
      star: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>`,
      notification: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>`,
      settings: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1"/>
        <path d="M20.49 7.5a9 9 0 0 0-5.77-5.77l1.06 5.77zM3.51 16.5a9 9 0 0 0 5.77 5.77l-1.06-5.77zM20.49 16.5l-5.77 1.06a9 9 0 0 0 5.77-5.77zM3.51 7.5l5.77-1.06a9 9 0 0 0-5.77 5.77z"/>
      </svg>`,
      search: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>`,
      edit: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>`,
      bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>`,
      trash: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>`,
      checkmark: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>`,
      alertTriangle: `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>`
    };

    return svgTemplates[iconName] || svgTemplates.search;
  }

  /**
   * 批量加载图标
   * @param {Array} iconNames - 图标名称数组
   * @returns {Promise} 加载Promise
   */
  async loadIcons(iconNames) {
    const promises = iconNames.map(iconName => this.loadIcon(iconName));
    return Promise.all(promises);
  }

  /**
   * 替换页面中的图标
   * @param {Object} config - 替换配置
   */
  replaceIcons(config) {
    Object.entries(config).forEach(([selector, iconName]) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        this.loadIcon(iconName, { interactive: true }).then(iconElement => {
          element.innerHTML = '';
          element.appendChild(iconElement);
        });
      });
    });
  }
}

// 全局实例
const lottieIconUtils = new LottieIconUtils();

// 页面加载完成后自动替换默认图标
document.addEventListener('DOMContentLoaded', () => {
  // 默认替换的图标配置
  const defaultIconConfig = {
    '.like-btn .icon': 'heart',
    '.favorite-btn .icon': 'star',
    '.notification-btn .icon': 'notification',
    '.settings-btn .icon': 'settings',
    '.search-btn .icon': 'search',
    '.edit-btn .icon': 'edit',
    '.bookmark-btn .icon': 'bookmark',
    '.delete-btn .icon': 'trash',
    '.success-icon': 'checkmark',
    '.warning-icon': 'alertTriangle'
  };

  // 延迟加载，确保DOM完全渲染
  setTimeout(() => {
    lottieIconUtils.replaceIcons(defaultIconConfig);
  }, 100);
});

// 导出工具类
window.LottieIconUtils = LottieIconUtils;
window.lottieIconUtils = lottieIconUtils;