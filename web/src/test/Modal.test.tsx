import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../test/utils'
import userEvent from '@testing-library/user-event'
import Modal from '../components/Modal'

describe('Modal', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="Test">Content</Modal>
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders title and children when open', () => {
    render(
      <Modal open={true} onClose={() => {}} title="测试标题">
        <p>测试内容</p>
      </Modal>
    )
    expect(screen.getByText('测试标题')).toBeInTheDocument()
    expect(screen.getByText('测试内容')).toBeInTheDocument()
  })

  it('renders close button and calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal open={true} onClose={onClose} title="Test">
        Content
      </Modal>
    )
    await user.click(screen.getByText('✕'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when clicking backdrop', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(
      <Modal open={true} onClose={onClose} title="Test">
        Content
      </Modal>
    )
    const backdrop = container.firstChild as HTMLElement
    await user.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders actions when provided', () => {
    render(
      <Modal
        open={true}
        onClose={() => {}}
        title="Test"
        actions={<button>确认</button>}
      >
        Content
      </Modal>
    )
    expect(screen.getByText('确认')).toBeInTheDocument()
  })

  it('applies correct max-width class', () => {
    const { container } = render(
      <Modal open={true} onClose={() => {}} title="Test" maxWidth="lg">
        Content
      </Modal>
    )
    const dialog = container.querySelector('.max-w-\\[32rem\\]')
    expect(dialog).toBeInTheDocument()
  })
})
