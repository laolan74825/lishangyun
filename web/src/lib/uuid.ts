/**
 * UUID v4 生成：优先使用原生 crypto.randomUUID，
 * 老内核浏览器（如旧联想浏览器、旧华为 WebView）不支持时降级为
 * crypto.getRandomValues 实现（Chrome 11+ 均支持）
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
  )
}
