import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../test/utils'
import userEvent from '@testing-library/user-event'
import ConfirmDialog from '../components/ConfirmDialog'

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    title: '确认删除',
    message: '此操作不可撤销',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }

  it('renders title and message', () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(screen.getByText('确认删除')).toBeInTheDocument()
    expect(screen.getByText('此操作不可撤销')).toBeInTheDocument()
  })

  it('renders default confirm and cancel labels', () => {
    render(<ConfirmDialog {...defaultProps} />)
    expect(screen.getByText('确认')).toBeInTheDocument()
    expect(screen.getByText('取消')).toBeInTheDocument()
  })

  it('renders custom labels', () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="删除" cancelLabel="返回" />)
    expect(screen.getByText('删除')).toBeInTheDocument()
    expect(screen.getByText('返回')).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />)
    await user.click(screen.getByText('确认'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when cancel button clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />)
    await user.click(screen.getByText('取消'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('shows loading state on confirm button', () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />)
    expect(screen.getByText('处理中…')).toBeInTheDocument()
  })

  it('disables buttons when loading', () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />)
    expect(screen.getByText('取消')).toBeDisabled()
    expect(screen.getByText('处理中…')).toBeDisabled()
  })

  it('renders danger icon for danger variant', () => {
    render(<ConfirmDialog {...defaultProps} variant="danger" />)
    expect(screen.getByText('🗑️')).toBeInTheDocument()
  })

  it('renders warning icon for warning variant', () => {
    render(<ConfirmDialog {...defaultProps} variant="warning" />)
    expect(screen.getByText('⚠️')).toBeInTheDocument()
  })

  it('renders info icon for info variant', () => {
    render(<ConfirmDialog {...defaultProps} variant="info" />)
    expect(screen.getByText('ℹ️')).toBeInTheDocument()
  })
})
