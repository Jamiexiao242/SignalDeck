import 'server-only'

type SearxResult = {
  title?: string
  url?: string
  content?: string
}

type SearxResponse = {
  results?: SearxResult[]
  error?: 'missing_credentials' | 'request_failed' | 'invalid_response'
}

type GoogleSearchItem = {
  title?: string
  link?: string
  snippet?: string
}

type GoogleSearchResponse = {
  items?: GoogleSearchItem[]
  error?: {
    message?: string
  }
}

const DEFAULT_SEARXNG_URL = 'https://apisearch.jamiehsiao.us/search'
const DEFAULT_SEARXNG_LANGUAGE = 'en'
const DEFAULT_QUERY_EXCLUDE =
  '-site:*.cn -site:cn -site:zh.wikipedia.org'
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36'
const DEFAULT_SEARXNG_ENGINES = ''
const DEFAULT_GOOGLESEARCH_LANGUAGE = 'en'

const getResultsCount = (data: SearxResponse | null | undefined) =>
  data?.results?.filter(Boolean).length ?? 0

const getEnvValue = (keys: string[]) =>
  keys.map(key => process.env[key]).find(Boolean) || ''

const parseEngines = (value: string) =>
  value
    .split(',')
    .map(engine => engine.trim())
    .filter(Boolean)

const fetchSearx = async (
  endpoint: string,
  params: URLSearchParams,
  headers: Record<string, string>
): Promise<SearxResponse> => {
  const url = new URL(endpoint)
  url.search = params.toString()

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers,
    cache: 'no-store'
  })

  if (!res.ok) {
    return { results: [], error: 'request_failed' }
  }

  const data = (await res.json()) as SearxResponse
  return data?.results ? data : { results: [], error: 'invalid_response' }
}

const fetchGoogleSearch = async ({
  query,
  apiKey,
  cx,
  language,
  userAgent
}: {
  query: string
  apiKey: string
  cx: string
  language: string
  userAgent: string
}): Promise<SearxResponse> => {
  const url = new URL('https://www.googleapis.com/customsearch/v1')
  url.searchParams.set('q', query)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('cx', cx)
  url.searchParams.set('hl', language)
  url.searchParams.set('num', '10')

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'user-agent': userAgent
    },
    cache: 'no-store'
  })

  if (!res.ok) {
    return { results: [], error: 'request_failed' }
  }

  const data = (await res.json()) as GoogleSearchResponse
  if (data.error) {
    return { results: [], error: 'request_failed' }
  }

  const results = (data.items || []).map(item => ({
    title: item.title,
    url: item.link,
    content: item.snippet
  }))

  return { results }
}

export async function searchSearx(query: string): Promise<SearxResponse | null> {
  const endpoint = process.env.SEARXNG_URL || DEFAULT_SEARXNG_URL
  const language = process.env.SEARXNG_LANGUAGE || DEFAULT_SEARXNG_LANGUAGE
  const queryExclude = process.env.SEARXNG_QUERY_EXCLUDE || DEFAULT_QUERY_EXCLUDE
  const userAgent = process.env.SEARXNG_USER_AGENT || DEFAULT_USER_AGENT
  const enginesRaw = process.env.SEARXNG_ENGINES || DEFAULT_SEARXNG_ENGINES
  const engines = enginesRaw ? parseEngines(enginesRaw) : []
  const googleApiKey = getEnvValue([
    'GOOGLEsearch_API_KEY',
    'GOOGLESEARCH_API_KEY',
    'GOOGLE_SEARCH_API_KEY'
  ])
  const googleCx = getEnvValue([
    'GOOGLEsearch_CX',
    'GOOGLESEARCH_CX',
    'GOOGLE_SEARCH_CX'
  ])
  const googleLanguage =
    getEnvValue(['GOOGLEsearch_LANGUAGE', 'GOOGLESEARCH_LANGUAGE']) ||
    language ||
    DEFAULT_GOOGLESEARCH_LANGUAGE
  const useGoogleFallback = ['true', '1', 'yes'].includes(
    (process.env.GOOGLESEARCH_FALLBACK_SEARX || '').toLowerCase()
  )
  const clientId = process.env.CF_ID
  const clientSecret = process.env.CF_SECRET

  if (googleApiKey && googleCx) {
    const googleResult = await fetchGoogleSearch({
      query,
      apiKey: googleApiKey,
      cx: googleCx,
      language: googleLanguage,
      userAgent
    })
    if (!useGoogleFallback || getResultsCount(googleResult) > 0) {
      return googleResult
    }
  }

  if (!clientId || !clientSecret) {
    return { results: [], error: 'missing_credentials' }
  }

  try {
    const headers = {
      accept: 'application/json',
      'user-agent': userAgent,
      'CF-Access-Client-Id': clientId,
      'CF-Access-Client-Secret': clientSecret
    }
    const queryWithExclude = `${query} ${queryExclude}`.trim()

    if (engines.length === 0) {
      const primaryParams = new URLSearchParams({
        q: queryWithExclude,
        format: 'json',
        language
      })
      const primary = await fetchSearx(endpoint, primaryParams, headers)

      if (
        getResultsCount(primary) === 0 &&
        !primary.error &&
        queryExclude.trim().length > 0
      ) {
        const fallbackParams = new URLSearchParams({
          q: query.trim(),
          format: 'json',
          language
        })
        const fallback = await fetchSearx(endpoint, fallbackParams, headers)
        return getResultsCount(fallback) > 0 ? fallback : primary
      }

      return primary
    }

    let lastResponse: SearxResponse = { results: [] }
    let lastError: SearxResponse | null = null

    for (const engine of engines) {
      const primaryParams = new URLSearchParams({
        q: queryWithExclude,
        format: 'json',
        language
      })
      primaryParams.set('engines', engine)
      const primary = await fetchSearx(endpoint, primaryParams, headers)

      if (getResultsCount(primary) > 0) {
        return primary
      }

      if (primary.error) {
        lastError = primary
        continue
      }

      let candidate = primary
      if (queryExclude.trim().length > 0) {
        const fallbackParams = new URLSearchParams({
          q: query.trim(),
          format: 'json',
          language
        })
        fallbackParams.set('engines', engine)
        const fallback = await fetchSearx(endpoint, fallbackParams, headers)
        if (getResultsCount(fallback) > 0) {
          return fallback
        }
        candidate = fallback
      }

      if (candidate.error) {
        lastError = candidate
      } else {
        lastResponse = candidate
      }
    }

    return lastResponse.results?.length ? lastResponse : lastError || lastResponse
  } catch {
    return { results: [], error: 'request_failed' }
  }
}

export function formatSearxResults(data: SearxResponse | null): string {
  const results = data?.results?.filter(Boolean) || []
  if (results.length === 0) {
    return ''
  }

  const lines = results.slice(0, 10).map((result, index) => {
    const title = result.title?.trim() || 'Untitled'
    const url = result.url?.trim() || ''
    const content = result.content?.trim() || ''
    const snippet = content ? ` - ${content}` : ''
    return `${index + 1}. ${title} (${url})${snippet}`
  })

  return `Search results:\n${lines.join('\n')}`
}
