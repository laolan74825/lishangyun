import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../test/utils'
import userEvent from '@testing-library/user-event'
import ExportButton from '../components/ExportButton'

describe('ExportButton', () => {
  const columns = [
    { key: 'name', label: '姓名' },
    { key: 'amount', label: '金额', format: (v: unknown) => `¥${v}` },
  ]
  const data = [
    { name: '张三', amount: 500 },
    { name: '李四', amount: 1000 },
  ]

  it('renders with default CSV label', () => {
    render(<ExportButton data={data} filename="test" columns={columns} />)
    expect(screen.getByText('导出 CSV')).toBeInTheDocument()
  })

  it('renders with JSON label when format is json', () => {
    render(<ExportButton data={data} filename="test" columns={columns} format="json" />)
    expect(screen.getByText('导出 JSON')).toBeInTheDocument()
  })

  it('is disabled when data is empty', () => {
    render(<ExportButton data={[]} filename="test" columns={columns} />)
    expect(screen.getByText('导出 CSV')).toBeDisabled()
  })

  it('triggers download on click', async () => {
    const user = userEvent.setup()
    const clickSpy = vi.fn()
    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag)
      if (tag === 'a') {
        el.click = clickSpy
      }
      return el
    })

    render(<ExportButton data={data} filename="test" columns={columns} />)
    await user.click(screen.getByText('导出 CSV'))
    expect(clickSpy).toHaveBeenCalled()
  })
})
