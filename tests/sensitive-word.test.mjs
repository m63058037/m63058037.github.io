// 敏感词检测引擎 TC 回归脚本 —— 与项目业务代码隔离，仅测引擎。
// 测试数据（含敏感词）仅存在于本数据文件中；报告对敏感词原文一律脱敏为 [REDACTED]。
// 运行：node tests/sensitive-word.test.mjs
global.window = {
  supabase: {
    createClient: () => ({ rpc: async () => ({ data: null, error: new Error('no-db-in-test') }) })
  }
};

const { sensitiveWordService, normalize } = await import('../services/sensitive-word.js');

// helper：若干写作（enter）中带分隔的输入，便于表达换行用例
const NL = '\n';
const TAB = '\t';
const ZWSP = '\u200B';
const ZWNJ = '\u200C';
const ZWJ = '\u200D';
const BOM = '\uFEFF';
const SOFT = '\u00AD';

const DICT = sensitiveWordService.getDictionarySync();
if (!DICT.length) { console.error('FATAL: empty dictionary loaded'); process.exit(2); }
console.log(`[INFO] 词典已加载：${DICT.length} 条 (DB 未就绪，走初始镜像)`);

const cases = [

  // ---- 中文基础 ----
  { id: 'TC-01', input: '死', exp: 0 },
  { id: 'TC-02', input: '妈', exp: 0 },
  { id: 'TC-03', input: '笑死', exp: 0 },
  { id: 'TC-04', input: '累死了', exp: 0 },
  { id: 'TC-05', input: '这道题难死我了', exp: 0 },
  { id: 'TC-06', input: '气死我了', exp: 0 },
  { id: 'TC-07', input: '妈妈', exp: 0 },
  { id: 'TC-08', input: '死亡证明', exp: 0 },
  { id: 'TC-09', input: '他妈的', exp: 1 },
  { id: 'TC-10', input: '妈的', exp: 1 },
  { id: 'TC-11', input: '死妈', exp: 2 },
  { id: 'TC-12', input: '死-妈', exp: 2 },
  { id: 'TC-13', input: '死 妈', exp: 2 },
  { id: 'TC-14', input: '死' + NL + '妈', exp: 2 },
  { id: 'TC-15', input: '死。妈', exp: 2 },
  { id: 'TC-16', input: '死你妈', exp: 2 },
  { id: 'TC-17', input: '全家死光', exp: 3 },
  { id: 'TC-18', input: '你妈死了', exp: 2 },
  { id: 'TC-19', input: '全家不得好死', exp: 3 },
  { id: 'TC-20', input: '去你妈的', exp: 3 },
  { id: 'TC-21', input: '操', exp: 1 },
  { id: 'TC-22', input: '操你', exp: 1 },
  { id: 'TC-23', input: '操你妈', exp: 2 },
  { id: 'TC-24', input: '草你妈', exp: 2 },
  { id: 'TC-25', input: '草泥马', exp: 2 },
  { id: 'TC-26', input: '傻逼', exp: 1 },
  { id: 'TC-27', input: '傻Ｂ', exp: 1 }, // 全角 B
  { id: 'TC-27b', input: '傻B', exp: 1 },
  { id: 'TC-120', input: '操场', exp: 0 },
  { id: 'TC-121', input: '体育锻炼操', exp: 0 },
  { id: 'TC-122', input: '操作系统', exp: 0 },
  { id: 'TC-123', input: '操作', exp: 0 },
  { id: 'TC-124', input: '体操', exp: 0 },
  { id: 'TC-126', input: '不逼自己一下不知道自己有多优秀', exp: 0 },
  { id: 'TC-135', input: '傻', exp: 0 },
  { id: 'TC-136a', input: '逼格', exp: 0 },
  { id: 'TC-136b', input: '逼真', exp: 0 },
  { id: 'TC-134a', input: '滚动', exp: 0 },
  { id: 'TC-134b', input: '滚轮', exp: 0 },
  { id: 'TC-C-妈', input: '妈妈我爱你', exp: 0 },
  { id: 'TC-C-逼', input: '逼', exp: 2 },
  { id: 'TC-C-滚', input: '滚', exp: 1 },
  { id: 'TC-C-去死', input: '去死', exp: 1 },
  { id: 'TC-C-妈逼', input: '妈逼', exp: 2 },
  { id: 'TC-C-杂种', input: '杂种', exp: 2 },

  // ---- 数字 ----
  { id: 'TC-30', input: '91', exp: 1 },
  { id: 'TC-31', input: '78', exp: 1 },
  { id: 'TC-32', input: '网页91', exp: 1 },
  { id: 'TC-33', input: '网页78', exp: 1 },
  { id: 'TC-34', input: '91号', exp: 1 },
  { id: 'TC-35', input: '78号', exp: 1 },
  { id: 'TC-36', input: '20912025', exp: 0 },
  { id: 'TC-37', input: '1239178', exp: 0 },
  { id: 'TC-38', input: '918888', exp: 0 },
  { id: 'TC-39', input: '789999', exp: 0 },
  { id: 'TC-40', input: '我家在9号楼17单元8室', exp: 0 },

  // ---- 英文 ----
  { id: 'TC-50', input: 'fuck', exp: 2 },
  { id: 'TC-51', input: 'FUCK', exp: 2 },
  { id: 'TC-52', input: 'FuCk', exp: 2 },
  { id: 'TC-53', input: 'f u c k', exp: 2 },
  { id: 'TC-54', input: 'f-u-c-k', exp: 2 },
  { id: 'TC-55', input: 'f' + NL + 'u' + NL + 'c' + NL + 'k', exp: 2 },
  { id: 'TC-56', input: 'f.u.c.k', exp: 2 },
  { id: 'TC-57', input: 'f/u/c/k', exp: 2 },
  { id: 'TC-58', input: 'fUcK', exp: 2 },
  { id: 'TC-59', input: 'shut up', exp: 1 },
  { id: 'TC-60', input: 'motherfucker', exp: 2 },
  { id: 'TC-61', input: 'fuck you', exp: 3 },
  { id: 'TC-62', input: 'analysis', exp: 0 },
  { id: 'TC-79', input: 'ｆｕｃｋ', exp: 2 }, // 全角英文
  { id: 'TC-E-hello', input: 'hello', exp: 0 },
  { id: 'TC-E-dumb', input: 'dumb', exp: 1 },
  { id: 'TC-E-shit', input: 'shit', exp: 2 },
  { id: 'TC-E-bitch', input: 'bitch', exp: 2 },
  { id: 'TC-E-asshole', input: 'asshole', exp: 2 },
  { id: 'TC-E-dick', input: 'dick', exp: 2 },
  { id: 'TC-E-sonofabitch', input: 'son of a bitch', exp: 2 },
  { id: 'TC-E-off', input: 'fuck off', exp: 3 },

  // ---- 绕过 / 归一化 ----
  { id: 'TC-71', input: '死' + ' ' + ' ' + ' ' + '妈', exp: 2 },
  { id: 'TC-72', input: '死' + TAB + '妈', exp: 2 },
  { id: 'TC-73', input: '死\r妈', exp: 2 },
  { id: 'TC-75', input: '死，妈', exp: 2 },
  { id: 'TC-77', input: '全家' + ZWSP + '死' + ZWNJ + '光', exp: 3 },
  { id: 'TC-78', input: '全家' + ZWJ + '死' + BOM + '光', exp: 3 },
  { id: 'TC-78b', input: '死' + SOFT + '妈', exp: 2 },
  { id: 'TC-80', input: '死　妈', exp: 2 }, // 全角空格
  { id: 'TC-81', input: 'dead', exp: 0 },

  // ---- 等级最高 ----
  { id: 'TC-94', input: 'fuck you 操你妈', exp: 3 },
  { id: 'TC-95', input: '去你妈的傻逼', exp: 3 },
  { id: 'TC-96', input: '死你妈并且全家死光', exp: 3 },
  { id: 'TC-97', input: '你真是个废物', exp: 1 },
  { id: 'TC-98', input: '这个东西真的 fuck', exp: 2 }

];

