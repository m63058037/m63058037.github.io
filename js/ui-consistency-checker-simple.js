#!/usr/bin/env node

/**
 * UI一致性检查脚本 - 简化版
 * 检查关键页面的基本UI一致性
 */

const fs = require('fs');
const path = require('path');

class SimpleUIChecker {
  constructor() {
    this.results = {
      checkedPages: [],
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
    
    this.keyPages = [
      'home.html',
      'search.html', 
      'post.html',
      'admin.html',
      'login.html',
      'register.html'
    ];
  }

  /**
   * 开始检查
   */
  checkAllPages() {
    console.log('=== UI一致性检查开始 ===\n');
    
    this.keyPages.forEach(page => {
      this.checkPage(page);
    });
    
    this.generateReport();
  }

  /**
   * 检查单个页面
   */
  checkPage(pageName) {
    try {
      const filePath = path.join(__dirname, '..', 'pages', pageName);
      const content = fs.readFileSync(filePath, 'utf8');
      
      const pageResult = {
        page: pageName,
        cssFiles: [],
        scriptFiles: [],
        hasLottie: false,
        hasThemeColors: false,
        issues: [],
        warnings: []
      };

      // 检查CSS文件
      this.checkCSSFiles(content, pageResult);
      
      // 检查JavaScript文件
      this.checkJSFiles(content, pageResult);
      
      // 检查Lottie图标
      this.checkLottieIcons(content, pageResult);
      
      // 检查主题颜色
      this.checkThemeColors(content, pageResult);
      
      // 检查响应式设计
      this.checkResponsiveDesign(content, pageResult);
      
      // 检查Material Design 3组件
      this.checkMaterialDesign3(content, pageResult);
      
      // 记录结果
      this.results.checkedPages.push(pageResult);
      
      if (pageResult.issues.length === 0 && pageResult.warnings.length === 0) {
        this.results.passed.push({
          page: pageName,
          message: '所有检查通过'
        });
      } else {
        pageResult.issues.forEach(issue => {
          this.results.issues.push({
            page: pageName,
            ...issue
          });
        });
        
        pageResult.warnings.forEach(warning => {
          this.results.warnings.push({
            page: pageName,
            ...warning
          });
        });
      }
      
    } catch (error) {
      this.results.issues.push({
        page: pageName,
        type: 'FILE_ERROR',
        message: `文件读取失败: ${error.message}`
      });
    }
  }

  /**
   * 检查CSS文件
   */
  checkCSSFiles(content, pageResult) {
    this.requiredCSS.forEach(cssFile => {
      if (content.includes(cssFile)) {
        pageResult.cssFiles.push(cssFile);
      } else {
        pageResult.issues.push({
          type: 'MISSING_CSS',
          message: `缺少CSS文件: ${cssFile}`
        });
      }
    });
  }

  /**
   * 检查JavaScript文件
   */
  checkJSFiles(content, pageResult) {
    this.requiredScripts.forEach(scriptFile => {
      if (content.includes(scriptFile)) {
        pageResult.scriptFiles.push(scriptFile);
      } else {
        pageResult.warnings.push({
          type: 'MISSING_SCRIPT',
          message: `缺少JavaScript文件: ${scriptFile}`
        });
      }
    });
  }

  /**
   * 检查Lottie图标
   */
  checkLottieIcons(content, pageResult) {
    if (content.includes('lottie-icon-utils.js')) {
      pageResult.hasLottie = true;
    } else {
      pageResult.warnings.push({
        type: 'MISSING_LOTTIE',
        message: '缺少Lottie图标库'
      });
    }
  }

  /**
   * 检查主题颜色
   */
  checkThemeColors(content, pageResult) {
    const themeColors = [
      '--md-sys-color-primary',
      '--md-sys-color-secondary',
      '--md-sys-color-background',
      '--md-sys-color-on-surface'
    ];
    
    const foundColors = themeColors.filter(color => content.includes(color));
    
    if (foundColors.length >= 3) {
      pageResult.hasThemeColors = true;
    } else {
      pageResult.warnings.push({
        type: 'MISSING_THEME_COLORS',
        message: `缺少主题色变量 (找到${foundColors.length}/4个)`
      });
    }
  }

  /**
   * 检查响应式设计
   */
  checkResponsiveDesign(content, pageResult) {
    if (!content.includes('viewport')) {
      pageResult.warnings.push({
        type: 'NO_VIEWPORT',
        message: '缺少viewport meta标签'
      });
    }
    
    if (!content.includes('@media')) {
      pageResult.warnings.push({
        type: 'NO_MEDIA_QUERIES',
        message: '缺少媒体查询'
      });
    }
  }

  /**
   * 检查Material Design 3组件
   */
  checkMaterialDesign3(content, pageResult) {
    const md3Components = [
      'md3-button',
      'md3-card',
      'md3-snackbar',
      'cubic-bezier'
    ];
    
    const foundComponents = md3Components.filter(comp => content.includes(comp));
    
    if (foundComponents.length >= 2) {
      pageResult.hasMD3 = true;
    } else {
      pageResult.warnings.push({
        type: 'MISSING_MD3',
        message: `Material Design 3组件不足 (找到${foundComponents.length}/${md3Components.length}个)`
      });
    }
  }

  /**
   * 生成报告
   */
  generateReport() {
    console.log('=== UI一致性检查报告 ===');
    console.log(`检查时间: ${new Date().toLocaleString('zh-CN')}`);
    console.log(`检查页面数: ${this.results.checkedPages.length}\n`);
    
    // 显示每个页面的详细结果
    this.results.checkedPages.forEach(page => {
      console.log(`\n--- ${page} ---`);
      console.log(`CSS文件: ${page.cssFiles.join(', ') || '无'}`);
      console.log(`JS文件: ${page.scriptFiles.join(', ') || '无'}`);
      console.log(`Lottie图标: ${page.hasLottie ? '✓' : '✗'}`);
      console.log(`主题颜色: ${page.hasThemeColors ? '✓' : '✗'}`);
      console.log(`Material Design 3: ${page.hasMD3 ? '✓' : '✗'}`);
      
      if (page.issues.length > 0) {
        console.log('\n严重问题:');
        page.issues.forEach(issue => {
          console.log(`  ❌ ${issue.message}`);
        });
      }
      
      if (page.warnings.length > 0) {
        console.log('\n警告:');
        page.warnings.forEach(warning => {
          console.log(`  ⚠️ ${warning.message}`);
        });
      }
      
      if (page.issues.length === 0 && page.warnings.length === 0) {
        console.log('✅ 所有检查通过');
      }
    });
    
    // 显示总结
    console.log('\n=== 检查总结 ===');
    console.log(`总检查页面数: ${this.results.checkedPages.length}`);
    console.log(`严重问题数: ${this.results.issues.length}`);
    console.log(`警告数: ${this.results.warnings.length}`);
    console.log(`通过数: ${this.results.passed.length}`);
    
    if (this.results.issues.length > 0) {
      console.log('\n=== 严重问题汇总 ===');
      this.results.issues.forEach(issue => {
        console.log(`[${issue.page}] ${issue.message}`);
      });
    }
    
    if (this.results.warnings.length > 0) {
      console.log('\n=== 警告汇总 ===');
      this.results.warnings.forEach(warning => {
        console.log(`[${warning.page}] ${warning.message}`);
      });
    }
    
    // 显示建议
    this.showSuggestions();
  }

  /**
   * 显示建议
   */
  showSuggestions() {
    console.log('\n=== 改进建议 ===');
    
    const hasMissingLottie = this.results.warnings.some(w => w.type === 'MISSING_LOTTIE');
    if (hasMissingLottie) {
      console.log('• 建议为所有页面添加Lottie图标库以提升用户体验');
    }
    
    const hasMissingTheme = this.results.warnings.some(w => w.type === 'MISSING_THEME_COLORS');
    if (hasMissingTheme) {
      console.log('• 建议统一所有页面的主题色系统');
    }
    
    const hasMissingMD3 = this.results.warnings.some(w => w.type === 'MISSING_MD3');
    if (hasMissingMD3) {
      console.log('• 建议在更多页面中应用Material Design 3组件规范');
    }
    
    const hasViewportIssues = this.results.warnings.some(w => w.type === 'NO_VIEWPORT');
    if (hasViewportIssues) {
      console.log('• 建议为所有页面添加viewport meta标签以确保移动端兼容性');
    }
    
    console.log('\n=== 检查完成 ===');
  }
}

// 执行检查
const checker = new SimpleUIChecker();
checker.checkAllPages();