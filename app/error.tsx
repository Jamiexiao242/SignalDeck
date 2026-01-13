'use client'

import { useEffect } from 'react'

interface ErrorProps {
  error: Error
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="border p-4">
      <div className="text-red-700 font-medium">Error: {error.message}</div>
      <div className="flex items-center mt-2 text-sm text-red-800">
        Please try again. If the issue persists, check the server logs for
        details.
      </div>
    </div>
  )
}
