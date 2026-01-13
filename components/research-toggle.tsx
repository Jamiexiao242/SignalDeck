'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'

import { Switch } from '@/components/ui/switch'
import { useLocalStorage } from '@/lib/hooks/use-local-storage'
import { cn } from '@/lib/utils'

export function ResearchToggle({ className }: { className?: string }) {
  const [researchMode, setResearchMode] = useLocalStorage('researchMode', true)
  const { setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    setTheme(researchMode ? 'dark' : 'light')
  }, [researchMode, setTheme])

  const uiLabel = mounted ? (researchMode ? 'Dark UI' : 'Light UI') : 'UI'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex flex-col">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Research mode
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {uiLabel}
        </span>
      </div>
      <Switch
        checked={mounted ? researchMode : false}
        onCheckedChange={setResearchMode}
        aria-label="Toggle research mode"
      />
    </div>
  )
}
