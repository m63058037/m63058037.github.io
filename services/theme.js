import { supabase } from '../config/supabase.js';
import { apiService } from './api.js';
import {
  DEFAULT_SITE_THEME,
  FORMAL_THEME_NAME,
  SECONDARY_BG_TRANSPARENT_TOKEN
} from '../config/theme-defaults.js';

const CACHE_KEY = 'site_theme_v1';
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/** 主题字段 → 写入 documentElement 的 CSS 变量 */
const CSS_VAR_MAP = {
  button: {
    primaryBg: ['--md-sys-color-primary', '--md-sys-color-surface-tint'],
    primaryText: ['--md-sys-color-on-primary'],
    primaryHover: ['--md-sys-color-primary-dark'],
    secondaryBg: ['--site-theme-button-secondary-bg'],
    secondaryText: ['--site-theme-button-secondary-text'],
    disabledBg: ['--site-theme-button-disabled-bg'],
    disabledText: ['--site-theme-button-disabled-text']
  },
  background: {
    page: ['--md-sys-color-background', '--md-sys-color-surface', '--md-sys-color-surface-bright'],
    secondary: ['--md-sys-color-surface-container-low'],
    input: ['--md-sys-color-surface-container'],
    special: ['--md-sys-color-surface-container-lowest']
  },
  card: {
    background: ['--site-theme-card-bg'],
    border: ['--site-theme-card-border'],
    inner: ['--site-theme-card-inner']
  },
  text: {
    primary: ['--md-sys-color-on-background', '--md-sys-color-on-surface'],
    secondary: ['--md-sys-color-on-surface-variant'],
    weak: ['--md-sys-color-outline'],
    link: ['--site-theme-text-link'],
    emphasis: ['--site-theme-text-emphasis']
  }
};

function deepMergeDefaults(partial) {
  const out = JSON.parse(JSON.stringify(DEFAULT_SITE_THEME));
  if (!partial || typeof partial !== 'object') return out;
  for (const cat of Object.keys(out)) {
    if (partial[cat] && typeof partial[cat] === 'object') {
      for (const key of Object.keys(out[cat])) {
        if (typeof partial[cat][key] === 'string') {
          out[cat][key] = partial[cat][key];
        }
      }
    }
  }
  return out;
}

export function isValidHexColor(value) {
  return typeof value === 'string' && HEX_RE.test(value.trim());
}

export function normalizeThemeConfig(raw) {
  return deepMergeDefaults(raw);
}

function cssValueForField(category, field, hex) {
  if (category === 'button' && field === 'secondaryBg' && hex.toUpperCase() === SECONDARY_BG_TRANSPARENT_TOKEN) {
    return 'transparent';
  }
  return hex;
}

/**
 * 将主题配置应用到 :root（不修改 styles.css 文件）
 */
export function applyThemeToDocument(config) {
  const merged = normalizeThemeConfig(config);
  const root = document.documentElement;

  for (const [category, fields] of Object.entries(CSS_VAR_MAP)) {
    for (const [field, vars] of Object.entries(fields)) {
      const hex = merged[category]?.[field];
      if (!isValidHexColor(hex)) continue;
      const cssVal = cssValueForField(category, field, hex.trim());
      for (const v of vars) {
        root.style.setProperty(v, cssVal);
      }
    }
  }

  root.style.setProperty('accent-color', merged.button.primaryBg);
  return merged;
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.updatedAt) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function writeCache(themeName, config, updatedAt) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      themeName: themeName || FORMAL_THEME_NAME,
      config: normalizeThemeConfig(config),
      updatedAt
    }));
  } catch (e) {
    /* quota / private mode */
  }
}

export function clearThemeCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch (e) {
    /* ignore */
  }
}

/** 相对亮度 (WCAG) */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const rs = ((n >> 16) & 255) / 255;
  const gs = ((n >> 8) & 255) / 255;
  const bs = (n & 255) / 255;
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(rs) + 0.7152 * f(gs) + 0.0722 * f(bs);
}

