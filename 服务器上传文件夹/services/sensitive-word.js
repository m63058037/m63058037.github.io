import { supabase } from '../config/supabase.js';
import { normalize } from '../utils/text-normalizer.js';

/** 初始敏感词词典 —— 严格取自《敏感词.txt》v1.0，未增删任何词。
 *  仅作为数据表 sensitive_words 未就绪（迁移前）的兜底镜像；
 *  数据表就绪后以数据库词典为准（避免业务代码内维护完整词典）。 */
export const INITIAL_DICTIONARY = [
  // 中文 L1
  { word: '操', lang: 'zh', level: 1, rule_type: 'char_indep' },
  { word: '操你', lang: 'zh', level: 1, rule_type: 'contains' },
  { word: '妈的', lang: 'zh', level: 1, rule_type: 'contains' },
  { word: '他妈的', lang: 'zh', level: 1, rule_type: 'contains' },
  { word: '他妈', lang: 'zh', level: 1, rule_type: 'contains' },
  { word: '傻逼', lang: 'zh', level: 1, rule_type: 'contains' },
  { word: '傻b', lang: 'zh', level: 1, rule_type: 'contains' },   // 傻B（大小写归一后）
  { word: '煞笔', lang: 'zh', level: 1, rule_type: 'contains' },
  { word: '沙比', lang: 'zh', level: 1, rule_type: 'contains' },
  { word: '脑残', lang: 'zh', level: 1, rule_type: 'contains' },
  { word: '白痴', lang: 'zh', level: 1, rule_type: 'contains' },
  { word: '废物', lang: 'zh', level: 1, rule_type: 'contains' },
  { word: '垃圾', lang: 'zh', level: 1, rule_type: 'contains' },
  { word: '滚', lang: 'zh', level: 1, rule_type: 'char_indep' },
  { word: '去死', lang: 'zh', level: 1, rule_type: 'contains' },
  // 中文数字组合（独立出现才命中；等级取 L1 保守档，仅拦截不记录）
  { word: '91', lang: 'zh', level: 1, rule_type: 'digit' },
  { word: '78', lang: 'zh', level: 1, rule_type: 'digit' },
  // 中文 L2
  { word: '操你妈', lang: 'zh', level: 2, rule_type: 'combo' },
  { word: '草你妈', lang: 'zh', level: 2, rule_type: 'combo' },
  { word: '草泥马', lang: 'zh', level: 2, rule_type: 'combo' },
  { word: '死妈', lang: 'zh', level: 2, rule_type: 'combo' },
  { word: '死你妈', lang: 'zh', level: 2, rule_type: 'combo' },
  { word: '全家去死', lang: 'zh', level: 2, rule_type: 'combo' },
  { word: '你妈死了', lang: 'zh', level: 2, rule_type: 'combo' },
  { word: '你妈的', lang: 'zh', level: 2, rule_type: 'contains' },
  { word: '妈逼', lang: 'zh', level: 2, rule_type: 'combo' },
  { word: '逼', lang: 'zh', level: 2, rule_type: 'char_indep' },
  { word: '婊子', lang: 'zh', level: 2, rule_type: 'contains' },
  { word: '贱人', lang: 'zh', level: 2, rule_type: 'contains' },
  { word: '畜生', lang: 'zh', level: 2, rule_type: 'contains' },
  { word: '狗东西', lang: 'zh', level: 2, rule_type: 'contains' },
  { word: '狗日的', lang: 'zh', level: 2, rule_type: 'contains' },
  { word: '杂种', lang: 'zh', level: 2, rule_type: 'contains' },
  // 中文 L3
  { word: '去你妈的', lang: 'zh', level: 3, rule_type: 'combo' },
  { word: '你全家都去死', lang: 'zh', level: 3, rule_type: 'combo' },
  { word: '全家死光', lang: 'zh', level: 3, rule_type: 'combo' },
  { word: '死全家', lang: 'zh', level: 3, rule_type: 'combo' },
  { word: '全家不得好死', lang: 'zh', level: 3, rule_type: 'combo' },
  // 英文 L1
  { word: 'damn', lang: 'en', level: 1, rule_type: 'english' },
  { word: 'hell', lang: 'en', level: 1, rule_type: 'english' },
  { word: 'crap', lang: 'en', level: 1, rule_type: 'english' },
  { word: 'idiot', lang: 'en', level: 1, rule_type: 'english' },
  { word: 'stupid', lang: 'en', level: 1, rule_type: 'english' },
  { word: 'shut up', lang: 'en', level: 1, rule_type: 'english' },
  { word: 'dumb', lang: 'en', level: 1, rule_type: 'english' },
  // 英文 L2
  { word: 'fuck', lang: 'en', level: 2, rule_type: 'english' },
  { word: 'fucking', lang: 'en', level: 2, rule_type: 'english' },
  { word: 'fucker', lang: 'en', level: 2, rule_type: 'english' },
  { word: 'motherfucker', lang: 'en', level: 2, rule_type: 'english' },
  { word: 'shit', lang: 'en', level: 2, rule_type: 'english' },
  { word: 'bullshit', lang: 'en', level: 2, rule_type: 'english' },
  { word: 'bitch', lang: 'en', level: 2, rule_type: 'english' },
  { word: 'asshole', lang: 'en', level: 2, rule_type: 'english' },
  { word: 'dick', lang: 'en', level: 2, rule_type: 'english' },
  { word: 'bastard', lang: 'en', level: 2, rule_type: 'english' },
  { word: 'son of a bitch', lang: 'en', level: 2, rule_type: 'english' },
  // 英文 L3
  { word: 'fuck you', lang: 'en', level: 3, rule_type: 'english' },
  { word: 'fuck off', lang: 'en', level: 3, rule_type: 'english' },
  { word: 'go to hell', lang: 'en', level: 3, rule_type: 'english' },
  { word: 'piece of shit', lang: 'en', level: 3, rule_type: 'english' },
  { word: 'you are a bitch', lang: 'en', level: 3, rule_type: 'english' },
  { word: 'you are an asshole', lang: 'en', level: 3, rule_type: 'english' }
];

