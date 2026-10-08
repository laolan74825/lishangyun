import dayjs from 'dayjs'
import type { GbRecord, Guestbook } from '../types'
import { getGbRecordsPaginated } from './api-client'
import { amountToChinese } from './format'
import { eventTypeLabel } from './eventType'

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fen = (v: number) => `¥${(v / 100).toFixed(2)}`

/** 中文按拼音排序（Intl.Collator 的中文排序即拼音序） */
const pinyinCollator = new Intl.Collator('zh-Hans-CN', { numeric: true })
const byPinyin = (a: GbRecord, b: GbRecord) => pinyinCollator.compare(a.guest_name, b.guest_name)

/** 每页行数（仿手工礼簿的大行高，A4 一页约 15 行） */
const ROWS_PER_PAGE = 15

/** 拉取礼簿全部收礼记录（分页循环，打印用） */
export async function fetchAllGbRecords(guestbookId: number): Promise<GbRecord[]> {
  const pageSize = 100
  const first = await getGbRecordsPaginated(guestbookId, 1, pageSize)
  const all = [...first.items]
  const totalPages = first.pagination.total_pages
  for (let page = 2; page <= totalPages; page++) {
    const res = await getGbRecordsPaginated(guestbookId, page, pageSize)
    all.push(...res.items)
  }
  return all
}

/**
 * 打开礼簿礼单打印页：仿手工记账礼簿格式——
 * 仅 序号/姓名/电话/礼金/备注 五列（不打印方式、账户、时间），
 * 按宾客姓名拼音排序；每页附「本页合计」与「从第一页至本页累计」；
 * 礼金附中文大写。
 */
export function printGuestbook(guestbook: Guestbook, records: GbRecord[]): void {
  const sorted = [...records].sort(byPinyin)
  const totalAmount = sorted.reduce((s, r) => s + r.amount, 0)

  /* 分页并计算每页小计与累计 */
  const pages: { rows: string; pageCount: number; pageSum: number; cumulative: number }[] = []
  let cumulative = 0
  for (let start = 0; start < Math.max(sorted.length, 1); start += ROWS_PER_PAGE) {
    const slice = sorted.slice(start, start + ROWS_PER_PAGE)
    const pageSum = slice.reduce((s, r) => s + r.amount, 0)
    cumulative += pageSum
    const rows = slice.map((r, i) => `
    <tr>
      <td class="idx">${start + i + 1}</td>
      <td class="name">${esc(r.guest_name)}${r.agent_name ? `<span class="agent">（${esc(r.agent_name)} 代）</span>` : ''}</td>
      <td class="phone">${esc(r.phone ?? '')}</td>
      <td class="amount"><span class="num">${fen(r.amount)}</span><span class="cn">（${amountToChinese(r.amount)}）</span></td>
      <td class="note">${esc(r.note ?? '')}</td>
    </tr>`).join('')
    pages.push({ rows, pageCount: slice.length, pageSum, cumulative })
  }

  const pageTables = pages.map((p, pi) => `
  <div class="page${pi < pages.length - 1 ? ' break' : ''}">
    ${pi === 0 ? `<h1>${esc(guestbook.name)}　礼单</h1>
    <p class="meta">事由：${esc(eventTypeLabel(guestbook.event_type))}　·　日期：${esc(guestbook.event_date)}　·　共 ${sorted.length} 笔</p>` : ''}
    <table>
      <thead>
        <tr><th>#</th><th>宾客姓名</th><th>电话</th><th style="text-align:center">礼金</th><th>备注</th></tr>
      </thead>
      <tbody>${p.rows || '<tr><td colspan="5" style="text-align:center;color:#888;height:60px">暂无记录</td></tr>'}</tbody>
      <tfoot>
        <tr><td colspan="3">本页合计（${p.pageCount} 笔）</td><td class="amount"><span class="num">${fen(p.pageSum)}</span><span class="cn">（${amountToChinese(p.pageSum)}）</span></td><td></td></tr>
        <tr><td colspan="3">累计（第 1 页至本页）</td><td class="amount"><span class="num">${fen(p.cumulative)}</span><span class="cn">（${amountToChinese(p.cumulative)}）</span></td><td></td></tr>
      </tfoot>
    </table>
    ${pi === pages.length - 1 ? `<div class="footer">
      <span>总计：${fen(totalAmount)}（${amountToChinese(totalAmount)}）</span>
      <span>打印时间：${dayjs().format('YYYY-MM-DD HH:mm')}</span>
      <span>记账员：__________　核对：__________</span>
    </div>` : ''}
  </div>`).join('')

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>礼单 - ${esc(guestbook.name)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "SimSun", "Songti SC", "Microsoft YaHei", serif; color: #000; padding: 20px 28px; font-size: 15px; }
  h1 { text-align: center; font-size: 26px; letter-spacing: 8px; margin-bottom: 6px; font-family: "KaiTi", "STKaiti", "SimSun", serif; }
  .meta { text-align: center; font-size: 14px; color: #222; margin-bottom: 18px; letter-spacing: 2px; }
  table { width: 100%; border-collapse: collapse; border: 3px double #000; }
  th, td { border: 1px solid #000; padding: 8px 10px; text-align: left; vertical-align: middle; }
  th { font-size: 16px; font-weight: bold; text-align: center; letter-spacing: 4px; }
  td.idx { width: 44px; text-align: center; font-size: 14px; }
  td.name { font-weight: bold; font-size: 17px; letter-spacing: 2px; }
  td.phone { width: 120px; font-size: 14px; }
  td.amount { white-space: nowrap; }
  td.amount .num { font-weight: bold; font-size: 16px; }
  td.amount .cn { font-size: 12px; margin-left: 4px; }
  td.note { font-size: 14px; }
  .agent { font-weight: normal; font-size: 13px; }
  tbody tr { height: 34px; }
  tfoot td { font-weight: bold; background: #f6f6f6; }
  .page.break { page-break-after: always; }
  .footer { margin-top: 20px; font-size: 14px; color: #222; display: flex; justify-content: space-between; }
  @page { size: A4; margin: 14mm; }
</style>
</head>
<body>
  ${pageTables}
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) {
    alert('浏览器拦截了打印窗口，请允许弹出窗口后重试')
    return
  }
  win.document.write(html)
  win.document.close()
}
