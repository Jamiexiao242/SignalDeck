'use server'

import { redirect } from 'next/navigation'

export async function refreshHistory(path: string) {
  redirect(path)
}

export async function getMissingKeys() {
  const googleApiKey =
    process.env.GOOGLEsearch_API_KEY ||
    process.env.GOOGLESEARCH_API_KEY ||
    process.env.GOOGLE_SEARCH_API_KEY
  const googleCx =
    process.env.GOOGLEsearch_CX ||
    process.env.GOOGLESEARCH_CX ||
    process.env.GOOGLE_SEARCH_CX
  const hasGoogleSearch = Boolean(googleApiKey && googleCx)
  const keysRequired: string[] = hasGoogleSearch
    ? ['GROQ_API_KEY']
    : ['GROQ_API_KEY', 'CF_ID', 'CF_SECRET']
  return keysRequired
    .map(key => (process.env[key] ? '' : key))
    .filter(key => key !== '')
}
