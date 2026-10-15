"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { call } from "@/lib/client"

export function AddLeadDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const get = (k: string) => String(fd.get(k) ?? "").trim()
    setBusy(true)
    try {
      await call("/leads", {
        body: {
          handle: get("handle"),
          name: get("name"),
          niche: get("niche"),
          industry: get("industry"),
          notes: get("notes"),
          tags: get("tags").split(",").map((t) => t.trim()).filter(Boolean),
        },
      })
      toast.success("Lead saved")
      onOpenChange(false)
      onDone()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add lead</DialogTitle>
          <DialogDescription>Only the Instagram handle is required. Name and niche feed your merge fields.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="handle">Instagram handle or profile URL</Label>
            <Input id="handle" name="handle" required placeholder="@studio.anna" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Anna" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="niche">Niche</Label>
              <Input id="niche" name="niche" placeholder="wedding photography" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" name="industry" placeholder="photographer" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tags">Tags</Label>
              <Input id="tags" name="tags" placeholder="warm, referral" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
