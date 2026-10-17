"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { call } from "@/lib/client"
import type { Account } from "@/lib/types"

const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** Add a new account (account = null) or edit an existing one's sending limits. */
export function AccountDialog({ account, open, onOpenChange, onSaved }: { account: Account | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState({ handle: "", timezone: "", dailyLimit: 20, minDelaySec: 45, maxDelaySec: 120, quietStart: "22:00", quietEnd: "07:00", pauseOnErrors: true })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(account ? { ...account } : { handle: "", timezone: browserTz(), dailyLimit: 20, minDelaySec: 45, maxDelaySec: 120, quietStart: "22:00", quietEnd: "07:00", pauseOnErrors: true })
  }, [open, account])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const num = (k: "dailyLimit" | "minDelaySec" | "maxDelaySec") => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value)) })

  async function save() {
    setBusy(true)
    try {
      await call(account ? `/accounts/${account.id}` : "/accounts", { method: account ? "PATCH" : "POST", body: form })
      toast.success("Saved")
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? `@${account.handle} settings` : "Add Instagram account"}</DialogTitle>
          <DialogDescription>Limits are counted per Instagram account across every browser that sends for it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="acc-handle">Instagram handle</Label>
            <Input id="acc-handle" value={form.handle} onChange={(e) => set("handle", e.target.value)} placeholder="@yourbrand" autoFocus={!account} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="acc-limit">Messages per 24h</Label>
              <Input id="acc-limit" type="number" min={1} max={300} {...num("dailyLimit")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="acc-tz">Timezone</Label>
              <Input id="acc-tz" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="Europe/Warsaw" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="acc-min">Min delay (sec)</Label>
              <Input id="acc-min" type="number" min={15} max={600} {...num("minDelaySec")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="acc-max">Max delay (sec)</Label>
              <Input id="acc-max" type="number" min={15} max={600} {...num("maxDelaySec")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="acc-qs">Quiet hours from</Label>
              <Input id="acc-qs" type="time" value={form.quietStart} onChange={(e) => set("quietStart", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="acc-qe">to</Label>
              <Input id="acc-qe" type="time" value={form.quietEnd} onChange={(e) => set("quietEnd", e.target.value)} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">Quiet hours apply in each lead&apos;s own timezone when known, otherwise this account&apos;s.</p>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              Pause after 3 failed sends in a row
              <span className="block text-xs text-muted-foreground">Blocks, rate limits and logouts always pause immediately.</span>
            </span>
            <Switch checked={form.pauseOnErrors} onCheckedChange={(v) => set("pauseOnErrors", v)} />
          </label>
          <p className="rounded-md bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
            New or quiet accounts should stay at 15–30 messages a day. Pacing lowers the risk of Instagram limiting your account; it does not remove it.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={busy || !form.handle.trim()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
