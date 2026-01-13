'use client'

import { BotCard } from '@/components/stocks/message'
import { IconChevronUpDown } from '@/components/ui/icons'

type SearchResult = {
  title?: string
  url?: string
  content?: string
}

export function SearchResultsCard({
  query,
  results,
  status
}: {
  query: string
  results: SearchResult[]
  status?: string | null
}) {
  if (results.length === 0 && !status) {
    return null
  }

  return (
    <BotCard showAvatar={false}>
      <details className="rounded-md border bg-muted/50 p-3 text-sm">
        <summary className="flex cursor-pointer items-center gap-2 font-medium">
          <IconChevronUpDown className="h-4 w-4 text-muted-foreground" />
          Search results for &quot;{query}&quot;
        </summary>
        {status ? (
          <div className="mt-2 text-xs text-muted-foreground">{status}</div>
        ) : null}
        {results.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {results.slice(0, 5).map((result, index) => {
              const title = result.title?.trim() || 'Untitled'
              const url = result.url?.trim() || ''
              const content = result.content?.trim() || ''
              const snippet =
                content.length > 220 ? `${content.slice(0, 220)}…` : content

              return (
                <li key={`${url}-${index}`}>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-blue-700 hover:underline"
                    >
                      {title}
                    </a>
                  ) : (
                    <span className="text-sm font-medium">{title}</span>
                  )}
                  {snippet ? (
                    <div className="text-xs text-muted-foreground">
                      {snippet}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}
      </details>
    </BotCard>
  )
}
