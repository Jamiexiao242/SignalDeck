'use client'

import * as React from 'react'

import { BotCard } from '@/components/stocks/message'
import { spinner } from '@/components/stocks/spinner'

const RESEARCH_STEPS = [
  'Identifying relevant tickers...',
  'Searching news, fundamentals, earnings, valuation, and risks...',
  'Analyzing search results...',
  'Drafting the research report...'
]

const STEP_INTERVAL_MS = 2000

export function ResearchProgress() {
  const [stepIndex, setStepIndex] = React.useState(0)

  React.useEffect(() => {
    const intervalId = window.setInterval(() => {
      setStepIndex(index => (index + 1) % RESEARCH_STEPS.length)
    }, STEP_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [])

  return (
    <BotCard>
      <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        <span className="text-muted-foreground">{spinner}</span>
        <span>{RESEARCH_STEPS[stepIndex]}</span>
      </div>
    </BotCard>
  )
}
