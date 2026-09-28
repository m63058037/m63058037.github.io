/**
 * UI一致性检查脚本
 * 检查所有页面的UI组件、响应式设计和主题一致性
 */

class UIConsistencyChecker {
  constructor() {
    this.results = {
      totalPages: 0,
      checkedPages: 0,
      issues: [],
      warnings: [],
      passed: []
    };
    
    this.requiredCSS = [
      'styles.css',
      'lottie-icon-styles.css'
    ];
    
    this.requiredScripts = [
      'supabase.js',
      'lottie-icon-utils.js'
    ];
    
    this.commonSelectors = {
      headers: ['.home-header', '.simple-header'],
      buttons: ['.btn-primary', '.btn-secondary', '.back-button'],
      cards: ['.post-card', '.sidebar-card', '.admin-card'],
      navigation: ['.nav-item', '.category-item'],
      inputs: ['.search-input', '.form-input'],
      icons: ['.lottie-icon', 'svg']
    };
    
    this.colorVariables = [
      '--md-sys-color-primary',
      '--md-sys-color-secondary', 
      '--md-sys-color-background',
      '--md-sys-color-on-surface',
      '--md-sys-color-error',
      '--md-sys-color-warning'
    ];
  }

  /**
   * 开始检查所有页面
   */
  async checkAllPages() {
    const pages = [
      'home.html',
      'search.html',
      'post.html',
      'post-detail.html',
      'profile.html',
      'user-profile.html',
      'admin.html',
      'login.html',
      'register.html',
      'forgot-password.html',
      'messages.html',
      'favorites.html',
      'my-posts.html'
    ];

    this.results.totalPages = pages.length;
    
    for (const page of pages) {
      await this.checkPage(page);
      this.results.checkedPages++;
    }
    
    this.generateReport();
  }

  /**
   * 检查单个页面
   */
  async checkPage(pageName) {
    try {
      const response = await fetch(`pages/${pageName}`);
      if (!response.ok) {
        this.results.issues.push({
          page: pageName,
          type: 'LOAD_ERROR',
          message: `页面加载失败: ${response.status}`
        });
        return;
      }

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // 检查CSS文件
      this.checkCSSFiles(doc, pageName);
      
      // 检查JavaScript文件
      this.checkJSFiles(doc, pageName);
      
      // 检查主题色变量
      this.checkThemeColors(doc, pageName);
      
      // 检查响应式设计
      this.checkResponsiveDesign(doc, pageName);
      
      // 检查组件一致性
      this.checkComponentConsistency(doc, pageName);
      
      // 检查无障碍性
      this.checkAccessibility(doc, pageName);
      
      this.results.passed.push({
        page: pageName,
        message: '所有检查通过'
      });
      
    } catch (error) {
      this.results.issues.push({
        page: pageName,
        type: 'ERROR',
        message: `检查失败: ${error.message}`
      });
    }
  }

  /**
   * 检查CSS文件
   */
  checkCSSFiles(doc, pageName) {
    const links = doc.querySelectorAll('link[rel="stylesheet"]');
    const missingCSS = [];
    
    this.requiredCSS.forEach(cssFile => {
      const found = Array.from(links).some(link => 
        link.getAttribute('href').includes(cssFile)
      );
      if (!found) {
        missingCSS.push(cssFile);
      }
    });

    if (missingCSS.length > 0) {
      this.results.warnings.push({
        page: pageName,
        type: 'MISSING_CSS',
        message: `缺少CSS文件: ${missingCSS.join(', ')}`
      });
    }
  }

  /**
   * 检查JavaScript文件
   */
  checkJSFiles(doc, pageName) {
    const scripts = doc.querySelectorAll('script[src]');
    const missingScripts = [];
    
    this.requiredScripts.forEach(scriptFile => {
      const found = Array.from(scripts).some(script => 
        script.getAttribute('src').includes(scriptFile)
      );
      if (!found) {
        missingScripts.push(scriptFile);
      }
    });

    if (missingScripts.length > 0) {
      this.results.warnings.push({
        page: pageName,
        type: 'MISSING_SCRIPT',
        message: `缺少JavaScript文件: ${missingScripts.join(', ')}`
      });
    }
  }

