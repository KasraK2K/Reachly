"use client"

import { LEAD_STATUSES, type LeadStatus } from "@reachly/shared"
import { AlertTriangle, CheckCircle2, Circle, CornerDownRight, MessageCircle, Send } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { fmtDate, LEAD_STATUS_LABEL, PageHeader } from "@/components/common"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { call, useApi } from "@/lib/client"
import type { Account, Campaign, Conversation, Template } from "@/lib/types"

const PIPELINE_COLOR: Record<LeadStatus, string> = {
  New: "bg-zinc-400",
  Contacted: "bg-blue-500",
  Replied: "bg-violet-500",
  Converted: "bg-emerald-500",
  NotInterested: "bg-red-400",
}

type Activity = { id: string; kind: "sent" | "followup" | "failed" | "reply"; at: string; who: string; campaign: { id: string; name: string } | null; detail: string | null }

const ACTIVITY = {
  sent: { icon: Send, text: "First message sent to", color: "text-blue-500" },
  followup: { icon: CornerDownRight, text: "Follow-up sent to", color: "text-blue-500" },
  failed: { icon: AlertTriangle, text: "Couldn’t message", color: "text-amber-500" },
  reply: { icon: MessageCircle, text: "Reply from", color: "text-violet-500" },
} as const

/** Circular progress, 0–1. */
function Ring({ value, label }: { value: number; label: string }) {
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 52 52" className="size-14 shrink-0 -rotate-90" role="img" aria-label={label}>
      <circle cx="26" cy="26" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
      <circle cx="26" cy="26" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-emerald-500 transition-[stroke-dashoffset]" strokeDasharray={c} strokeDashoffset={c * (1 - value)} />
      <text x="26" y="26" dominantBaseline="central" textAnchor="middle" className="rotate-90 fill-foreground text-[13px] font-semibold" style={{ transformOrigin: "26px 26px" }}>
        {Math.round(value * 100)}%
      </text>
    </svg>
  )
}

export default function DashboardPage() {
  const accounts = useApi<Account[]>("/accounts")
  const counts = useApi<Record<LeadStatus, number>>("/leads/counts").data
  const templates = useApi<Template[]>("/templates").data
  const campaigns = useApi<Campaign[]>("/campaigns").data
  const unread = useApi<Conversation[]>("/conversations").data?.filter((c) => c.unread).length ?? 0
  const activity = useApi<Activity[]>("/activity").data
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

      {unread > 0 && (
        <Alert className="mb-4 border-violet-500/40">
          <MessageCircle className="text-violet-500" />
          <AlertTitle>
            {unread} unread {unread === 1 ? "reply" : "replies"}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Answer while Instagram&apos;s 24-hour reply window is still open.</span>
            <Button size="sm" asChild>
              <Link href="/inbox">Open Inbox</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {steps.some((s) => !s.done) && (
        <Card className="mb-6">
          <CardHeader className="flex items-center gap-4">
            <Ring value={steps.filter((s) => s.done).length / steps.length} label={`${steps.filter((s) => s.done).length} of ${steps.length} setup steps done`} />
            <div className="grid gap-1.5">
              <CardTitle>Get set up</CardTitle>
              <CardDescription>
                {steps.filter((s) => s.done).length} of {steps.length} done
              </CardDescription>
            </div>
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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity && !activity.length && <p className="text-sm text-muted-foreground">Sends and replies show up here.</p>}
          <ul className="grid gap-3">
            {activity?.map((a) => {
              const k = ACTIVITY[a.kind]
              return (
                <li key={`${a.kind}-${a.id}`} className="flex items-start gap-3 text-sm">
                  <k.icon className={`mt-0.5 size-4 shrink-0 ${k.color}`} />
                  <div className="min-w-0 flex-1">
                    <p>
                      {k.text} <span className="font-medium">{a.who}</span>
                      {a.campaign && (
                        <>
                          {" · "}
                          <Link className="text-muted-foreground hover:underline" href={`/campaigns/${a.campaign.id}`}>
                            {a.campaign.name}
                          </Link>
                        </>
                      )}
                    </p>
                    {a.detail && <p className="truncate text-xs text-muted-foreground">{a.detail}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(a.at)}</span>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>
    </>
  )
}
