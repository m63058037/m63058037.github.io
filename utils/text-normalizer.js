/**
 * 文本归一化器 — 敏感词检测专用
 * 严格遵循《敏感词.txt》与阶段0测试用例。
 * 只做必要的归一化，不做无限模糊匹配（宁可精确拦截）。
 *
 * 归一化产出的视图：
 *   A       保留空格与标点（用于 contains / char_indep / digit / english 边界判定）
 *   C       剔除全部非 中文/字母/数字 字符后连串（用于中文 combo 组合词）
 *   english 同 A 但小写化（英文检测使用）
 */

// 需要剔除的 Unicode 隐形/不可见字符（白名单式，避免扩大范围误伤）
const INVISIBLE_CHARS = [
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f, // 零宽空格 / 零宽连接符 / 零宽非连接符 / 左右方向标记
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, // 双向文本方向
  0x2060, 0x2061, 0x2062, 0x2063, 0x2064, // 单词连接符 / 数学连接类
  0xfeff,                                 // BOM
  0x00ad,                                 // 软连字符
  0x180e                                 // 蒙古语元音分隔符
];
const INVISIBLE_RE = new RegExp('[' + INVISIBLE_CHARS.map(c => '\\u' + c.toString(16).padStart(4, '0')).join('') + ']', 'g');

/** 全角 → 半角（仅处理提交换的全角字母/数字/可打印符号 + 全角空格） */
function toHalfWidth(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code === 0x3000) { // 全角空格
      out += ' ';
    } else if (code >= 0xff01 && code <= 0xff5e) { // 全角可打印字符
      out += String.fromCharCode(code - 0xfee0);
    } else {
      out += s[i];
    }
  }
  return out;
}

/** 输入归一化主入口 */
export function normalize(raw) {
  if (typeof raw !== 'string') return { A: '', C: '', english: '' };
  const noInvisible = raw.replace(INVISIBLE_RE, '');
  const half = toHalfWidth(noInvisible);
  const lower = half.toLowerCase();
  // A: 折叠连续空白为单个空格；保留中英/数字/空格/标点
  const A = lower.replace(/[^\S\u4e00-\u9fa5a-zA-Z0-9]+/g, ' ').trim();
  // C: 剔除所有非 中文/字母/数字 字符
  const C = lower.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  return { A, C, english: A.toLowerCase() };
}

/** 中文/英文/数字 单词字符（用于字符独立性 / 词边界判界） */
const WORD_CHAR_RE = /[\u4e00-\u9fa5a-zA-Z0-9]/;

export { INVISIBLE_RE };