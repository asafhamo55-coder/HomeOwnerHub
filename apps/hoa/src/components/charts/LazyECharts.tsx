'use client'

import dynamic from 'next/dynamic'

/**
 * ECharts (via echarts-for-react) is ~1.1 MB parsed. Loading it with
 * next/dynamic keeps it out of every route's First Load JS; the chart sits
 * inside a fixed-height wrapper at every call site, so nothing shifts while
 * the chunk loads. Same props as `ReactECharts`.
 */
export const LazyECharts = dynamic(() => import('echarts-for-react'), { ssr: false })
