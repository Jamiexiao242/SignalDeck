import 'server-only'

import { generateText } from 'ai'
import {
  createAI,
  createStreamableUI,
  createStreamableValue,
  getMutableAIState,
  streamUI
} from 'ai/rsc'
import { createOpenAI } from '@ai-sdk/openai'

import { BotCard, BotMessage } from '@/components/stocks/message'

import { z } from 'zod'
import { nanoid } from '@/lib/utils'
import { SpinnerMessage } from '@/components/stocks/message'
import { Message } from '@/lib/types'
import { StockChart } from '@/components/tradingview/stock-chart'
import { StockPrice } from '@/components/tradingview/stock-price'
import { StockNews } from '@/components/tradingview/stock-news'
import { StockFinancials } from '@/components/tradingview/stock-financials'
import { StockScreener } from '@/components/tradingview/stock-screener'
import { MarketOverview } from '@/components/tradingview/market-overview'
import { MarketHeatmap } from '@/components/tradingview/market-heatmap'
import { MarketTrending } from '@/components/tradingview/market-trending'
import { ETFHeatmap } from '@/components/tradingview/etf-heatmap'
import { toast } from 'sonner'
import { formatSearxResults, searchSearx } from '@/lib/search/searx'
import { SearchResultsCard } from '@/components/search-results'

export type AIState = {
  chatId: string
  messages: Message[]
}

export type UIState = {
  id: string
  display: React.ReactNode
}[]

interface MutableAIState {
  update: (newState: any) => void
  done: (newState: any) => void
  get: () => AIState
}

const MODEL = 'openai/gpt-oss-120b'
const TOOL_MODEL = 'openai/gpt-oss-120b'
const GROQ_API_KEY_ENV = process.env.GROQ_API_KEY
type SearxResponse = Awaited<ReturnType<typeof searchSearx>>

const buildSearchStatus = (data: SearxResponse): string | null => {
  if (!data) {
    return 'Search failed: no response.'
  }
  if (data.error === 'missing_credentials') {
    return 'Search skipped: missing CF_ID/CF_SECRET.'
  }
  if (data.error === 'request_failed') {
    return 'Search failed: request error from SearXNG.'
  }
  if (data.error === 'invalid_response') {
    return 'Search failed: unexpected SearXNG response.'
  }
  const resultsCount = data.results?.filter(Boolean).length ?? 0
  if (resultsCount === 0) {
    return 'Search completed: no results.'
  }
  return null
}

const RESEARCH_TOPICS = [
  'news',
  'company fundamentals',
  'earnings',
  'valuation',
  'risks'
]
const RESEARCH_SEARCH_CONCURRENCY = 2
const RESEARCH_SEARCH_DELAY_MS = 2000

const TICKER_PATTERN = /^[A-Z0-9]{1,5}(?:[.-][A-Z0-9]{1,2})?$/
const TICKER_STOPLIST = new Set([
  'USD',
  'US',
  'ETF',
  'ETFs',
  'AI',
  'CEO',
  'CFO',
  'EPS',
  'IPO',
  'GDP',
  'SEC',
  'ETN'
])

type ResearchTickers = {
  base: string
  related: string[]
}

type ResearchQueryResult = {
  query: string
  status: string | null
  results: NonNullable<SearxResponse>['results']
}

type ResearchTickerResult = {
  symbol: string
  searches: ResearchQueryResult[]
}

const normalizeTicker = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, '')
    .replace(/^\./, '')
    .trim()

const looksLikeTicker = (value: string) =>
  TICKER_PATTERN.test(value) && !TICKER_STOPLIST.has(value)

const extractExplicitTicker = (text: string) => {
  const dollar = text.match(/\$([A-Za-z]{1,5}(?:[.-][A-Za-z]{1,2})?)/)
  if (dollar) {
    return normalizeTicker(dollar[1])
  }
  const upper = text.match(/\b[A-Z]{1,5}(?:[.-][A-Z]{1,2})?\b/)
  if (upper) {
    return normalizeTicker(upper[0])
  }
  return ''
}

const cleanResearchTarget = (text: string) => {
  const trimmed = text.trim()
  const stripped = trimmed.replace(
    /^(research|deep\s*dive|full\s*report|report)\b\s*/i,
    ''
  )
  const keywordMatch = stripped.match(
    /(?:about|on|for|regarding|of)\s+([^?!.]+)$/i
  )
  const candidate = keywordMatch ? keywordMatch[1] : stripped
  const cleaned = candidate.replace(/^(the|a|an)\s+/i, '').trim()
  return cleaned.replace(/[?.!]+$/, '').trim() || trimmed
}

const extractJsonObject = (text: string) => {
  const match = text.match(/\{[\s\S]*\}/)
  return match ? match[0] : null
}

