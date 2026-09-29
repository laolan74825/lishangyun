import { useMemo } from 'react'

interface PasswordStrengthBarProps {
  password: string
  showLabel?: boolean
}

type StrengthLevel = 'empty' | 'weak' | 'fair' | 'good' | 'strong'

interface StrengthResult {
  level: StrengthLevel
  score: number
  label: string
  color: string
}

function evaluateStrength(password: string): StrengthResult {
  if (!password) {
    return { level: 'empty', score: 0, label: '', color: 'bg-gray-200' }
  }

  let score = 0

  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++

  if (score <= 1) {
    return { level: 'weak', score: 1, label: '弱', color: 'bg-danger' }
  }
  if (score <= 2) {
    return { level: 'fair', score: 2, label: '一般', color: 'bg-warning' }
  }
  if (score <= 3) {
    return { level: 'good', score: 3, label: '良好', color: 'bg-info' }
  }
  return { level: 'strong', score: 4, label: '强', color: 'bg-success' }
}

export default function PasswordStrengthBar({ password, showLabel = true }: PasswordStrengthBarProps) {
  const strength = useMemo(() => evaluateStrength(password), [password])

  if (strength.level === 'empty') return null

  const bars = [1, 2, 3, 4]

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {bars.map((bar) => (
          <div
            key={bar}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              bar <= strength.score ? strength.color : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      {showLabel && (
        <span className={`text-xs font-medium ${
          strength.level === 'weak' ? 'text-danger' :
          strength.level === 'fair' ? 'text-warning' :
          strength.level === 'good' ? 'text-info' :
          'text-success'
        }`}>
          {strength.label}
        </span>
      )}
    </div>
  )
}
