/**
 * 全站主题加载入口（各页面在业务脚本之前引入）
 */
import { themeService } from '../services/theme.js';
import { ensureFdi } from './fdi.js';

ensureFdi();
themeService.applyCachedSync();
await themeService.ensureThemeLoaded();
