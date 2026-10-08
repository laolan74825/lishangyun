import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { MonthlyTrendItem } from '../../types'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

interface Props {
  data: MonthlyTrendItem[]
}

export default function MonthlyTrendChart({ data }: Props) {
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
    chart.setOption({
      color: ['#40916C', '#E07B3A'],
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const ps = params as Array<{ marker: string; seriesName: string; value: number }> & {
            axisValue?: string
          }
          const header = ps.axisValue ? `${ps.axisValue}<br/>` : ''
          return (
            header +
            ps.map((p) => `${p.marker} ${p.seriesName}：¥${(p.value / 100).toFixed(2)}`).join('<br/>')
          )
        },
      },
      legend: { data: ['收到', '送出'], bottom: 0 },
      grid: { left: 60, right: 20, top: 16, bottom: 40 },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.month),
        axisLabel: { fontSize: 11, color: '#666' },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 11,
          color: '#666',
          formatter: (v: number) => `¥${(v / 100).toFixed(0)}`,
        },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
      },
      series: [
        {
          name: '收到',
          type: 'line',
          smooth: true,
          data: data.map((d) => d.received),
          areaStyle: { opacity: 0.08 },
          lineStyle: { width: 2.5 },
          symbolSize: 6,
        },
        {
          name: '送出',
          type: 'line',
          smooth: true,
          data: data.map((d) => d.sent),
          areaStyle: { opacity: 0.08 },
          lineStyle: { width: 2.5 },
          symbolSize: 6,
        },
      ],
    })
  }, [data])

  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-secondary">暂无数据</p>
  }

  return <div ref={chartRef} className="h-72 w-full" />
}
