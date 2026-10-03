import { useState, useEffect, useRef, useCallback } from 'react'
import { searchPersons } from '../lib/api-client'
import type { Person } from '../types'

/**
 * 宾客姓名联想输入框（需求 F-2.18）
 * 输入时从人员库中模糊匹配（姓名/称谓/别名），下拉展示建议
 */
export default function NameAutocomplete({
  value,
  onChange,
  onSelectPerson,
  showNote,
  placeholder,
  className
}: {
  value: string
  onChange: (v: string) => void
  /** 选中人员库中的某人时回调（携带完整人员信息，便于关联 person_id、回填电话） */
  onSelectPerson?: (person: Person) => void
  /** 下拉项尾部显示人员备注（而非电话），用于记一笔等场景 */
  showNote?: boolean
  placeholder?: string
  className?: string
}) {
  const [suggestions, setSuggestions] = useState<Person[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  // 选中人员后输入框值变化会再次触发防抖搜索，用此标记跳过一次，避免下拉重新弹出
  const skipSearchRef = useRef(false)

  /* 防抖搜索 */
  const doSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim() || keyword.trim().length < 1) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    const results = await searchPersons(keyword.trim())
    setSuggestions(results.slice(0, 8))
    setShowDropdown(results.length > 0)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (skipSearchRef.current) {
        skipSearchRef.current = false
        setSuggestions([])
        setShowDropdown(false)
        return
      }
      doSearch(value)
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, doSearch])

  /* 点击外部关闭下拉 */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (person: Person) => {
    skipSearchRef.current = true
    onChange(person.name)
    onSelectPerson?.(person)
    setSuggestions([])
    setShowDropdown(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setShowDropdown(true)
        }}
        placeholder={placeholder}
        className={className}
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-48 overflow-y-auto rounded-btn border border-line bg-card shadow-lg">
          {suggestions.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-bg"
            >
              <span className="font-medium text-ink">{p.name}</span>
              {p.nickname && (
                <span className="text-xs text-ink-secondary">({p.nickname})</span>
              )}
              {showNote
                ? p.note && (
                    <span className="ml-auto max-w-[40%] truncate text-xs text-ink-secondary">
                      {p.note}
                    </span>
                  )
                : p.phone && (
                    <span className="ml-auto text-xs text-ink-secondary">{p.phone}</span>
                  )}
              {p.aliases.length > 0 && (
                <span className="text-xs text-ink-secondary">
                  别名: {p.aliases.join('、')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
