/** 事由英文编码 → 中文展示名；历史自由文本事由原样展示 */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: '婚礼',
  engagement: '订婚',
  birthday: '周岁宴',
  fullmoon: '满月酒',
  birthday_banquet: '生日/寿宴',
  housewarming: '乔迁',
  graduation: '升学宴',
  funeral: '丧葬',
  holiday: '节日红包',
  other: '其他',
}

/** 事由展示名：已知编码映射为中文，未知值（自由文本）原样返回 */
export function eventTypeLabel(eventType: string | null | undefined): string {
  if (!eventType) return '其他'
  return EVENT_TYPE_LABELS[eventType] ?? eventType
}
