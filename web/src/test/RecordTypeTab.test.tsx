import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../test/utils'
import userEvent from '@testing-library/user-event'
import RecordTypeTab from '../components/records/RecordTypeTab'

describe('RecordTypeTab', () => {
  it('renders all three tabs', () => {
    render(<RecordTypeTab value="all" onChange={() => {}} />)
    expect(screen.getByText('全部')).toBeInTheDocument()
    expect(screen.getByText('送出去')).toBeInTheDocument()
    expect(screen.getByText('收进来')).toBeInTheDocument()
  })

  it('highlights the active tab', () => {
    render(<RecordTypeTab value="out" onChange={() => {}} />)
    const outBtn = screen.getByText('送出去')
    expect(outBtn.className).toContain('bg-primary')
    expect(outBtn.className).toContain('text-white')
  })

  it('calls onChange with correct value when tab clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RecordTypeTab value="all" onChange={onChange} />)

    await user.click(screen.getByText('送出去'))
    expect(onChange).toHaveBeenCalledWith('out')

    await user.click(screen.getByText('收进来'))
    expect(onChange).toHaveBeenCalledWith('in')

    await user.click(screen.getByText('全部'))
    expect(onChange).toHaveBeenCalledWith('all')
  })
})
