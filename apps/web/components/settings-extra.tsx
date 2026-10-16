"use client"

import { Copy, KeyRound, RefreshCw } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { call, useApi } from "@/lib/client"
import type { Me } from "@/lib/types"

export function PasswordCard() {
  const me = useApi<Me>("/me")
  const [current, setCurrent] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await call("/me/password", { body: { current, password } })
      toast.success("Password changed")
      setCurrent("")
      setPassword("")
      me.reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const hasPassword = me.data?.hasPassword
  return (
    <section className="mb-10">
      <h2 className="font-semibold">Your password</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        {hasPassword === false ? "You sign in with Google. Set a password to also sign in with your email." : "Change the password you sign in with."}
      </p>
      <Card>
        <CardContent>
          <form onSubmit={save} className="flex flex-wrap items-end gap-3">
            {hasPassword !== false && (
              <div className="grid min-w-48 flex-1 gap-1.5">
                <Label htmlFor="pw-current">Current password</Label>
                <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
              </div>
            )}
            <div className="grid min-w-48 flex-1 gap-1.5">
              <Label htmlFor="pw-new">New password</Label>
              <Input id="pw-new" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy || password.length < 8 || (hasPassword !== false && !current)}>
              <KeyRound /> {busy ? "Saving…" : hasPassword === false ? "Set password" : "Change password"}
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">At least 8 characters.</p>
        </CardContent>
      </Card>
    </section>
  )
}

export function CalendlyCard() {
  const { data, setData } = useApi<{ webhookToken: string | null }>("/integrations")
  const url = data?.webhookToken && typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/calendly/${data.webhookToken}` : null

  async function rotate() {
    try {
      setData(await call<{ webhookToken: string }>("/integrations/webhook-token", { method: "POST" }))
      toast.success(url ? "New URL created. Update it in Calendly; the old one no longer works." : "Webhook URL created")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <section className="mb-10">
      <h2 className="font-semibold">Calendly</h2>
      <p className="mb-3 text-sm text-muted-foreground">When a lead books a call, they are marked Converted and their remaining follow-ups are cancelled.</p>
      <Card>
        <CardContent className="space-y-3 text-sm">
          {url ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input readOnly value={url} className="min-w-0 flex-1 font-mono text-xs" aria-label="Calendly webhook URL" onFocus={(e) => e.target.select()} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Copied"))}
              >
                <Copy /> Copy
              </Button>
              <Button variant="ghost" size="sm" onClick={rotate}>
                <RefreshCw /> New URL
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={rotate} disabled={!data}>
              Create webhook URL
            </Button>
          )}
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>
              In Calendly, add a webhook subscription for <span className="font-mono">invitee.created</span> pointing at this URL.
            </li>
            <li>
              Tell Calendly who the lead is: put your booking link in a template as <span className="font-mono">calendly.com/you/call?utm_content={"{{handle}}"}</span>, or add a booking question asking for their Instagram handle.
            </li>
          </ol>
        </CardContent>
      </Card>
    </section>
  )
}
