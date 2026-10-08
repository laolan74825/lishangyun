/**
 * 金额（分）转换为中文大写
 * 例如：12345 → 壹佰贰拾叁元肆角伍分
 */
export function amountToChinese(amountFen: number): string {
  if (amountFen <= 0) return '零元整'

  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const units = ['', '拾', '佰', '仟']
  const bigUnits = ['', '万', '亿']

  const yuan = Math.floor(amountFen / 100)
  const jiao = Math.floor((amountFen % 100) / 10)
  const fen = amountFen % 10

  let result = ''

  if (yuan > 0) {
    const yuanStr = yuan.toString()
    const len = yuanStr.length
    let zeroFlag = false

    for (let i = 0; i < len; i++) {
      const digit = parseInt(yuanStr[i])
      const pos = len - 1 - i
      const unitIndex = pos % 4
      const bigUnitIndex = Math.floor(pos / 4)

      if (digit === 0) {
        zeroFlag = true
        if (unitIndex === 0 && bigUnits[bigUnitIndex]) {
          result += bigUnits[bigUnitIndex]
          zeroFlag = false
        }
      } else {
        if (zeroFlag) {
          result += '零'
          zeroFlag = false
        }
        result += digits[digit] + units[unitIndex]
        if (unitIndex === 0 && bigUnits[bigUnitIndex]) {
          result += bigUnits[bigUnitIndex]
        }
      }
    }

    result += '元'
  }

  if (jiao === 0 && fen === 0) {
    result += '整'
  } else {
    if (jiao > 0) {
      result += digits[jiao] + '角'
    } else if (yuan > 0) {
      result += '零'
    }

    if (fen > 0) {
      result += digits[fen] + '分'
    }
  }

  return result
}

/** 金额（分）→ 展示字符串，负数显示为 -¥x.xx，例如 12345 → ¥123.45 */
export function formatFen(fen: number): string {
  const sign = fen < 0 ? '-' : ''
  return `${sign}¥${Math.abs(fen / 100).toFixed(2)}`
}
