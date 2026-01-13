import { UseChatHelpers } from 'ai/react'
export function EmptyScreen() {
  return (
    <div className="mx-auto max-w-2xl px-4">
      <div className="flex flex-col gap-2 border bg-background p-8">
        <h1 className="text-lg font-semibold">
          Welcome to SignalDeck!
        </h1>
        <p className="leading-normal text-sm">
          Open source AI assistant that uses tool calling to render relevant
          TradingView market widgets and data directly in chat.
        </p>
      </div>
    </div>
  )
}
