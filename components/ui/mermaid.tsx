'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

export function MermaidChart({
  code,
  className
}: {
  code: string
  className?: string
}) {
  const [svg, setSvg] = React.useState('')
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    let cancelled = false

    const render = async () => {
      if (!code.trim()) {
        setSvg('')
        return
      }
      setError('')
      try {
        const mermaidModule = await import('mermaid')
        const mermaid = mermaidModule.default ?? mermaidModule
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          securityLevel: 'strict'
        })
        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`
        const result = await mermaid.render(id, code)
        const svgText = typeof result === 'string' ? result : result.svg
        if (!cancelled) {
          setSvg(svgText)
        }
      } catch (err) {
        if (!cancelled) {
          setError('Mermaid diagram failed to render.')
        }
      }
    }

    render()

    return () => {
      cancelled = true
    }
  }, [code])

  return (
    <div
      className={cn(
        'rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground',
        className
      )}
    >
      {error ? (
        <div className="text-xs text-red-600">{error}</div>
      ) : svg ? (
        <div
          className="mermaid-diagram"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="text-xs">Rendering diagram...</div>
      )}
    </div>
  )
}