// 业务覆盖(content_type 代表) —— 用与非业务相同的输入，仅验证对各类链路的通用性
const businessSamples = [
  { id: 'TC-110', kind: 'post_title', input: '死妈', exp: 2 },
  { id: 'TC-111', kind: 'post_content', input: '操你妈', exp: 2 },
  { id: 'TC-112', kind: 'comment', input: 'fuck', exp: 2 },
  { id: 'TC-113', kind: 'reply', input: '全家死光', exp: 3 },
  { id: 'TC-114', kind: 'profile_nickname', input: '傻逼', exp: 1 },
  { id: 'TC-115', kind: 'profile_bio', input: '去死', exp: 1 },
  { id: 'TC-116', kind: 'profile_signature', input: '操', exp: 1 },
  { id: 'TC-117', kind: 'report_content', input: '垃圾', exp: 1 },
  { id: 'TC-118', kind: 'announcement_title', input: '死你妈', exp: 2 },
  { id: 'TC-119', kind: 'announcement_content', input: 'fuck', exp: 2 }
];

function runCase(tc) {
  const hit = sensitiveWordService.check(tc.input);
  const actualBlock = hit.level > 0;
  const expBlock = tc.exp > 0;
  const ok = actualBlock === expBlock && (expBlock ? hit.level === tc.exp : true);
  return { ok, hit, tc, actualBlock, expBlock };
}

let pass = 0, fail = 0;
const fails = [];

function report(r) {
  if (r.ok) { pass++; console.log(`${r.tc.id}\tPASS\texpect=${r.expBlock ? '拦截' : '放行'}(${r.tc.exp}) actual=${r.actualBlock ? '拦截' : '放行'}(${r.hit.level}) rule=${r.hit.ruleType || '-'}`); }
  else { fail++; fails.push(r); console.log(`${r.tc.id}\tFAIL\texpect=${r.expBlock ? '拦截' : '放行'}(${r.tc.exp}) actual=${r.actualBlock ? '拦截' : '放行'}(${r.hit.level}) rule=${r.hit.ruleType || '-'}`); }
}

for (const tc of cases) report(runCase(tc));
for (const tc of businessSamples) report(runCase(tc));

// 放行样例集（不应误伤）
const allowList = ['今天天气很好', '我们班的同学都很友善', '放学一起回家吧', '谢谢老师指导'];
for (let i = 0; i < allowList.length; i++) {
  const input = allowList[i];
  const hit = sensitiveWordService.check(input);
  const ok = hit.level === 0;
  if (ok) pass++; else { fail++; fails.push({ tc: { id: `ALLOW-${i + 1}` }, hit, ok: false }); }
  console.log(`${ok ? 'PASS' : 'FAIL'}\tALLOW-${i + 1}\texpect=放行(0) actual=${hit.level}`);
}

console.log('\n==========================================');
console.log(`通过 ${pass} / 失败 ${fail}（共 ${pass + fail} 条）`);
if (fail > 0) {
  console.log('\n失败清单：');
  fails.forEach(f => console.log(`  ${f.tc.id}\texpect=${f.tc.exp} actual=${f.hit.level} rule=${f.hit.ruleType} word=[REDACTED]`));
  process.exitCode = 1;
} else {
  console.log('ALL TC PASS');
}