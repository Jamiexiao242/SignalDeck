'use client'

import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

export function SiteNotice() {
  const [open, setOpen] = React.useState(true)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome to SignalDeck</DialogTitle>
          <DialogDescription>
            This is a free public demo node. SignalDeck is a fork of StockBot
            by Groq with added search context, research capabilities, and enhanced Markdown rendering
  (flowcharts, LaTeX, and more).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Since this is a free demo service, API capacity is limited. If something fails,
    please try again tomorrow.
          </p>
            <p>
    Disclaimer: This project is for educational and research purposes only.
    It does not constitute financial or investment advice.
  </p>
          <p>Enjoy!</p>
          <p>Author: Jamie</p>
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