/* eslint-disable no-useless-escape */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/* eslint-enable no-useless-escape */

const CH = '[\u4e00-\u9fa5a-zA-Z0-9]';

/** 依据 rule_type 对已归一化视图做匹配 */
export function matchWord(ruleType, norm, word) {
  switch (ruleType) {
    case 'contains':
      return norm.A.includes(word);
    case 'combo':
      return norm.C.includes(word);
    case 'char_indep': {
      const re = new RegExp('(^|[^\\u4e00-\\u9fa5a-zA-Z0-9])' + escapeRegExp(word) + '([^\\u4e00-\\u9fa5a-zA-Z0-9]|$)');
      return re.test(norm.A);
    }
    case 'digit': {
      const re = new RegExp('(?<!\\d)' + escapeRegExp(word) + '(?!\\d)');
      return re.test(norm.A);
    }
    case 'english': {
      const core = word.split('').map(c => escapeRegExp(c)).join('[^a-z0-9\u4e00-\u9fa5]{0,2}');
      const re = new RegExp('(^|[^a-z])' + core + '($|[^a-z])');
      return re.test(norm.english);
    }
    default:
      return false;
  }
}

let cachedDictionary = null;
let loadPromise = null;

function sortByLevelDesc(list) {
  return [...list].sort((a, b) => b.level - a.level);
}

/** 从数据库加载激活词典；失败时回退到初始词典镜像 */
async function loadDictionaryFromDB() {
  const { data, error } = await supabase.rpc('get_active_sensitive_words');
  if (error) {
    return null;
  }
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  return data.map(r => ({
    word: r.word,
    lang: r.lang,
    level: r.level,
    rule_type: r.rule_type
  }));
}

function loadDictionarySync() {
  return sortByLevelDesc(INITIAL_DICTIONARY);
}

export const sensitiveWordService = {
  /** 确保词典已加载（缓存）。返回按等级降序的词条数组。 */
  async ensureDictionary(force = false) {
    if (cachedDictionary && !force) return cachedDictionary;
    if (loadPromise && !force) return loadPromise;
    loadPromise = (async () => {
      let dict = null;
      try { dict = await loadDictionaryFromDB(); } catch (e) { dict = null; }
      cachedDictionary = dict && dict.length ? sortByLevelDesc(dict) : loadDictionarySync();
      return cachedDictionary;
    })();
    const result = await loadPromise;
    loadPromise = null;
    return result;
  },

  /** 刷新词典（dev_admin 修改词典后调用） */
  refresh() {
    cachedDictionary = null;
    return this.ensureDictionary(true);
  },

  /** 对外诊断/一致性命中。数据表未就绪时返回 fallback 词典。 */
  getDictionarySync() {
    return cachedDictionary || loadDictionarySync();
  },

  /**
   * 检测文本，返回最高命中等级。
   * @param {string} text
   * @returns {{level:number, word:string|null, ruleType:string|null}}
   */
  check(text) {
    if (typeof text !== 'string' || !text.trim()) {
      return { level: 0, word: null, ruleType: null };
    }
    const dict = cachedDictionary || loadDictionarySync();
    if (!dict.length) {
      return { level: 0, word: null, ruleType: null };
    }
    const norm = normalize(text);
    if (!norm.A) {
      return { level: 0, word: null, ruleType: null };
    }
    for (const item of dict) {
      if (matchWord(item.rule_type, norm, item.word)) {
        return { level: item.level, word: item.word, ruleType: item.rule_type };
      }
    }
    return { level: 0, word: null, ruleType: null };
  },

  /** 检测并有明确命中（用于 Service 层返回文案） */
  formatBlockMessage() {
    return {
      success: false,
      data: null,
      message: '内容包含不适宜词汇，请修改后重新提交',
      statusCode: 400
    };
  },

  /**
   * Service 层统一检测入口（异步，先确保词典加载，DB 词典优先）。
   * 命中返回 400 拦截响应；未命中返回 null。
   */
  async verify(text) {
    try { await this.ensureDictionary().catch(() => {}); } catch (e) { /* 词典加载失败仍可检测 */ }
    const hit = this.check(text);
    if (hit.level > 0) return this.formatBlockMessage();
    return null;
  }
};

export { normalize };
export default sensitiveWordService;