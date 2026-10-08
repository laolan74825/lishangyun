import packageJson from '../../package.json'

/**
 * 应用版本号。唯一出处是 package.json 的 version 字段，
 * 发版时只改那一处（页脚、CHANGELOG 均以它为准）。
 * 版本策略（1.0 前）：功能批次/发布日递增 minor（0.2.0 → 0.3.0），
 * 线上热修复递增 patch（0.2.0 → 0.2.1）。
 */
export const APP_VERSION = packageJson.version