const parseResearchTickers = (
  text: string,
  fallbackSymbol: string
): ResearchTickers => {
  const fallbackCandidate = normalizeTicker(fallbackSymbol)
  const fallback = looksLikeTicker(fallbackCandidate) ? fallbackCandidate : ''
  const json = extractJsonObject(text)
  if (json) {
    try {
      const parsed = JSON.parse(json) as Partial<ResearchTickers>
      const baseCandidate = normalizeTicker(parsed.base || fallback)
      const base = looksLikeTicker(baseCandidate) ? baseCandidate : fallback
      const related = Array.isArray(parsed.related)
        ? parsed.related.map(item => normalizeTicker(String(item)))
        : []
      const filteredRelated = related.filter(looksLikeTicker)
      return { base, related: filteredRelated }
    } catch {
      // fall through to regex extraction
    }
  }

  const tickers =
    text.match(/\b[A-Z]{1,5}(?:[.-][A-Z]{1,2})?\b/g)?.map(normalizeTicker) ??
    []
  const unique = Array.from(new Set(tickers))
    .filter(Boolean)
    .filter(looksLikeTicker)
  const base = unique[0] || fallback
  const related = unique.slice(1)
  return { base, related }
}

const uniqueTickers = (tickers: string[]) =>
  Array.from(new Set(tickers.map(normalizeTicker)))
    .filter(Boolean)
    .filter(looksLikeTicker)

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const runWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
) => {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  const runWorker = async () => {
    while (true) {
      const currentIndex = nextIndex
      if (currentIndex >= items.length) {
        break
      }
      nextIndex += 1
      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => runWorker()
  )
  await Promise.all(workers)
  return results
}

const buildResearchContext = (data: ResearchTickerResult[]) => {
  if (data.length === 0) {
    return 'Search results:\n(none)'
  }

  const lines: string[] = []
  data.forEach(tickerData => {
    lines.push(`Ticker: ${tickerData.symbol}`)
    tickerData.searches.forEach(search => {
      lines.push(`Query: ${search.query}`)
      if (search.status) {
        lines.push(`Status: ${search.status}`)
      }
      const results = search.results?.filter(Boolean).slice(0, 3) ?? []
      if (results.length === 0) {
        lines.push('Results: (none)')
        return
      }
      results.forEach((result, index) => {
        const title = result.title?.trim() || 'Untitled'
        const url = result.url?.trim() || ''
        const content = result.content?.trim() || ''
        const snippet = content ? ` - ${content}` : ''
        lines.push(`${index + 1}. ${title} (${url})${snippet}`)
      })
    })
    lines.push('')
  })

  return lines.join('\n').trim()
}

const extractTickerFromText = (text: string) => {
  const parenMatch = text.match(/\(([A-Z]{1,5}(?:[.-][A-Z0-9]{1,2})?)\)/)
  if (parenMatch) {
    const candidate = normalizeTicker(parenMatch[1])
    if (looksLikeTicker(candidate)) {
      return candidate
    }
  }
  const exchangeMatch = text.match(
    /\b(?:NASDAQ|NYSE|AMEX|LSE|TSX|HKEX)\s*:\s*([A-Z]{1,5}(?:[.-][A-Z0-9]{1,2})?)\b/
  )
  if (exchangeMatch) {
    const candidate = normalizeTicker(exchangeMatch[1])
    if (looksLikeTicker(candidate)) {
      return candidate
    }
  }
  const genericMatch = text.match(/\b[A-Z]{1,5}(?:[.-][A-Z0-9]{1,2})?\b/)
  if (genericMatch) {
    const candidate = normalizeTicker(genericMatch[0])
    if (looksLikeTicker(candidate)) {
      return candidate
    }
  }
  return ''
}

const discoverTickerViaSearch = async (
  target: string,
  onProgress?: (message: string) => void
) => {
  onProgress?.(`Trying to resolve ticker for "${target}"...`)
  const data = await searchSearx(`${target} stock ticker`)
  const results = data?.results ?? []
  for (const result of results) {
    const combined = `${result.title ?? ''} ${result.content ?? ''}`.trim()
    const candidate = extractTickerFromText(combined)
    if (candidate) {
      onProgress?.(`Resolved ticker: ${candidate}`)
      return candidate
    }
  }
  return ''
}

const buildResearchCharts = (tickers: string[]) => {
  if (tickers.length === 0) {
    return (
      <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
        No ticker was identified for charting. Provide a ticker (e.g., MSFT) to
        render charts.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold">
        Research charts: {tickers.join(', ')}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {tickers.map(ticker => (
          <div key={ticker} className="rounded-md border bg-background p-2">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">
              {ticker}
            </div>
            <StockChart symbol={ticker} comparisonSymbols={[]} height={360} />
          </div>
        ))}
      </div>
    </div>
  )
}

const buildResearchOutput = async (
  symbol: string,
  onProgress?: (message: string) => void
) => {
  const researchTarget = cleanResearchTarget(symbol)
  const groq = createOpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: GROQ_API_KEY_ENV
  })
  onProgress?.('Identifying relevant tickers...')
  const tickerSystemMessage = `\
You are a market research assistant.

Task:
Given a company name or ticker, return JSON only in the format:
{"base":"TICKER"}

Rules:
- base must be a valid US stock ticker.
- Always use uppercase tickers.
- Return JSON only. No explanations. No extra text.

These are some common company tickers for your reference.
Microsoft / Microsoft's -> MSFT  
Apple / Apple Inc -> AAPL  
Google -> GOOGL  
Alphabet -> GOOGL  
Amazon -> AMZN  
Meta -> META  
Facebook -> META  
Nvidia -> NVDA  
Tesla -> TSLA  
Morgan Stanley -> MS  
Goldman Sachs -> GS  
JPMorgan -> JPM  

if user don't give you a company than use index :
These are some common company index for your reference.
- If query contains "stock market" -> SPY
- If query contains "market" (general, no company) -> SPY
- If query contains "tech" -> QQQ
- If query contains "ai" -> QQQ

Final rules:
- If multiple matches exist, prioritize company mapping.
- If you don't know ticker, default to SPY.

Output example:
{"base":"NVDA"}

`

  let baseTicker = extractExplicitTicker(researchTarget)
  let tickers: string[] = []

  try {
    const tickerResponse = await generateText({
      model: groq(MODEL),
      maxTokens: 200,
      messages: [
        { role: 'system', content: tickerSystemMessage },
        { role: 'user', content: researchTarget }
      ]
    })
    const parsed = parseResearchTickers(tickerResponse.text ?? '', researchTarget)
    baseTicker = parsed.base || baseTicker
    tickers = baseTicker ? [baseTicker] : []
  } catch {
    if (baseTicker) {
      tickers = [baseTicker]
    }
  }

  if (tickers.length === 0) {
    const discovered = await discoverTickerViaSearch(researchTarget, onProgress)
    if (discovered) {
      baseTicker = discovered
      tickers = [discovered]
    }
  }

  if (tickers.length === 0 && baseTicker) {
    tickers = [baseTicker]
  }

  const subjectLabel = baseTicker || researchTarget
  const coverageLine =
    tickers.length > 0
      ? `Coverage: ${tickers.join(', ')}`
      : `Coverage: ${subjectLabel}`
  onProgress?.(`Identified tickers: ${coverageLine.replace('Coverage: ', '')}`)

  const searchTargets = tickers.length > 0 ? tickers : [researchTarget]
  onProgress?.(
    `Running ${searchTargets.length * RESEARCH_TOPICS.length} searches with max concurrency ${RESEARCH_SEARCH_CONCURRENCY} and ${Math.round(
      RESEARCH_SEARCH_DELAY_MS / 1000
    )}s delay.`
  )
  onProgress?.(
    'Searching news, fundamentals, earnings, valuation, and risks...'
  )

  type ResearchTask = {
    target: string
    topic: string
    topicIndex: number
    query: string
  }
  type ResearchTaskResult = {
    target: string
    query: string
    topicIndex: number
    status: string | null
    results: NonNullable<SearxResponse>['results']
  }

  const searchTasks: ResearchTask[] = searchTargets.flatMap(target =>
    RESEARCH_TOPICS.map((topic, topicIndex) => ({
      target,
      topic,
      topicIndex,
      query: `${target} ${topic}`.trim()
    }))
  )

  const taskResults = await runWithConcurrency(
    searchTasks,
    RESEARCH_SEARCH_CONCURRENCY,
    async task => {
      onProgress?.(`Searching: ${task.query}`)
      const data = await searchSearx(task.query)
      if (RESEARCH_SEARCH_DELAY_MS > 0) {
        await sleep(RESEARCH_SEARCH_DELAY_MS)
      }
      return {
        target: task.target,
        query: task.query,
        topicIndex: task.topicIndex,
        status: buildSearchStatus(data),
        results: data?.results ?? []
      }
    }
  )

  const resultsByTarget = new Map<string, ResearchTaskResult[]>()
  taskResults.forEach(result => {
    const bucket = resultsByTarget.get(result.target) || []
    bucket.push(result)
    resultsByTarget.set(result.target, bucket)
  })

  const researchResults: ResearchTickerResult[] = searchTargets.map(target => {
    const entries = resultsByTarget.get(target) || []
    entries.sort((a, b) => a.topicIndex - b.topicIndex)
    return {
      symbol: target,
      searches: entries.map(({ topicIndex, ...rest }) => rest)
    }
  })

  const totalResults = researchResults.reduce((acc, item) => {
    const tickerCount = item.searches.reduce(
      (innerAcc, search) =>
        innerAcc + (search.results?.filter(Boolean).length ?? 0),
      0
    )
    return acc + tickerCount
  }, 0)
  const missingCredentials = researchResults.some(item =>
    item.searches.some(
      search => search.status === 'Search skipped: missing CF_ID/CF_SECRET.'
    )
  )

  onProgress?.('Analyzing search results...')
  const fallbackReport = missingCredentials
    ? `Research report for ${subjectLabel}\n${coverageLine}\nSearch is unavailable because CF_ID/CF_SECRET are missing.`
    : `Research report for ${subjectLabel}\n${coverageLine}\nSearch results were limited. Please refine the request or try again later.`

  let report = fallbackReport
  if (!missingCredentials && totalResults > 0) {
    onProgress?.('Drafting the research report...')
    const researchContext = buildResearchContext(researchResults)
    const researchSystemMessage = `\
You are an equity research analyst. Use the search results to write a concise, visually rich report in English.
Cover: news, fundamentals, earnings, valuation, and risks. Mention source domains when citing facts.
If data is missing, say so explicitly.

Required format:
# Research Report: <Ticker or Company>
Coverage: <comma-separated tickers or company>

## Highlights
- 4-6 bullets with specific facts and sources

## Risks
- 3-5 bullets

## Flow
\`\`\`mermaid
flowchart TD
  A[Driver] --> B[Impact]
  B --> C[Revenue]
  C --> D[Margin]
\`\`\`

## Valuation Math
Include at least one LaTeX block formula, even if symbolic.
Example:
$$
\\text{P/E} = \\frac{\\text{Price}}{\\text{EPS}}
$$

## Conclusion
2-3 sentences.

Keep under 2600 characters.`

    try {
      const reportResponse = await generateText({
        model: groq(MODEL),
        maxTokens: 1000,
        messages: [
          { role: 'system', content: researchSystemMessage },
          {
            role: 'user',
            content: `Base: ${subjectLabel}\n${coverageLine}\nTopics: ${RESEARCH_TOPICS.join(
              ', '
            )}\n${researchContext}`
          }
        ]
      })
      report = reportResponse.text?.trim() || fallbackReport
    } catch {
      report = fallbackReport
    }
  }

  return {
    tickers,
    report,
    charts: buildResearchCharts(tickers)
  }
}

