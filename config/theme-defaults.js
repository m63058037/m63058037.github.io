/**
 * 执信论坛 · 全站 UI 主题默认配置（正式版 1.0）
 * 与 css/styles.css :root 中 MD3 色值一致；数据库无配置或读取失败时回退到此对象。
 */

export const FORMAL_THEME_NAME = '正式版 1.0';

/** @typedef {{ button: object, background: object, card: object, text: object }} SiteThemeConfig */

/** @type {SiteThemeConfig} */
export const DEFAULT_SITE_THEME = {
  button: {
    primaryBg: '#4F8A4F',
    primaryText: '#FFFFFF',
    secondaryBg: '#000000',
    secondaryText: '#4F8A4F',
    primaryHover: '#3F7340',
    disabledBg: '#D5DBD0',
    disabledText: '#9AA096'
  },
  background: {
    page: '#EFF5EB',
    secondary: '#F0F5EC',
    input: '#E8F0E6',
    special: '#F8FBF6'
  },
  card: {
    background: '#F0F5EC',
    border: '#C2C9BE',
    inner: '#E8F0E6'
  },
  text: {
    primary: '#191D17',
    secondary: '#424940',
    weak: '#72796F',
    link: '#4F8A4F',
    emphasis: '#1B3B1C'
  }
};

/** secondaryBg 使用 #000000 表示「透明次按钮」（与正式版全局 btn-secondary 一致） */
export const SECONDARY_BG_TRANSPARENT_TOKEN = '#000000';

export const THEME_CATEGORY_LABELS = {
  button: '按钮',
  background: '背景',
  card: '卡片',
  text: '文字'
};

export const THEME_FIELD_LABELS = {
  button: {
    primaryBg: '主按钮背景',
    primaryText: '主按钮文字',
    secondaryBg: '次按钮背景（#000000 = 透明）',
    secondaryText: '次按钮文字',
    primaryHover: '主按钮悬停',
    disabledBg: '按钮禁用背景',
    disabledText: '按钮禁用文字'
  },
  background: {
    page: '页面主背景',
    secondary: '次级背景',
    input: '输入框背景',
    special: '特殊区域背景'
  },
  card: {
    background: '卡片背景',
    border: '卡片边框',
    inner: '卡片内次级背景'
  },
  text: {
    primary: '主文字',
    secondary: '次文字',
    weak: '弱文字',
    link: '链接文字',
    emphasis: '强调文字'
  }
};

export default DEFAULT_SITE_THEME;
