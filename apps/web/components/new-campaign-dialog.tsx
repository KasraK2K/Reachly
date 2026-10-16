"use client"

import { LEAD_STATUSES } from "@reachly/shared"
import { Plus, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { LEAD_STATUS_LABEL } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { call, useApi } from "@/lib/client"
import type { Account, Template } from "@/lib/types"

const ALL = "__all"

export function NewCampaignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter()
  const accounts = useApi<Account[]>(open ? "/accounts" : null).data
  const templates = useApi<Template[]>(open ? "/templates" : null).data
  const tags = useApi<string[]>(open ? "/leads/tags" : null).data
  const [name, setName] = useState("")
  const [accountId, setAccountId] = useState("")
  const [templateIds, setTemplateIds] = useState<string[]>([])
  const [status, setStatus] = useState<string>("New")
  const [tag, setTag] = useState(ALL)
  const [followUps, setFollowUps] = useState<{ templateId: string; delayDays: number }[]>([])
  const setFollowUp = (i: number, patch: Partial<{ templateId: string; delayDays: number }>) =>
    setFollowUps(followUps.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (accounts?.[0] && !accountId) setAccountId(accounts[0].id)
  }, [accounts, accountId])

  async function create() {
    setBusy(true)
    try {
      const c = await call<{ id: string }>("/campaigns", {
        body: { name, igAccountId: accountId, templateIds, filter: { status, ...(tag !== ALL && { tag }) }, followUps },
      })
      onOpenChange(false)
      router.push(`/campaigns/${c.id}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const missing = accounts && !accounts.length ? "account" : templates && !templates.length ? "template" : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>Creates a draft with every message pre-written so you can review it before anything is sent.</DialogDescription>
        </DialogHeader>

        {missing === "account" ? (
          <p className="text-sm">
            Add the Instagram account you will send from in{" "}
            <Link href="/settings" className="text-primary underline">
              Settings
            </Link>{" "}
            first.
          </p>
        ) : missing === "template" ? (
          <p className="text-sm">
            Write at least one message in{" "}
            <Link href="/templates" className="text-primary underline">
              Templates
            </Link>{" "}
            first.
          </p>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="c-name">Name</Label>
              <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Photographers — October" />
            </div>
            <div className="grid gap-1.5">
              <Label>Send from</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Instagram account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      @{a.handle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Message variants</Label>
              <div className="max-h-44 space-y-2 overflow-auto rounded-md border p-3">
                {templates?.map((t) => (
                  <label key={t.id} className="flex items-start gap-2 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={templateIds.includes(t.id)}
                      onCheckedChange={(v) => setTemplateIds(v ? [...templateIds, t.id] : templateIds.filter((id) => id !== t.id))}
                    />
                    <span>
                      <span className="font-medium">{t.name}</span>
                      <span className="line-clamp-1 text-muted-foreground">{t.body}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Variants are rotated across leads so you can compare them later.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Lead status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {LEAD_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Tag</Label>
                <Select value={tag} onValueChange={setTag}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any tag</SelectItem>
                    {tags?.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Follow-ups</Label>
              {followUps.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={f.templateId} onValueChange={(v) => setFollowUp(i, { templateId: v })}>
                    <SelectTrigger className="min-w-0 flex-1" aria-label={`Follow-up ${i + 1} template`}>
                      <SelectValue placeholder="Template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates?.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    className="w-20"
                    aria-label={`Follow-up ${i + 1} delay in days`}
                    value={f.delayDays}
                    onChange={(e) => setFollowUp(i, { delayDays: Number(e.target.value) })}
                  />
                  <span className="text-sm whitespace-nowrap text-muted-foreground">days later</span>
                  <Button variant="ghost" size="icon-sm" aria-label="Remove follow-up" onClick={() => setFollowUps(followUps.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                </div>
              ))}
              {followUps.length < 5 && (
                <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setFollowUps([...followUps, { templateId: "", delayDays: 3 }])}>
                  <Plus /> Add follow-up
                </Button>
              )}
              <p className="text-xs text-muted-foreground">Sent only if the lead hasn&apos;t replied. Marking a lead Replied or Not interested stops the rest.</p>
            </div>
            <p className="text-xs text-muted-foreground">Leads that were already messaged or are queued in another campaign are left out automatically.</p>
          </div>
        )}

        <DialogFooter>
          <Button onClick={create} disabled={!!missing || busy || !name.trim() || !accountId || !templateIds.length || followUps.some((f) => !f.templateId || f.delayDays < 1 || f.delayDays > 30)}>
            {busy ? "Creating…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
