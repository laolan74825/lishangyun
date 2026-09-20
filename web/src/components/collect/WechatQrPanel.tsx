import type { PaymentAccount } from '../../types'

/** 微信收款码展示 */
export default function WechatQrPanel({ account }: { account?: PaymentAccount }) {
  if (!account || account.type !== 'wechat' || !account.qr_code) return null
  return (
    <div className="flex flex-col items-center gap-2 rounded-card bg-success-bg p-4">
      <p className="text-sm font-medium text-success-deep">请宾客扫码支付</p>
      <img
        src={account.qr_code}
        alt={`${account.name} 收款码`}
        className="h-40 w-40 rounded-lg object-contain"
      />
      <p className="text-xs text-ink-secondary">{account.name}</p>
    </div>
  )
}