export function contrastRatio(hex1, hex2) {
  if (!isValidHexColor(hex1) || !isValidHexColor(hex2)) return null;
  const L1 = luminance(hex1);
  const L2 = luminance(hex2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 后台对比度提示（不阻止保存） */
export function getThemeContrastWarnings(config) {
  const c = normalizeThemeConfig(config);
  const warnings = [];
  const pairs = [
    ['主文字 / 页面背景', c.text.primary, c.background.page],
    ['次文字 / 页面背景', c.text.secondary, c.background.page],
    ['主按钮文字 / 主按钮背景', c.button.primaryText, c.button.primaryBg],
    ['卡片内文字 / 卡片背景', c.text.primary, c.card.background]
  ];
  for (const [label, fg, bg] of pairs) {
    if (!fg || !bg) continue;
    if (bg.toUpperCase() === SECONDARY_BG_TRANSPARENT_TOKEN) continue;
    const ratio = contrastRatio(fg, bg);
    if (ratio !== null && ratio < 4.5) {
      warnings.push(`${label} 对比度偏低（约 ${ratio.toFixed(1)}:1），可能影响阅读。`);
    }
  }
  return warnings;
}

export function validateThemeConfigForSave(config) {
  const merged = normalizeThemeConfig(config);
  for (const [category, fields] of Object.entries(DEFAULT_SITE_THEME)) {
    for (const key of Object.keys(fields)) {
      const val = merged[category][key];
      if (!isValidHexColor(val)) {
        return { valid: false, message: `颜色格式无效：${category}.${key}（需 #RRGGBB）` };
      }
    }
  }
  return { valid: true, config: merged };
}

let loadPromise = null;

export const themeService = {
  DEFAULT_SITE_THEME,
  FORMAL_THEME_NAME,

  applyThemeToDocument,
  normalizeThemeConfig,
  validateThemeConfigForSave,
  getThemeContrastWarnings,
  clearThemeCache,

  /** 同步：优先 sessionStorage，避免首屏长时间无主题 */
  applyCachedSync() {
    const cached = readCache();
    if (cached?.config) {
      applyThemeToDocument(cached.config);
      return true;
    }
    applyThemeToDocument(DEFAULT_SITE_THEME);
    return false;
  },

  /**
   * 全站入口：缓存 → 远程（按 updated_at 失效）
   */
  async ensureThemeLoaded() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      this.applyCachedSync();
      try {
        const remote = await this.fetchPublicTheme();
        if (!remote) return { applied: DEFAULT_SITE_THEME, source: 'default' };

        const cached = readCache();
        if (cached && cached.updatedAt === remote.updatedAt && cached.config) {
          applyThemeToDocument(cached.config);
          return { applied: cached.config, source: 'cache' };
        }

        applyThemeToDocument(remote.config);
        writeCache(remote.themeName, remote.config, remote.updatedAt);
        return { applied: remote.config, source: 'remote' };
      } catch (e) {
        applyThemeToDocument(DEFAULT_SITE_THEME);
        return { applied: DEFAULT_SITE_THEME, source: 'fallback' };
      } finally {
        loadPromise = null;
      }
    })();
    return loadPromise;
  },

  async fetchPublicTheme() {
    const { data, error } = await supabase.rpc('get_public_site_theme');
    if (error) {
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.config) {
      return null;
    }
    return {
      themeName: row.theme_name || FORMAL_THEME_NAME,
      config: normalizeThemeConfig(row.config),
      updatedAt: row.updated_at || ''
    };
  },

  /** dev_admin：读取完整配置（RPC 内校验角色） */
  async fetchThemeForAdmin() {
    const response = await apiService.rpc('dev_admin_get_site_theme', {});
    if (!response.success) {
      return { success: false, error: response.message || '获取主题失败' };
    }
    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!row) {
      return {
        success: true,
        data: {
          themeName: FORMAL_THEME_NAME,
          config: normalizeThemeConfig(null),
          updatedAt: null
        }
      };
    }
    return {
      success: true,
      data: {
        themeName: row.theme_name || FORMAL_THEME_NAME,
        config: normalizeThemeConfig(row.config),
        updatedAt: row.updated_at
      }
    };
  },

  async saveTheme(config, themeName) {
    const check = validateThemeConfigForSave(config);
    if (!check.valid) {
      return { success: false, error: check.message };
    }
    const response = await apiService.rpc('dev_admin_save_site_theme', {
      p_config: check.config,
      p_theme_name: themeName || FORMAL_THEME_NAME
    });
    if (!response.success) {
      return { success: false, error: response.message || '保存失败' };
    }
    clearThemeCache();
    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    const updatedAt = row?.updated_at || new Date().toISOString();
    writeCache(themeName || FORMAL_THEME_NAME, check.config, updatedAt);
    applyThemeToDocument(check.config);
    return { success: true, data: row };
  },

  async resetThemeToDefault() {
    const response = await apiService.rpc('dev_admin_reset_site_theme', {});
    if (!response.success) {
      return { success: false, error: response.message || '恢复默认失败' };
    }
    clearThemeCache();
    applyThemeToDocument(DEFAULT_SITE_THEME);
    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (row?.updated_at) {
      writeCache(FORMAL_THEME_NAME, DEFAULT_SITE_THEME, row.updated_at);
    }
    return { success: true, data: row };
  },

  /** 后台实时预览（未保存） */
  previewTheme(config) {
    applyThemeToDocument(config);
  },

  revertPreviewToSaved(savedConfig) {
    applyThemeToDocument(savedConfig);
  }
};

export default themeService;