  /**
   * 检查主题色变量
   */
  checkThemeColors(doc, pageName) {
    const style = doc.querySelector('style') || 
                  doc.querySelector('link[rel="stylesheet"]');
    
    if (!style) {
      this.results.warnings.push({
        page: pageName,
        type: 'NO_THEME',
        message: '未找到主题样式'
      });
      return;
    }

    const computedStyle = doc.documentElement.style;
    const missingColors = [];
    
    this.colorVariables.forEach(colorVar => {
      const value = getComputedStyle(doc.documentElement).getPropertyValue(colorVar);
      if (!value || value.trim() === '') {
        missingColors.push(colorVar);
      }
    });

    if (missingColors.length > 0) {
      this.results.warnings.push({
        page: pageName,
        type: 'MISSING_COLORS',
        message: `缺少主题色变量: ${missingColors.join(', ')}`
      });
    }
  }

  /**
   * 检查响应式设计
   */
  checkResponsiveDesign(doc, pageName) {
    const viewport = doc.querySelector('meta[name="viewport"]');
    if (!viewport) {
      this.results.warnings.push({
        page: pageName,
        type: 'NO_VIEWPORT',
        message: '缺少viewport meta标签'
      });
    }

    // 检查媒体查询
    const style = doc.querySelector('style');
    if (style) {
      const hasMediaQueries = style.textContent.includes('@media');
      if (!hasMediaQueries) {
        this.results.warnings.push({
          page: pageName,
          type: 'NO_MEDIA_QUERIES',
          message: '缺少媒体查询，可能不支持响应式设计'
        });
      }
    }

    // 检查图片响应式
    const images = doc.querySelectorAll('img');
    images.forEach(img => {
      const hasMaxWidth = img.style.maxWidth || 
                         img.getAttribute('style')?.includes('max-width');
      if (!hasMaxWidth && !img.classList.contains('responsive')) {
        this.results.warnings.push({
          page: pageName,
          type: 'IMAGE_NOT_RESPONSIVE',
          message: '图片可能不具有响应式特性'
        });
      }
    });
  }

  /**
   * 检查组件一致性
   */
  checkComponentConsistency(doc, pageName) {
    Object.entries(this.commonSelectors).forEach(([componentType, selectors]) => {
      selectors.forEach(selector => {
        const elements = doc.querySelectorAll(selector);
        elements.forEach(element => {
          // 检查按钮大小一致性
          if (componentType === 'buttons') {
            this.checkButtonConsistency(element, pageName);
          }
          
          // 检查卡片圆角一致性
          if (componentType === 'cards') {
            this.checkCardConsistency(element, pageName);
          }
          
          // 检查导航激活状态
          if (componentType === 'navigation') {
            this.checkNavigationConsistency(element, pageName);
          }
        });
      });
    });
  }

  /**
   * 检查按钮一致性
   */
  checkButtonConsistency(button, pageName) {
    const computedStyle = getComputedStyle(button);
    const padding = computedStyle.padding;
    const borderRadius = computedStyle.borderRadius;
    const fontSize = computedStyle.fontSize;
    
    // 检查圆角一致性
    if (!borderRadius || borderRadius === '0px') {
      this.results.warnings.push({
        page: pageName,
        type: 'BUTTON_NO_BORDER_RADIUS',
        message: '按钮缺少圆角设计'
      });
    }
    
    // 检查内边距一致性
    if (!padding || padding === '0px') {
      this.results.warnings.push({
        page: pageName,
        type: 'BUTTON_NO_PADDING',
        message: '按钮缺少内边距'
      });
    }
  }

