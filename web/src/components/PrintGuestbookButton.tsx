import { useState } from 'react'
import type { Guestbook } from '../types'
import { fetchAllGbRecords, printGuestbook } from '../lib/printGuestbook'

/**
 * 礼簿打印按钮：拉取全部收礼记录后打开礼单打印页。
 * 用于礼簿管理卡片与礼簿详情页。
 */
export default function PrintGuestbookButton({
  guestbook,
  className,
}: {
  guestbook: Pick<Guestbook, 'id' | 'name' | 'event_type' | 'event_date'>
  className?: string
}) {
  const [loading, setLoading] = useState(false)

  const handlePrint = async () => {
    if (!guestbook.id || loading) return
    setLoading(true)
    try {
      const records = await fetchAllGbRecords(guestbook.id)
      printGuestbook(guestbook as Guestbook, records)
    } catch {
      alert('打印数据加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={loading}
      title="打印礼单（全部收礼记录）"
      className={className ?? 'rounded-btn border border-line px-4 py-2 text-sm font-medium text-ink-secondary hover:border-primary disabled:opacity-50'}
    >
      {loading ? '准备中…' : '🖨️ 打印礼单'}
    </button>
  )
}
