import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EventDistributionItem } from '../../types'
import { eventTypeLabel } from '../../lib/eventType'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

interface Props {
  data: EventDistributionItem[]
}

export default function EventDistributionChart({ data }: Props) {
  const chartRef = useRef<HTMLDivElement>(null)

  // 初始化/销毁实例与 resize 监听（只执行一次）
  useEffect(() => {
    if (!chartRef.current) return
    const chart = echarts.init(chartRef.current)
    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [])

  // 数据变化时增量更新（不重建实例）
  useEffect(() => {
    const chart = chartRef.current ? echarts.getInstanceByDom(chartRef.current) : null
    if (!chart || data.length === 0) return
    const sorted = [...data].sort((a, b) => a.total_amount - b.total_amount)
    const grandTotal = data.reduce((s, d) => s + d.total_amount, 0)
    chart.setOption({
      color: ['#E07B3A'],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const p = (params as Array<{ name: string; value: number }>)[0]
          const item = data.find((d) => eventTypeLabel(d.event_type) === p.name)
          const pct = grandTotal > 0 ? ((p.value / grandTotal) * 100).toFixed(1) : '0.0'
          return `${p.name}<br/>金额：¥${(p.value / 100).toFixed(2)}（占比 ${pct}%）<br/>笔数：${item?.record_count ?? 0}`
        },
      },
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 11,
          color: '#666',
          formatter: (v: number) => `¥${(v / 100).toFixed(0)}`,
        },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
      },
      yAxis: {
        type: 'category',
        data: sorted.map((d) => eventTypeLabel(d.event_type)),
        axisLabel: { fontSize: 12, color: '#333' },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: sorted.map((d) => d.total_amount),
          barMaxWidth: 28,
          itemStyle: { borderRadius: [0, 4, 4, 0] },
        },
      ],
    })
  }, [data])

  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-secondary">暂无数据</p>
  }

  return <div ref={chartRef} className="h-72 w-full" />
}
