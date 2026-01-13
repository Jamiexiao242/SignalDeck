import * as React from 'react'

export function MissingApiKeyBanner({
  missingKeys
}: {
  missingKeys: string[]
}) {
  if (!missingKeys.includes('GROQ_API_KEY')) {
    return null
  }

  return (
    <div className="border p-4">
      <div className="text-red-700 font-medium">
        Missing API key. Set GROQ_API_KEY in your environment.
      </div>
    </div>
  )
}
