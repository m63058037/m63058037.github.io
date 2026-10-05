/**
 * 论坛设备标识（FDI）：12 位随机 Cookie，仅作辅助风控，不是硬件 ID。
 */
const FDI_COOKIE = 'fdi';
const FDI_MAX_AGE = 400 * 24 * 60 * 60;
const FDI_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function readFdiCookie() {
  if (typeof document === 'undefined' || !document.cookie) {
    return '';
  }
  const parts = document.cookie.split(';');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (part.startsWith(FDI_COOKIE + '=')) {
      return decodeURIComponent(part.slice(FDI_COOKIE.length + 1));
    }
  }
  return '';
}

function writeFdiCookie(value) {
  if (typeof document === 'undefined') {
    return;
  }
  let cookie = FDI_COOKIE + '=' + encodeURIComponent(value)
    + '; Path=/; Max-Age=' + FDI_MAX_AGE + '; SameSite=Lax';
  if (typeof location !== 'undefined' && location.protocol === 'https:') {
    cookie += '; Secure';
  }
  document.cookie = cookie;
}

function generateFdi() {
  let out = '';
  while (out.length < 12) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b >= 248) {
        continue;
      }
      out += FDI_CHARS[b % 62];
      if (out.length === 12) {
        break;
      }
    }
  }
  return out;
}

export function isValidFdi(value) {
  return typeof value === 'string' && /^[A-Za-z0-9]{12}$/.test(value);
}

export function ensureFdi() {
  const existing = readFdiCookie();
  if (isValidFdi(existing)) {
    return existing;
  }
  const value = generateFdi();
  writeFdiCookie(value);
  return value;
}

export function getFdi() {
  return ensureFdi();
}
