"use client"

import { LEAD_STATUSES, type LeadStatus } from "@reachly/shared"
import { CheckCircle2, Circle } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { LEAD_STATUS_LABEL, PageHeader } from "@/components/common"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { call, useApi } from "@/lib/client"
import type { Account, Campaign, Template } from "@/lib/types"

const PIPELINE_COLOR: Record<LeadStatus, string> = {
  New: "bg-zinc-400",
  Contacted: "bg-blue-500",
  Replied: "bg-violet-500",
  Converted: "bg-emerald-500",
  NotInterested: "bg-red-400",
}

export default function DashboardPage() {
  const accounts = useApi<Account[]>("/accounts")
  const counts = useApi<Record<LeadStatus, number>>("/leads/counts").data
  const templates = useApi<Template[]>("/templates").data
  const campaigns = useApi<Campaign[]>("/campaigns").data
  const totalLeads = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0

  const steps = [
    { done: !!accounts.data?.length, label: "Add the Instagram account you send from", href: "/settings" },
    { done: !!accounts.data?.some((a) => a.lastHeartbeatAt), label: "Install and connect the Chrome extension", href: "/settings" },
    { done: totalLeads > 0, label: "Import your leads", href: "/leads" },
    { done: !!templates?.length, label: "Write a message template", href: "/templates" },
    { done: !!campaigns?.some((c) => c.status !== "Draft"), label: "Start a campaign", href: "/campaigns" },
  ]

  async function resume(id: string) {
    try {
      await call(`/accounts/${id}/resume`, { method: "POST" })
      accounts.reload()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader title="Dashboard" />

      {accounts.data
        ?.filter((a) => a.pausedReason)
        .map((a) => (
          <Alert key={a.id} className="mb-4 border-amber-500/40">
            <AlertTitle>Sending from @{a.handle} is paused</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{a.pausedReason}. Open Instagram and check for warnings before resuming.</span>
              <Button size="sm" onClick={() => resume(a.id)}>
                Resume
              </Button>
            </AlertDescription>
          </Alert>
        ))}

      {steps.some((s) => !s.done) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Get set up</CardTitle>
            <CardDescription>
              {steps.filter((s) => s.done).length} of {steps.length} done
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {steps.map((s) => (
              <Link key={s.label} href={s.href} className="flex items-center gap-2 text-sm hover:underline">
                {s.done ? <CheckCircle2 className="size-4 text-emerald-500" /> : <Circle className="size-4 text-muted-foreground" />}
                <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.label}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {accounts.data?.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle>@{a.handle}</CardTitle>
              <CardDescription>
                <span className={a.online ? "text-emerald-600 dark:text-emerald-400" : ""}>{a.online ? "● Extension online" : "○ Extension offline"}</span>
                {" · "}
                {a.queued.toLocaleString()} queued
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-semibold tabular-nums">
                  {a.sent24h}
                  <span className="text-base font-normal text-muted-foreground"> / {a.dailyLimit}</span>
                </span>
                <span className="text-sm text-muted-foreground">sent in last 24h</span>
              </div>
              <Progress value={(a.sent24h / a.dailyLimit) * 100} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
          <CardDescription>{totalLeads.toLocaleString()} leads</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {counts &&
              totalLeads > 0 &&
              LEAD_STATUSES.map((s) => <div key={s} className={PIPELINE_COLOR[s]} style={{ width: `${(counts[s] / totalLeads) * 100}%` }} title={`${LEAD_STATUS_LABEL[s]}: ${counts[s]}`} />)}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {LEAD_STATUSES.map((s) => (
              <Link key={s} href={`/leads?status=${s}`} className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`size-2 rounded-full ${PIPELINE_COLOR[s]}`} />
                  {LEAD_STATUS_LABEL[s]}
                </div>
                <div className="text-xl font-semibold tabular-nums">{(counts?.[s] ?? 0).toLocaleString()}</div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
