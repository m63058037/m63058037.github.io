/**
 * 内容包含不适宜词汇 —— 全屏警告弹窗
 * 需求依据：《敏感词.txt》系统总体规则第 4 条。
 * 要求：全屏遮罩、红色警告视觉、高层级 z-index、禁止背景操作、移动端/桌面端适配、
 *       只提供「知道了」按钮关闭、关闭后不保留也不清空任何用户输入（调用方负责保留输入框值）。
 * 用法：import { showContentWarnDialog } from '../components/content-warn-dialog.js';
 *       if (命中) { showContentWarnDialog(); return; }
 */
let mountedWarn = false;

export function showContentWarnDialog() {
  if (mountedWarn) return;
  mountedWarn = true;

  injectWarnStyles();

  const overlay = document.createElement('div');
  overlay.className = 'content-warn-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'content-warn-dialog';
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'content-warn-title');

  const icon = document.createElement('div');
  icon.className = 'content-warn-icon';
  icon.textContent = '!';

  const title = document.createElement('div');
  title.id = 'content-warn-title';
  title.className = 'content-warn-title';
  title.textContent = '内容包含不适宜词汇';

  const body = document.createElement('div');
  body.className = 'content-warn-body';
  body.textContent = '请立即修改内容后重新提交。';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'content-warn-btn';
  btn.textContent = '知道了';
  btn.addEventListener('click', () => closeContentWarnDialog());

  dialog.appendChild(icon);
  dialog.appendChild(title);
  dialog.appendChild(body);
  dialog.appendChild(btn);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // 锁定背景滚动，禁止背景操作
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  // 聚焦按钮，支持键盘回车/空格确认
  btn.focus();

  function closeContentWarnDialog() {
    if (!mountedWarn) return;
    mountedWarn = false;
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    if (document.body.style.overflow === 'hidden') {
      document.body.style.overflow = prevOverflow;
    }
  }

  // 用途：可在需要时由外部程序化关闭（当前仅「知道了」按钮关闭）
  overlay._contentWarnClose = closeContentWarnDialog;
}

const WARN_STYLE_ID = 'content-warn-dialog-style';

function injectWarnStyles() {
  if (document.getElementById(WARN_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = WARN_STYLE_ID;
  style.textContent = `
.content-warn-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.6);
  box-sizing: border-box;
}
.content-warn-dialog {
  width: 100%;
  max-width: 380px;
  background: #fffdf9;
  border-radius: 14px;
  padding: 28px 24px 24px;
  text-align: center;
  box-shadow: 0 12px 40px rgba(120, 20, 20, 0.35);
  border: 1px solid rgba(192, 57, 43, 0.25);
  box-sizing: border-box;
  animation: content-warn-pop 0.18s ease-out;
}
@keyframes content-warn-pop {
  from { transform: scale(0.92); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.content-warn-icon {
  width: 52px;
  height: 52px;
  margin: 0 auto 14px;
  border-radius: 50%;
  background: #c0392b;
  color: #fff;
  font-size: 30px;
  font-weight: 700;
  line-height: 52px;
  text-align: center;
}
.content-warn-title {
  font-size: 18px;
  font-weight: 700;
  color: #a52a1f;
  margin-bottom: 10px;
}
.content-warn-body {
  font-size: 15px;
  line-height: 1.6;
  color: #5a4a40;
  margin-bottom: 22px;
}
.content-warn-btn {
  width: 100%;
  padding: 12px 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  background: #c0392b;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.content-warn-btn:hover { background: #a93226; }
.content-warn-btn:focus-visible {
  outline: 2px solid #a52a1f;
  outline-offset: 2px;
}
@media (max-width: 480px) {
  .content-warn-dialog { max-width: 100%; }
}
`;
  document.head.appendChild(style);
}