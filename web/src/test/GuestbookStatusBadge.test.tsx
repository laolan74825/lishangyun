import { describe, it, expect } from 'vitest'
import { render, screen } from '../test/utils'
import GuestbookStatusBadge from '../components/guestbook/GuestbookStatusBadge'

describe('GuestbookStatusBadge', () => {
  it('renders active with animated dot', () => {
    render(<GuestbookStatusBadge status="active" />)
    expect(screen.getByText('收礼中')).toBeInTheDocument()
  })

  it('renders closing without dot', () => {
    render(<GuestbookStatusBadge status="closing" />)
    expect(screen.getByText('收尾中')).toBeInTheDocument()
  })

  it('renders archived', () => {
    render(<GuestbookStatusBadge status="archived" />)
    expect(screen.getByText('已归档')).toBeInTheDocument()
  })

  it('applies sm size class', () => {
    const { container } = render(<GuestbookStatusBadge status="active" size="sm" />)
    const badge = container.querySelector('span')
    expect(badge?.className).toContain('px-2')
  })

  it('applies md size class by default', () => {
    const { container } = render(<GuestbookStatusBadge status="active" />)
    const badge = container.querySelector('span')
    expect(badge?.className).toContain('px-3')
  })
})
