"use client"

import { Plug, Plus, Settings2, Trash2, Unlink } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { AccountDialog } from "@/components/account-dialog"
import { EmptyState, fmtDate, PageHeader } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { call, useApi } from "@/lib/client"
import type { Account } from "@/lib/types"
import { useExtension } from "@/lib/use-extension"

export default function SettingsPage() {
  const { data: accounts, reload } = useApi<Account[]>("/accounts")
  const ext = useExtension()
  const [editing, setEditing] = useState<Account | null>(null)
  const [open, setOpen] = useState(false)
  const [pairing, setPairing] = useState(false)

  const edit = (a: Account | null) => {
    setEditing(a)
    setOpen(true)
  }

  async function post(path: string, method = "POST", ok?: string) {
    try {
      await call(path, { method })
      if (ok) toast.success(ok)
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function connect() {
    setPairing(true)
    try {
      const ok = await ext.pair()
      if (ok) toast.success("Extension connected. Open it from the Chrome toolbar and press Start.")
      else toast.error("The extension did not answer. Reload this page and try again.")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setPairing(false)
    }
  }

  return (
    <>
      <PageHeader title="Settings" />

      <section className="mb-10">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="font-semibold">Instagram accounts</h2>
            <p className="text-sm text-muted-foreground">The accounts your campaigns send from. Log into the same account on instagram.com in the Chrome profile running the extension.</p>
          </div>
          <Button variant="outline" onClick={() => edit(null)}>
            <Plus /> Add account
          </Button>
        </div>
        {accounts && !accounts.length ? (
          <EmptyState title="No Instagram account yet">Add the handle you will send cold messages from.</EmptyState>
        ) : (
          <div className="grid gap-3">
            {accounts?.map((a) => (
              <Card key={a.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    @{a.handle}
                    {a.pausedReason ? (
                      <Badge className="border-0 bg-amber-500/15 text-amber-700 dark:text-amber-300">Paused</Badge>
                    ) : a.online ? (
                      <Badge className="border-0 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">Extension online</Badge>
                    ) : (
                      <Badge variant="secondary">Extension offline</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {a.dailyLimit}/24h · {a.minDelaySec}–{a.maxDelaySec}s between messages · quiet {a.quietStart}–{a.quietEnd} ({a.timezone})
                  </CardDescription>
                  <CardAction className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => edit(a)} aria-label="Edit limits">
                      <Settings2 />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => post(`/accounts/${a.id}`, "DELETE", "Account removed")} aria-label="Remove account">
                      <Trash2 />
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {a.pausedReason && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-500/10 p-3">
                      <span>Paused: {a.pausedReason}</span>
                      <Button size="sm" onClick={() => post(`/accounts/${a.id}/resume`, "POST", "Sending resumed")}>
                        I checked Instagram — resume
                      </Button>
                    </div>
                  )}
                  <p className="text-muted-foreground">
                    Last seen {fmtDate(a.lastHeartbeatAt)}
                    {a.extensionVersion && ` · extension v${a.extensionVersion}`}
                    {a.igUserId ? (
                      <>
                        {" · "}bound to Instagram login #{a.igUserId}{" "}
                        <button className="inline-flex items-center gap-1 underline" onClick={() => post(`/accounts/${a.id}/unbind`, "POST", "Login unbound")}>
                          <Unlink className="size-3" /> unbind
                        </button>
                      </>
                    ) : (
                      " · not yet bound to a browser login"
                    )}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold">Chrome extension</h2>
        <p className="mb-3 text-sm text-muted-foreground">Cold messages are sent by the extension from your own browser session. Chrome must stay open while a campaign runs.</p>
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm">
              {ext.installed ? (
                <span>
                  Extension detected <span className="text-muted-foreground">v{ext.version}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Extension not detected in this browser. Install it, then reload this page.</span>
              )}
            </div>
            <Button onClick={connect} disabled={!ext.installed || pairing}>
              <Plug /> {pairing ? "Connecting…" : "Connect extension"}
            </Button>
          </CardContent>
        </Card>
      </section>

      <AccountDialog account={editing} open={open} onOpenChange={setOpen} onSaved={reload} />
    </>
  )
}