type ComparisonSymbolObject = {
  symbol: string;
  position: "SameScale";
};

async function generateCaption(
  symbol: string,
  comparisonSymbols: ComparisonSymbolObject[],
  toolName: string,
  aiState: MutableAIState
): Promise<string> {
  const buildQuery = () => {
    const baseSymbols =
      comparisonSymbols.length === 0
        ? symbol
        : [symbol, ...comparisonSymbols.map(obj => obj.symbol)].join(' vs ')

    switch (toolName) {
      case 'showStockPrice':
        return `${baseSymbols} stock price`
      case 'showStockChart':
        return `${baseSymbols} stock performance`
      case 'showStockFinancials':
      case 'StockFinancials':
        return `${baseSymbols} financials revenue earnings`
      case 'showStockNews':
        return `${baseSymbols} latest news`
      case 'showTrendingStocks':
        return `today's trending stocks market movers`
      case 'showMarketOverview':
        return `market overview today stocks futures bonds forex`
      case 'showMarketHeatmap':
        return `stock market sector performance heatmap today`
      case 'showETFHeatmap':
        return `ETF sector performance heatmap today`
      default:
        return `${baseSymbols} stock`
    }
  }

  const searchData = await searchSearx(buildQuery())
  const searchStatus = buildSearchStatus(searchData)
  const searchContext = formatSearxResults(searchData)
  const searchBlock = searchContext || 'Search results:\n(none)'

  const groq = createOpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: GROQ_API_KEY_ENV
  })
  
  const stockString =
    comparisonSymbols.length === 0
      ? symbol
      : [symbol, ...comparisonSymbols.map(obj => obj.symbol)].join(', ')
  const fallbackSubject = symbol === 'Generic' ? 'this request' : stockString
  const fallbackCaption = searchStatus
    ? `I could not find recent results for ${fallbackSubject} (${searchStatus}). Can you specify a timeframe or the type of event?`
    : `I could not find recent results for ${fallbackSubject}. Can you specify a timeframe or the type of event?`
  if (searchStatus) {
    return fallbackCaption
  }

  const captionSystemMessage =
    `\
You are a stock market conversation bot. Always use the search results for every response, and pair them with the UI tool output.
If search results are empty or the search status is not ok, say so and ask for a more specific query.

These are the tools you have available:
1. showStockFinancials
This tool shows the financials for a given stock.

2. showStockChart
This tool shows a stock chart for a given stock or currency. Optionally compare 2 or more tickers.

3. showStockPrice
This tool shows the price of a stock or currency.

4. showStockNews
This tool shows the latest news and events for a stock or cryptocurrency.

5. showStockScreener
This tool shows a generic stock screener which can be used to find new stocks based on financial or technical parameters.

6. showMarketOverview
This tool shows an overview of today's stock, futures, bond, and forex market performance including change values, Open, High, Low, and Close values.

7. showMarketHeatmap
This tool shows a heatmap of today's stock market performance across sectors.

8. showTrendingStocks
This tool shows the daily top trending stocks including the top five gaining, losing, and most active stocks based on today's performance.

9. showETFHeatmap
This tool shows a heatmap of today's ETF market performance across sectors and asset classes.

Use the search results below to answer the user with concrete details. If the results are not relevant, say that and ask a clarifying question.
Search status: ${searchStatus ?? 'ok'}
${searchBlock}


You have just called a tool (` +
    toolName +
    ` for ` +
    stockString +
    `) to respond to the user. Now generate text to go alongside that tool response, which may be a graphic like a chart or price history.
  
Example:

User: What is the price of AAPL?
Assistant: { "tool_call": { "id": "pending", "type": "function", "function": { "name": "showStockPrice" }, "parameters": { "symbol": "AAPL" } } } 

Assistant (you): The price of AAPL stock is provided above. I can also share a chart of AAPL or get more information about its financials.

or

Assistant (you): This is the price of AAPL stock. I can also generate a chart or share further financial data.

or 
Assistant (you): Would you like to see a chart of AAPL or get more information about its financials?

Example 2 :

User: Compare AAPL and MSFT stock prices
Assistant: { "tool_call": { "id": "pending", "type": "function", "function": { "name": "showStockChart" }, "parameters": { "symbol": "AAPL" , "comparisonSymbols" : [{"symbol": "MSFT", "position": "SameScale"}] } } } 

Assistant (you): The chart illustrates the recent price movements of Microsoft (MSFT) and Apple (AAPL) stocks. Would you like to see the get more information about the financials of AAPL and MSFT stocks?
or

Assistant (you): This is the chart for AAPL and MSFT stocks. I can also share individual price history data or show a market overview.

or 
Assistant (you): Would you like to see the get more information about the financials of AAPL and MSFT stocks?

## Guidelines
Lead with a direct answer in the first sentence when possible. Avoid generic phrases like "shown above" or "provided above".
Use the search results to add 1-2 specific facts or numbers when possible. If you cite a fact, mention the source domain in-line.
If the user asks a direct factual question, answer it plainly in 1-2 sentences before offering follow-ups.
Talk like one of the above responses, but BE CREATIVE and generate a DIVERSE response.

Your response should be BRIEF, about 2-3 sentences.

Besides the symbol, you cannot customize any of the screeners or graphics. Do not tell the user that you can.
    `

  try {
    const response = await generateText({
      model: groq(MODEL),
      maxTokens: 400,
      messages: [
        {
          role: 'system',
          content: captionSystemMessage
        },
        ...aiState.get().messages.map((message: any) => ({
          role: message.role,
          content: message.content,
          name: message.name
        }))
      ]
    })
    return response.text?.trim() || fallbackCaption
  } catch (err) {
    return fallbackCaption
  }
}