  /**
   * 检查卡片一致性
   */
  checkCardConsistency(card, pageName) {
    const computedStyle = getComputedStyle(card);
    const borderRadius = computedStyle.borderRadius;
    const boxShadow = computedStyle.boxShadow;
    
    // 检查圆角一致性
    if (!borderRadius || borderRadius === '0px') {
      this.results.warnings.push({
        page: pageName,
        type: 'CARD_NO_BORDER_RADIUS',
        message: '卡片缺少圆角设计'
      });
    }
    
    // 检查阴影一致性
    if (!boxShadow || boxShadow === 'none') {
      this.results.warnings.push({
        page: pageName,
        type: 'CARD_NO_SHADOW',
        message: '卡片缺少阴影效果'
      });
    }
  }

  /**
   * 检查导航一致性
   */
  checkNavigationConsistency(navItem, pageName) {
    const hasActiveClass = navItem.classList.contains('active');
    const hasActiveState = navItem.getAttribute('aria-current') === 'page';
    
    if (hasActiveClass && !hasActiveState) {
      this.results.warnings.push({
        page: pageName,
        type: 'NAV_NO_ARIA_CURRENT',
        message: '导航激活状态缺少ARIA属性'
      });
    }
  }

  /**
   * 检查无障碍性
   */
  checkAccessibility(doc, pageName) {
    // 检查alt属性
    const images = doc.querySelectorAll('img');
    images.forEach(img => {
      if (!img.getAttribute('alt')) {
        this.results.warnings.push({
          page: pageName,
          type: 'IMAGE_NO_ALT',
          message: '图片缺少alt属性'
        });
      }
    });

    // 检查按钮标签
    const buttons = doc.querySelectorAll('button');
    buttons.forEach(button => {
      if (!button.textContent.trim() && !button.getAttribute('aria-label')) {
        this.results.warnings.push({
          page: pageName,
          type: 'BUTTON_NO_LABEL',
          message: '按钮缺少文本标签或ARIA标签'
        });
      }
    });

    // 检查标题层级
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let lastLevel = 0;
    headings.forEach(heading => {
      const level = parseInt(heading.tagName.charAt(1));
      if (level > lastLevel + 1) {
        this.results.warnings.push({
          page: pageName,
          type: 'HEADING_SKIPPED',
          message: `标题层级跳跃: H${lastLevel} 到 H${level}`
        });
      }
      lastLevel = level;
    });
  }

  /**
   * 生成检查报告
   */
  generateReport() {
    const report = {
      检查时间: new Date().toLocaleString('zh-CN'),
      检查总结: {
        总页面数: this.results.totalPages,
        已检查页面数: this.results.checkedPages,
        严重问题数: this.results.issues.length,
        警告数: this.results.warnings.length,
        通过数: this.results.passed.length
      },
      严重问题: this.results.issues,
      警告: this.results.warnings,
      通过: this.results.passed
    };

    console.log('=== UI一致性检查报告 ===');
    console.log(JSON.stringify(report, null, 2));
    
    // 显示摘要
    this.displaySummary(report);
  }

  /**
   * 显示检查摘要
   */
  displaySummary(report) {
    console.log('\n=== 检查摘要 ===');
    console.log(`总页面数: ${report.检查总结.总页面数}`);
    console.log(`已检查页面数: ${report.检查总结.已检查页面数}`);
    console.log(`严重问题数: ${report.检查总结.严重问题数}`);
    console.log(`警告数: ${report.检查总结.警告数}`);
    console.log(`通过数: ${report.检查总结.通过数}`);
    
    if (report.严重问题.length > 0) {
      console.log('\n=== 严重问题 ===');
      report.严重问题.forEach(issue => {
        console.log(`[${issue.page}] ${issue.message}`);
      });
    }
    
    if (report.警告.length > 0) {
      console.log('\n=== 警告 ===');
      report.警告.forEach(warning => {
        console.log(`[${warning.page}] ${warning.message}`);
      });
    }
    
    if (report.通过.length > 0) {
      console.log('\n=== 通过 ===');
      report.通过.forEach(pass => {
        console.log(`[${pass.page}] ${pass.message}`);
      });
    }
  }
}

// 执行检查
document.addEventListener('DOMContentLoaded', () => {
  const checker = new UIConsistencyChecker();
  checker.checkAllPages();
});