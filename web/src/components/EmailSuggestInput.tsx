import { useState, useRef, useMemo, useCallback } from 'react'

/** 常见邮箱域名，用于输入联想 */
const EMAIL_DOMAINS = [
  'qq.com', 'foxmail.com', '163.com', '126.com', 'gmail.com',
  'outlook.com', 'hotmail.com', 'icloud.com', 'sina.com', 'sohu.com',
  '139.com', 'aliyun.com',
]

const EMAIL_HISTORY_KEY = 'gr_email_history'
const MAX_HISTORY = 3

export function loadEmailHistory(): string[] {
  try {
    const raw = localStorage.getItem(EMAIL_HISTORY_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((e) => typeof e === 'string') : []
  } catch {
    return []
  }
}

export function rememberEmail(email: string) {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return
  const list = [normalized, ...loadEmailHistory().filter((e) => e !== normalized)].slice(0, MAX_HISTORY)
  localStorage.setItem(EMAIL_HISTORY_KEY, JSON.stringify(list))
}

/** 根据已输入内容生成邮箱联想候选 */
function buildSuggestions(input: string): string[] {
  const value = input.trim().toLowerCase()
  if (!value || value.includes(' ')) return []
  const history = loadEmailHistory()

  // 已输入 "@"：按域名前缀过滤
  if (value.includes('@')) {
    const [local, domain = ''] = value.split('@')
    if (!local) return []
    const pool = [...new Set([...history.map((e) => e.split('@')[1] ?? ''), ...EMAIL_DOMAINS])]
    return pool
      .filter((d) => d.startsWith(domain))
      .slice(0, 6)
      .map((d) => `${local}@${d}`)
  }

  // 未输入 "@"：历史邮箱前缀匹配优先 + 常用域名拼接
  const fromHistory = history.filter((e) => e.startsWith(value))
  const fromDomains = EMAIL_DOMAINS.slice(0, 6).map((d) => `${value}@${d}`)
  return [...new Set([...fromHistory, ...fromDomains])].slice(0, 6)
}

interface EmailSuggestInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  required?: boolean
  autoComplete?: string
  className?: string
}

/** 带邮箱域名联想下拉的标准输入框（找回密码、注册等页面共用） */
export default function EmailSuggestInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  required,
  autoComplete,
  className = 'w-full rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-primary',
}: EmailSuggestInputProps) {
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suggestions = useMemo(() => buildSuggestions(value), [value])

  const pick = useCallback((item: string) => {
    onChange(item)
    setOpen(false)
    setHighlightIndex(-1)
  }, [onChange])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault()
      pick(suggestions[highlightIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <input
        type="email"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setHighlightIndex(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // 延迟关闭，保证点击候选项先于失焦生效
          blurTimerRef.current = setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required={required}
        autoComplete={autoComplete}
        className={className}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-line bg-card shadow-modal">
          {suggestions.map((item, idx) => (
            <li key={item}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
                  pick(item)
                }}
                onMouseEnter={() => setHighlightIndex(idx)}
                className={`w-full px-3 py-2 text-left text-sm ${
                  idx === highlightIndex
                    ? 'bg-primary/10 text-primary'
                    : 'text-ink hover:bg-bg'
                }`}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