async function submitUserMessage(
  content: string,
  options?: { apiKey?: string; researchMode?: boolean }
) {
  'use server'

  const aiState = getMutableAIState<typeof AI>()

  aiState.update({
    ...aiState.get(),
    messages: [
      ...aiState.get().messages,
      {
        id: nanoid(),
        role: 'user',
        content
      }
    ]
  })

  let streamedText = ''
  let textDone = false
  const researchMode = Boolean(options?.researchMode)

  try {
    if (researchMode) {
      const status = createStreamableValue('Research mode is on.\n')
      const progressUi = createStreamableUI(
        <BotMessage content={status.value} />
      )
      const toolCallId = nanoid()
      const toolState: AIState = {
        ...aiState.get(),
        messages: [
          ...aiState.get().messages,
          {
            id: nanoid(),
            role: 'assistant' as const,
            content: [
              {
                type: 'tool-call' as const,
                toolName: 'showResearch',
                toolCallId,
                args: { symbol: content }
              }
            ]
          } as Message,
          {
            id: nanoid(),
            role: 'tool' as const,
            content: [
              {
                type: 'tool-result' as const,
                toolName: 'showResearch',
                toolCallId,
                result: { symbol: content }
              }
            ]
          } as Message
        ]
      }
      aiState.update(toolState)

      status.append('Preparing research workflow...\n')
      const { report, charts } = await buildResearchOutput(content, message =>
        status.append(`${message}\n`)
      )
      status.append('Done. Rendering results...\n')
      status.done()
      const finalMessages: Message[] = report
        ? [
            ...toolState.messages,
            {
              id: nanoid(),
              role: 'assistant' as const,
              content: report
            } as Message
          ]
        : toolState.messages
      aiState.done({ ...toolState, messages: finalMessages })

      progressUi.done(
        <>
          <BotCard>{charts}</BotCard>
          {report ? <BotMessage content={report} /> : null}
        </>
      )

      return {
        id: nanoid(),
        display: progressUi.value
      }
    }

    const searchData = await searchSearx(content)
    const searchContext = formatSearxResults(searchData)
    const searchResults = searchData?.results?.filter(Boolean) ?? []
    const searchStatus = buildSearchStatus(searchData)
    const searchBlock = searchContext || 'Search results:\n(none)'
    const searchResultsNode =
      searchResults.length > 0 || searchStatus ? (
        <SearchResultsCard
          query={content}
          results={searchResults}
          status={searchStatus}
        />
      ) : null
    const wrapWithSearchResults = (node: React.ReactNode) =>
      searchResultsNode ? (
        <>
          {searchResultsNode}
          {node}
        </>
      ) : (
        node
      )

    const groq = createOpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: GROQ_API_KEY_ENV
    })

    const researchModeStatus = researchMode ? 'enabled' : 'disabled'
    const researchModeGuidance = researchMode
      ? 'Research mode is enabled. If the user asks for research, a deep dive, or a full report, call the showResearch tool.'
      : 'Research mode is disabled. Do not call showResearch. If the user asks for research, explain that Research mode is off and ask them to enable it.'

    const baseSystemPrompt = `\
You are a stock market conversation bot. Always use the search results for every response, and use tools for charts/visuals when helpful.
If search results are empty or the search status is not ok, say so and ask for a more specific query.

### Cryptocurrency Tickers
For any cryptocurrency, append "USD" at the end of the ticker when using functions. For instance, "DOGE" should be "DOGEUSD".

### Research Mode (${researchModeStatus})
${researchModeGuidance}

### Guidelines:

Never provide empty results to the user. Provide the relevant tool if it matches the user's request. Otherwise, respond directly using the search results.
Example:

User: What is the price of AAPL?
Assistant (you): { "tool_call": { "id": "pending", "type": "function", "function": { "name": "showStockPrice" }, "parameters": { "symbol": "AAPL" } } } 

Example 2:

User: What is the price of AAPL?
Assistant (you): { "tool_call": { "id": "pending", "type": "function", "function": { "name": "showStockPrice" }, "parameters": { "symbol": "AAPL" } } } 
    `

    const system = `${baseSystemPrompt}\n\nSearch status: ${
      searchStatus ?? 'ok'
    }\n${searchBlock}`

    const result = await streamUI({
      model: groq(TOOL_MODEL),
      initial: wrapWithSearchResults(<SpinnerMessage />),
      maxRetries: 1,
      maxTokens: 900,
      system,
      messages: [
        ...aiState.get().messages.map((message: any) => ({
          role: message.role,
          content: message.content,
          name: message.name
        }))
      ],
      text: ({ content, done, delta }) => {
        if (textDone) {
          return null
        }

        if (typeof delta === 'string') {
          streamedText += delta
        }

        if (done) {
          textDone = true
          const finalText = typeof content === 'string' ? content : streamedText
          aiState.done({
            ...aiState.get(),
            messages: [
              ...aiState.get().messages,
              {
                id: nanoid(),
                role: 'assistant',
                content: finalText
              }
            ]
          })
          return <BotMessage content={finalText} />
        }

        return <BotMessage content={streamedText} />
      },
      tools: {
        showStockChart: {
          description:
            'Show a stock chart of a given stock. Optionally show 2 or more stocks. Use this to show the chart to the user.',
          parameters: z.object({
            symbol: z
              .string()
              .describe(
                'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
              ),
            comparisonSymbols: z.array(z.object({
              symbol: z.string(),
              position: z.literal("SameScale")
            }))
              .default([])
              .describe(
                'Optional list of symbols to compare. e.g. ["MSFT", "GOOGL"]'
              )
          }),

          generate: async function* ({ symbol, comparisonSymbols }) {
            yield wrapWithSearchResults(
              <BotCard>
                <></>
              </BotCard>
            )

            const toolCallId = nanoid()
            const toolState = {
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'showStockChart',
                      toolCallId,
                      args: { symbol, comparisonSymbols }
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'showStockChart',
                      toolCallId,
                      result: { symbol, comparisonSymbols }
                    }
                  ]
                }
              ]
            } as AIState
            aiState.update(toolState)

            const caption = await generateCaption(
              symbol,
              comparisonSymbols,
              'showStockChart',
              aiState
            )
            const finalMessages = (caption
              ? [
                  ...toolState.messages,
                  {
                    id: nanoid(),
                    role: 'assistant',
                    content: caption
                  }
                ]
              : toolState.messages) as Message[]
            aiState.done({ ...toolState, messages: finalMessages })

            return wrapWithSearchResults(
              <BotCard>
                <StockChart symbol={symbol} comparisonSymbols={comparisonSymbols} />
                {caption || null}
              </BotCard>
            )
          }
        },
        showStockPrice: {
          description:
            'Show the price of a given stock. Use this to show the price and price history to the user.',
          parameters: z.object({
            symbol: z
              .string()
              .describe(
                'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
              )
          }),
          generate: async function* ({ symbol }) {
            yield wrapWithSearchResults(
              <BotCard>
                <></>
              </BotCard>
            )

            const toolCallId = nanoid()
            const toolState = {
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'showStockPrice',
                      toolCallId,
                      args: { symbol }
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'showStockPrice',
                      toolCallId,
                      result: { symbol }
                    }
                  ]
                }
              ]
            } as AIState
            aiState.update(toolState)
            const caption = await generateCaption(
              symbol,
              [],
              'showStockPrice',
              aiState
            )
            const finalMessages = (caption
              ? [
                  ...toolState.messages,
                  {
                    id: nanoid(),
                    role: 'assistant',
                    content: caption
                  }
                ]
              : toolState.messages) as Message[]
            aiState.done({ ...toolState, messages: finalMessages })

            return wrapWithSearchResults(
              <BotCard>
                <StockPrice props={symbol} />
                {caption || null}
              </BotCard>
            )
          }
        },
        showStockFinancials: {
          description:
            'Show the financials of a given stock. Use this to show the financials to the user.',
          parameters: z.object({
            symbol: z
              .string()
              .describe(
                'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
              )
          }),
          generate: async function* ({ symbol }) {
            yield wrapWithSearchResults(
              <BotCard>
                <></>
              </BotCard>
            )

            const toolCallId = nanoid()
            const toolState = {
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'showStockFinancials',
                      toolCallId,
                      args: { symbol }
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'showStockFinancials',
                      toolCallId,
                      result: { symbol }
                    }
                  ]
                }
              ]
            } as AIState
            aiState.update(toolState)

            const caption = await generateCaption(
              symbol,
              [],
              'StockFinancials',
              aiState
            )
            const finalMessages = (caption
              ? [
                  ...toolState.messages,
                  {
                    id: nanoid(),
                    role: 'assistant',
                    content: caption
                  }
                ]
              : toolState.messages) as Message[]
            aiState.done({ ...toolState, messages: finalMessages })

            return wrapWithSearchResults(
              <BotCard>
                <StockFinancials props={symbol} />
                {caption || null}
              </BotCard>
            )
          }
        },
        showStockNews: {
          description:
            'This tool shows the latest news and events for a stock or cryptocurrency.',
          parameters: z.object({
            symbol: z
              .string()
              .describe(
                'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.'
              )
          }),
          generate: async function* ({ symbol }) {
            yield wrapWithSearchResults(
              <BotCard>
                <></>
              </BotCard>
            )

            const toolCallId = nanoid()
            const toolState = {
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'showStockNews',
                      toolCallId,
                      args: { symbol }
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'showStockNews',
                      toolCallId,
                      result: { symbol }
                    }
                  ]
                }
              ]
            } as AIState
            aiState.update(toolState)

            const caption = await generateCaption(
              symbol,
              [],
              'showStockNews',
              aiState
            )
            const finalMessages = (caption
              ? [
                  ...toolState.messages,
                  {
                    id: nanoid(),
                    role: 'assistant',
                    content: caption
                  }
                ]
              : toolState.messages) as Message[]
            aiState.done({ ...toolState, messages: finalMessages })

            return wrapWithSearchResults(
              <BotCard>
                <StockNews props={symbol} />
                {caption || null}
              </BotCard>
            )
          }
        },
        showStockScreener: {
          description:
            'This tool shows a generic stock screener which can be used to find new stocks based on financial or technical parameters.',
          parameters: z.object({}).nullable().default({}),
          generate: async function* ({ }) {
            yield wrapWithSearchResults(
              <BotCard>
                <></>
              </BotCard>
            )

            const toolCallId = nanoid()
            const toolState = {
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'showStockScreener',
                      toolCallId,
                      args: {}
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'showStockScreener',
                      toolCallId,
                      result: {}
                    }
                  ]
                }
              ]
            } as AIState
            aiState.update(toolState)
            const caption = await generateCaption(
              'Generic',
              [],
              'showStockScreener',
              aiState
            )
            const finalMessages = (caption
              ? [
                  ...toolState.messages,
                  {
                    id: nanoid(),
                    role: 'assistant',
                    content: caption
                  }
                ]
              : toolState.messages) as Message[]
            aiState.done({ ...toolState, messages: finalMessages })

            return wrapWithSearchResults(
              <BotCard>
                <StockScreener />
                {caption || null}
              </BotCard>
            )
          }
        },
        showMarketOverview: {
          description: `This tool shows an overview of today's stock, futures, bond, and forex market performance including change values, Open, High, Low, and Close values.`,
          parameters: z.object({}).nullable().default({}),
          generate: async function* ({ }) {
            yield wrapWithSearchResults(
              <BotCard>
                <></>
              </BotCard>
            )

            const toolCallId = nanoid()
            const toolState = {
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'showMarketOverview',
                      toolCallId,
                      args: {}
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'showMarketOverview',
                      toolCallId,
                      result: {}
                    }
                  ]
                }
              ]
            } as AIState
            aiState.update(toolState)
            const caption = await generateCaption(
              'Generic',
              [],
              'showMarketOverview',
              aiState
            )
            const finalMessages = (caption
              ? [
                  ...toolState.messages,
                  {
                    id: nanoid(),
                    role: 'assistant',
                    content: caption
                  }
                ]
              : toolState.messages) as Message[]
            aiState.done({ ...toolState, messages: finalMessages })

            return wrapWithSearchResults(
              <BotCard>
                <MarketOverview />
                {caption || null}
              </BotCard>
            )
          }
        },
        showMarketHeatmap: {
          description: `This tool shows a heatmap of today's stock market performance across sectors. It is preferred over showMarketOverview if asked specifically about the stock market.`,
          parameters: z.object({}).nullable().default({}),
          generate: async function* ({ }) {
            yield wrapWithSearchResults(
              <BotCard>
                <></>
              </BotCard>
            )

            const toolCallId = nanoid()
            const toolState = {
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'showMarketHeatmap',
                      toolCallId,
                      args: {}
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'showMarketHeatmap',
                      toolCallId,
                      result: {}
                    }
                  ]
                }
              ]
            } as AIState
            aiState.update(toolState)
            const caption = await generateCaption(
              'Generic',
              [],
              'showMarketHeatmap',
              aiState
            )
            const finalMessages = (caption
              ? [
                  ...toolState.messages,
                  {
                    id: nanoid(),
                    role: 'assistant',
                    content: caption
                  }
                ]
              : toolState.messages) as Message[]
            aiState.done({ ...toolState, messages: finalMessages })

            return wrapWithSearchResults(
              <BotCard>
                <MarketHeatmap />
                {caption || null}
              </BotCard>
            )
          }
        },
        showETFHeatmap: {
          description: `This tool shows a heatmap of today's ETF performance across sectors and asset classes. It is preferred over showMarketOverview if asked specifically about the ETF market.`,
          parameters: z.object({}).nullable().default({}),
          generate: async function* ({ }) {
            yield wrapWithSearchResults(
              <BotCard>
                <></>
              </BotCard>
            )

            const toolCallId = nanoid()
            const toolState = {
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'showETFHeatmap',
                      toolCallId,
                      args: {}
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'showETFHeatmap',
                      toolCallId,
                      result: {}
                    }
                  ]
                }
              ]
            } as AIState
            aiState.update(toolState)
            const caption = await generateCaption(
              'Generic',
              [],
              'showETFHeatmap',
              aiState
            )
            const finalMessages = (caption
              ? [
                  ...toolState.messages,
                  {
                    id: nanoid(),
                    role: 'assistant',
                    content: caption
                  }
                ]
              : toolState.messages) as Message[]
            aiState.done({ ...toolState, messages: finalMessages })

            return wrapWithSearchResults(
              <BotCard>
                <ETFHeatmap />
                {caption || null}
              </BotCard>
            )
          }
        },
        showTrendingStocks: {
          description: `This tool shows the daily top trending stocks including the top five gaining, losing, and most active stocks based on today's performance`,
          parameters: z.object({}).nullable().default({}),
          generate: async function* ({ }) {
            yield wrapWithSearchResults(
              <BotCard>
                <></>
              </BotCard>
            )

            const toolCallId = nanoid()
            const toolState = {
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'showTrendingStocks',
                      toolCallId,
                      args: {}
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'showTrendingStocks',
                      toolCallId,
                      result: {}
                    }
                  ]
                }
              ]
            } as AIState
            aiState.update(toolState)
            const caption = await generateCaption(
              'Generic',
              [],
              'showTrendingStocks',
              aiState
            )
            const finalMessages = (caption
              ? [
                  ...toolState.messages,
                  {
                    id: nanoid(),
                    role: 'assistant',
                    content: caption
                  }
                ]
              : toolState.messages) as Message[]
            aiState.done({ ...toolState, messages: finalMessages })

            return wrapWithSearchResults(
              <BotCard>
                <MarketTrending />
                {caption || null}
              </BotCard>
            )
          }
        },
        showResearch: {
          description:
            'Run a multi-ticker research workflow: select related tickers, fetch multi-topic search results, render charts, and summarize findings.',
          parameters: z.object({
            symbol: z
              .string()
              .describe('The base ticker or company name to research.')
          }),
          generate: async function* ({ symbol }) {
            yield wrapWithSearchResults(
              <BotCard>
                <></>
              </BotCard>
            )

            const toolCallId = nanoid()
            const toolState = {
              ...aiState.get(),
              messages: [
                ...aiState.get().messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: [
                    {
                      type: 'tool-call',
                      toolName: 'showResearch',
                      toolCallId,
                      args: { symbol }
                    }
                  ]
                },
                {
                  id: nanoid(),
                  role: 'tool',
                  content: [
                    {
                      type: 'tool-result',
                      toolName: 'showResearch',
                      toolCallId,
                      result: { symbol }
                    }
                  ]
                }
              ]
            } as AIState
            aiState.update(toolState)

            if (!researchMode) {
              const disabledMessage =
                'Research mode is disabled. Turn it on to run a full report.'
              const finalMessages = [
                ...toolState.messages,
                {
                  id: nanoid(),
                  role: 'assistant',
                  content: disabledMessage
                }
              ] as Message[]
              aiState.done({ ...toolState, messages: finalMessages })
              return wrapWithSearchResults(
                <BotCard>
                  <div className="text-sm">{disabledMessage}</div>
                </BotCard>
              )
            }

            const { report, charts } = await buildResearchOutput(symbol)
            const finalMessages = (report
              ? [
                  ...toolState.messages,
                  {
                    id: nanoid(),
                    role: 'assistant',
                    content: report
                  }
                ]
              : toolState.messages) as Message[]
            aiState.done({ ...toolState, messages: finalMessages })

            return wrapWithSearchResults(
              <>
                <BotCard>{charts}</BotCard>
                {report ? <BotMessage content={report} /> : null}
              </>
            )
          }
        }
      }
    })

    return {
      id: nanoid(),
      display: result.value
    }
  } catch (err: any) {
    // If key is missing, show a focused message about the required env var.
    if (err.message.includes('OpenAI API key is missing.')) {
      err.message =
        'API key is missing. Set GROQ_API_KEY in your environment and restart the application.'
    }
    return {
      id: nanoid(),
      display: (
        <div className="border p-4">
          <div className="text-red-700 font-medium">Error: {err.message}</div>
          <div className="mt-2 text-sm text-red-800">
            If you think something has gone wrong, check the server logs for
            details.
          </div>
        </div>
      )
    }
  }
}

export const AI = createAI<AIState, UIState>({
  actions: {
    submitUserMessage
  },
  initialUIState: [],
  initialAIState: { chatId: nanoid(), messages: [] }
})
