import { useState, useEffect, useCallback } from 'react'
import PageScaffold from '../components/PageScaffold'
import Toast, { useToast } from '../components/Toast'
import Modal from '../components/Modal'
import { getSecurityConfig, enableEnhancedMode, verifyMnemonic, disableEnhancedMode } from '../lib/api-client'
import { generateEncryptionKey, exportKeyToBase64, importKeyFromBase64, hashMnemonic } from '../lib/crypto'
import { generateMnemonic, validateMnemonic } from '../lib/mnemonic'
import { initEncryptionKey, clearCachedKey, wrapKeyForServer } from '../lib/encryption-engine'
import { clearStoredEncryptionKey } from '../lib/secure-storage'
import type { SecurityConfig } from '../types'

type WizardStep = 'idle' | 'explain' | 'generate' | 'copy' | 'verify' | 'password' | 'encrypting' | 'done'

export default function SecurityPage() {
  const { toast, showToast } = useToast()
  const [config, setConfig] = useState<SecurityConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [wizardStep, setWizardStep] = useState<WizardStep>('idle')
  const [mnemonic, setMnemonic] = useState('')
  const [mnemonicHash, setMnemonicHash] = useState('')
  const [dekBase64, setDekBase64] = useState('')
  const [verifyPositions, setVerifyPositions] = useState<number[]>([])
  const [verifyInputs, setVerifyInputs] = useState<Record<number, string>>({})
  const [verifyError, setVerifyError] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [disableMnemonic, setDisableMnemonic] = useState('')
  const [showDisableModal, setShowDisableModal] = useState(false)
  const [disableStep, setDisableStep] = useState<'verify' | 'confirm' | 'switching' | 'done'>('verify')
  const [disableError, setDisableError] = useState('')
  const [encryptProgress, setEncryptProgress] = useState(0)

  const loadConfig = useCallback(async () => {
    try {
      const data = await getSecurityConfig()
      setConfig(data)
    } catch {
      showToast('加载安全配置失败')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { loadConfig() }, [loadConfig])

  const startEnableWizard = () => setWizardStep('explain')

  const handleGenerateMnemonic = async () => {
    const words = await generateMnemonic(12)
    setMnemonic(words)
    const hash = await hashMnemonic(words)
    setMnemonicHash(hash)
    const key = await generateEncryptionKey()
    const raw = await exportKeyToBase64(key)
    setDekBase64(raw)
    const positions = generateVerifyPositions()
    setVerifyPositions(positions)
    setVerifyInputs({})
    setVerifyError('')
    setWizardStep('copy')
  }

  const generateVerifyPositions = (): number[] => {
    const positions: number[] = []
    while (positions.length < 3) {
      const pos = Math.floor(Math.random() * 12)
      if (!positions.includes(pos)) positions.push(pos)
    }
    return positions.sort((a, b) => a - b)
  }

  const handleStartVerify = () => {
    setWizardStep('verify')
  }

  const handleVerifyMnemonic = () => {
    const words = mnemonic.split(' ')
    let hasError = false
    for (const pos of verifyPositions) {
      if ((verifyInputs[pos] || '').trim().toLowerCase() !== words[pos]) {
        hasError = true
        break
      }
    }
    if (hasError) {
      setVerifyError('助记词验证失败，请检查输入')
      return
    }
    setVerifyError('')
    setWizardStep('password')
  }

  const handleSetPassword = async () => {
    if (newPassword.length < 8) {
      showToast('密码至少 8 个字符')
      return
    }
    if (newPassword !== confirmPassword) {
      showToast('两次密码输入不一致')
      return
    }
    setWizardStep('encrypting')
    setEncryptProgress(0)

    const progressInterval = setInterval(() => {
      setEncryptProgress(prev => Math.min(prev + Math.random() * 15, 90))
    }, 300)

    try {
      await initEncryptionKey(dekBase64)
      const wrappedDek = await wrapKeyForServer(await importKeyFromBase64(dekBase64), newPassword)
      await enableEnhancedMode({ encrypted_key: wrappedDek, mnemonic_hash: mnemonicHash })
      clearInterval(progressInterval)
      setEncryptProgress(100)
      setTimeout(() => {
        setWizardStep('done')
      }, 500)
    } catch {
      clearInterval(progressInterval)
      showToast('启用增强模式失败')
      setWizardStep('password')
    }
  }

  const handleWizardComplete = () => {
    setWizardStep('idle')
    setMnemonic('')
    setMnemonicHash('')
    setDekBase64('')
    setNewPassword('')
    setConfirmPassword('')
    loadConfig()
  }

  const handleStartDisable = () => {
    setShowDisableModal(true)
    setDisableStep('verify')
    setDisableMnemonic('')
    setDisableError('')
  }

  const handleDisableVerify = async () => {
    if (!validateMnemonic(disableMnemonic)) {
      setDisableError('助记词格式无效')
      return
    }
    const hash = await hashMnemonic(disableMnemonic)
    try {
      await verifyMnemonic({ mnemonic_hash: hash })
      setDisableError('')
      setDisableStep('confirm')
    } catch {
      setDisableError('助记词验证失败')
    }
  }

  const handleDisableConfirm = async () => {
    setDisableStep('switching')
    const hash = await hashMnemonic(disableMnemonic)
    try {
      await disableEnhancedMode({ mnemonic_hash: hash })
      clearCachedKey()
      await clearStoredEncryptionKey()
      setDisableStep('done')
    } catch {
      showToast('切换普通模式失败')
      setDisableStep('verify')
    }
  }

  const handleDisableComplete = () => {
    setShowDisableModal(false)
    setDisableStep('verify')
    setDisableMnemonic('')
    loadConfig()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-ink-secondary">
        加载中…
      </div>
    )
  }

  const isEnhanced = config?.security_mode === 'enhanced' && config?.is_active

  return (
    <PageScaffold title="安全模式" description="管理数据加密方式与安全等级">
      <div className="mx-auto flex max-w-[36rem] flex-col gap-5">
        <section className="rounded-card bg-card p-6 shadow-card">
          <h2 className="text-section-title">当前安全模式</h2>
          <div className="mt-4 flex items-center gap-3">
            <span className={`inline-block h-3 w-3 rounded-full ${isEnhanced ? 'bg-success' : 'bg-primary'}`} />
            <span className="text-lg font-medium text-ink">
              {isEnhanced ? '增强模式（零知识加密）' : '普通模式（服务端加密）'}
            </span>
          </div>
          <p className="mt-2 text-sm text-ink-secondary">
            {isEnhanced
              ? '数据在客户端加密后上传，服务器无法读取明文。'
              : '数据由服务器端加密存储，开箱即用。'}
          </p>
        </section>

        {!isEnhanced ? (
          <section className="rounded-card bg-card p-6 shadow-card">
            <h2 className="text-section-title">切换到增强模式</h2>
            <p className="mt-2 text-sm text-ink-secondary">
              启用后，所有数据将使用 AES-256-GCM 在本地加密后再上传。
              需要生成恢复助记词，请确保在安全环境下操作。
            </p>
            <button
              onClick={startEnableWizard}
              className="mt-4 h-11 rounded-btn bg-primary px-6 text-sm font-medium text-white transition-colors hover:bg-primary/90"
            >
              开启增强安全模式
            </button>
          </section>
        ) : (
          <section className="rounded-card bg-card p-6 shadow-card">
            <h2 className="text-section-title">切换回普通模式</h2>
            <p className="mt-2 text-sm text-ink-secondary">
              需要输入恢复助记词验证身份。切换后数据将以服务端加密存储。
            </p>
            <button
              onClick={handleStartDisable}
              className="mt-4 h-11 rounded-btn border border-danger px-6 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
            >
              切换到普通模式
            </button>
          </section>
        )}

        {isEnhanced && (
          <section className="rounded-card bg-card p-6 shadow-card">
            <h2 className="text-section-title">安全配置信息</h2>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-secondary">加密密钥</span>
                <span className="text-ink">{config?.has_encrypted_key ? '已配置' : '未配置'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">恢复助记词</span>
                <span className="text-ink">{config?.has_mnemonic_hash ? '已备份' : '未备份'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">家庭密钥</span>
                <span className="text-ink">{config?.has_encrypted_family_key ? '已上传' : '未配置'}</span>
              </div>
            </div>
          </section>
        )}
      </div>

      {wizardStep !== 'idle' && (
        <Modal open={true} onClose={() => setWizardStep('idle')} title="开启增强安全模式" maxWidth="md">
          <div className="flex flex-col gap-4">
            {wizardStep === 'explain' && <ExplainStep onContinue={() => setWizardStep('generate')} />}
            {wizardStep === 'generate' && <GenerateStep onGenerate={handleGenerateMnemonic} />}
            {wizardStep === 'copy' && (
              <CopyStep mnemonic={mnemonic} onCopied={handleStartVerify} />
            )}
            {wizardStep === 'verify' && (
              <VerifyStep
                positions={verifyPositions}
                inputs={verifyInputs}
                onInputChange={setVerifyInputs}
                onVerify={handleVerifyMnemonic}
                error={verifyError}
              />
            )}
            {wizardStep === 'password' && (
              <PasswordStep
                password={newPassword}
                confirmPassword={confirmPassword}
                onPasswordChange={setNewPassword}
                onConfirmChange={setConfirmPassword}
                onSubmit={handleSetPassword}
              />
            )}
            {wizardStep === 'encrypting' && <EncryptingStep progress={encryptProgress} />}
            {wizardStep === 'done' && <DoneStep onComplete={handleWizardComplete} />}
          </div>
        </Modal>
      )}

      {showDisableModal && (
        <Modal open={true} onClose={() => setShowDisableModal(false)} title="切换到普通模式" maxWidth="md">
          <div className="flex flex-col gap-4">
            {disableStep === 'verify' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink-secondary">
                  请输入您的恢复助记词以验证身份。
                </p>
                <textarea
                  value={disableMnemonic}
                  onChange={(e) => setDisableMnemonic(e.target.value)}
                  placeholder="输入 12 个助记词，用空格分隔"
                  className="h-24 rounded-btn border border-line bg-bg p-3 text-sm font-mono outline-none focus:border-primary"
                />
                {disableError && (
                  <p className="text-sm text-danger">{disableError}</p>
                )}
                <button
                  onClick={handleDisableVerify}
                  className="h-11 rounded-btn bg-primary px-6 text-sm font-medium text-white"
                >
                  验证助记词
                </button>
              </div>
            )}
            {disableStep === 'confirm' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink-secondary">
                  助记词验证成功。切换后数据将以服务端加密存储，客户端加密密钥将被清除。
                </p>
                <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">
                  请确认您已备份助记词，以便将来重新启用增强模式。
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDisableStep('verify')}
                    className="h-11 flex-1 rounded-btn border border-line text-sm text-ink-secondary"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleDisableConfirm}
                    className="h-11 flex-1 rounded-btn bg-danger px-6 text-sm font-medium text-white"
                  >
                    确认切换
                  </button>
                </div>
              </div>
            )}
            {disableStep === 'switching' && (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm text-ink-secondary">正在切换安全模式…</p>
              </div>
            )}
            {disableStep === 'done' && (
              <div className="flex flex-col items-center gap-3 py-4">
                <span className="text-4xl">✓</span>
                <p className="text-sm text-ink">已切换至普通模式</p>
                <button
                  onClick={handleDisableComplete}
                  className="h-11 rounded-btn bg-primary px-6 text-sm font-medium text-white"
                >
                  完成
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      <Toast message={toast} onClose={() => showToast(null)} />
    </PageScaffold>
  )
}

function ExplainStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 py-2">
        <span className="text-4xl">🔒</span>
        <h3 className="text-lg font-semibold text-ink">开启增强安全模式</h3>
      </div>
      <div className="flex flex-col gap-2 text-sm text-ink-secondary">
        <p>启用后，您的数据将使用 AES-256-GCM 算法在本地加密后再上传至服务器。</p>
        <ul className="flex flex-col gap-1.5 pl-4">
          <li className="list-disc">数据在云端全程加密，服务商无法读取明文</li>
          <li className="list-disc">跨设备同步需要输入密码或助记词</li>
          <li className="list-disc">忘记密码且丢失助记词 = 数据无法恢复</li>
          <li className="list-disc">家庭共享成员需各自持有密钥副本</li>
        </ul>
      </div>
      <button
        onClick={onContinue}
        className="h-11 rounded-btn bg-primary px-6 text-sm font-medium text-white"
      >
        我了解风险，继续
      </button>
    </div>
  )
}

function GenerateStep({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <p className="text-sm text-ink-secondary">
        系统将为您生成 12 个英文单词的恢复助记词。
      </p>
      <button
        onClick={onGenerate}
        className="h-11 rounded-btn bg-primary px-6 text-sm font-medium text-white"
      >
        生成助记词
      </button>
    </div>
  )
}

function CopyStep({ mnemonic, onCopied }: { mnemonic: string; onCopied: () => void }) {
  const words = mnemonic.split(' ')
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-secondary">
        请将以下 12 个单词按顺序抄写在纸上。请勿截图或拍照。
      </p>
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-bg p-4">
        {words.map((word, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-5 text-right text-xs text-ink-secondary">{i + 1}.</span>
            <span className="font-mono text-sm text-ink">{word}</span>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-warning/10 p-3">
        <p className="text-xs text-warning">
          此助记词用于恢复加密数据，丢失后无法找回。建议手抄在纸上妥善保管。
        </p>
      </div>
      <button
        onClick={onCopied}
        className="h-11 rounded-btn bg-primary px-6 text-sm font-medium text-white"
      >
        我已抄写，点击验证
      </button>
    </div>
  )
}

function VerifyStep({
  positions,
  inputs,
  onInputChange,
  onVerify,
  error,
}: {
  positions: number[]
  inputs: Record<number, string>
  onInputChange: (v: Record<number, string>) => void
  onVerify: () => void
  error: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-secondary">
        请输入以下位置的助记词以验证您已正确抄写。
      </p>
      <div className="flex flex-col gap-3">
        {positions.map((pos) => (
          <label key={pos} className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink">第 {pos + 1} 个单词</span>
            <input
              value={inputs[pos] || ''}
              onChange={(e) => onInputChange({ ...inputs, [pos]: e.target.value })}
              className="h-11 rounded-btn border border-line bg-bg px-4 text-sm font-mono outline-none focus:border-primary"
              placeholder={`请输入第 ${pos + 1} 个单词`}
            />
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        onClick={onVerify}
        className="h-11 rounded-btn bg-primary px-6 text-sm font-medium text-white"
      >
        验证
      </button>
    </div>
  )
}

function PasswordStep({
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmChange,
  onSubmit,
}: {
  password: string
  confirmPassword: string
  onPasswordChange: (v: string) => void
  onConfirmChange: (v: string) => void
  onSubmit: () => void
}) {
  const strength = getPasswordStrength(password)
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-secondary">
        设置加密密码，用于在新设备上解锁加密数据。
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-ink">加密密码</span>
        <input
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          className="h-11 rounded-btn border border-line bg-bg px-4 text-sm outline-none focus:border-primary"
          placeholder="至少 8 个字符"
        />
        {password && (
          <div className="mt-1 flex gap-1">
            {[1, 2, 3, 4].map((level) => (
              <div
                key={level}
                className={`h-1 flex-1 rounded-full ${
                  level <= strength.level
                    ? strength.level <= 1
                      ? 'bg-danger'
                      : strength.level <= 2
                        ? 'bg-warning'
                        : 'bg-success'
                    : 'bg-line'
                }`}
              />
            ))}
          </div>
        )}
        {password && (
          <span className="text-xs text-ink-secondary">{strength.label}</span>
        )}
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-ink">确认密码</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => onConfirmChange(e.target.value)}
          className="h-11 rounded-btn border border-line bg-bg px-4 text-sm outline-none focus:border-primary"
          placeholder="再次输入密码"
        />
        {confirmPassword && password !== confirmPassword && (
          <span className="text-xs text-danger">两次密码不一致</span>
        )}
      </label>
      <button
        onClick={onSubmit}
        disabled={password.length < 8 || password !== confirmPassword}
        className="h-11 rounded-btn bg-primary px-6 text-sm font-medium text-white disabled:opacity-50"
      >
        确认并加密
      </button>
    </div>
  )
}

function EncryptingStep({ progress }: { progress: number }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <div className="h-2 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-sm text-ink-secondary">
        正在加密数据并上传至服务器… {Math.round(progress)}%
      </p>
    </div>
  )
}

function DoneStep({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <span className="text-4xl">✓</span>
      <p className="text-sm text-ink">增强安全模式已启用</p>
      <p className="text-xs text-ink-secondary">
        所有数据已使用 AES-256-GCM 加密。导航栏将显示锁图标。
      </p>
      <button
        onClick={onComplete}
        className="h-11 rounded-btn bg-primary px-6 text-sm font-medium text-white"
      >
        完成
      </button>
    </div>
  )
}

function getPasswordStrength(password: string): { level: number; label: string } {
  if (password.length < 8) return { level: 1, label: '弱' }
  let score = 0
  if (password.length >= 8) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++
  if (score <= 1) return { level: 1, label: '弱' }
  if (score <= 2) return { level: 2, label: '中等' }
  if (score <= 3) return { level: 3, label: '强' }
  return { level: 4, label: '非常强' }
}
