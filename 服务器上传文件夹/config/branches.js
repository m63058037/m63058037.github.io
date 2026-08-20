/**
 * 校区统一配置
 * 所有校区数据集中管理，前端通过此文件获取校区列表
 * 新增校区只需在此处添加，无需修改其他文件
 */

export const ALL_BRANCH = 'all';
export const ALL_BRANCH_NAME = '全部校区';

export const BRANCHES = [
  { id: 'zhixinlu', name: '执信路校区' },
  { id: 'shuiyinlu', name: '水荫路校区' },
  { id: 'tianhe', name: '天河校区' },
  { id: 'ershadao', name: '二沙岛校区' },
  { id: 'zengcheng', name: '执信中学增城实验学校' },
  { id: 'pazhou', name: '执信中学琶洲实验学校' },
  { id: 'nansha', name: '执信中学南沙学校' },
  { id: 'dongfeng', name: '东风实验学校' },
  { id: 'liuxi', name: '从化区流溪中学' },
  { id: 'xingzhi', name: '星执学校' },
  { id: 'nanhai', name: '南海执信中学' }
];

/**
 * 获取所有校区选项（含"全部校区"），用于导航和选择
 * @returns {Array<{value: string, label: string, isAll: boolean}>}
 */
export function getBranchOptionsWithAll() {
  return [
    { value: ALL_BRANCH, label: ALL_BRANCH_NAME, isAll: true },
    ...BRANCHES.map(b => ({ value: b.name, label: b.name, isAll: false }))
  ];
}

/**
 * 获取所有分校选项（不含"全部校区"），用于下拉选择
 * @returns {Array<{value: string, label: string}>}
 */
export function getBranchOptions() {
  return BRANCHES.map(b => ({
    value: b.name,
    label: b.name
  }));
}

/**
 * 根据校区名称获取校区信息
 * @param {string} name - 校区名称
 * @returns {object|null}
 */
export function getBranchByName(name) {
  if (name === ALL_BRANCH) {
    return { id: ALL_BRANCH, name: ALL_BRANCH_NAME };
  }
  return BRANCHES.find(b => b.name === name) || null;
}

/**
 * 检查校区名称是否有效（含 all）
 * @param {string} name - 校区名称
 * @returns {boolean}
 */
export function isValidBranch(name) {
  if (name === ALL_BRANCH) return true;
  return BRANCHES.some(b => b.name === name);
}

/**
 * 检查校区名称是否为真实校区（不含 all）
 * @param {string} name - 校区名称
 * @returns {boolean}
 */
export function isRealBranch(name) {
  return BRANCHES.some(b => b.name === name);
}

export default { BRANCHES, ALL_BRANCH, ALL_BRANCH_NAME, getBranchOptionsWithAll, getBranchOptions, getBranchByName, isValidBranch, isRealBranch };
