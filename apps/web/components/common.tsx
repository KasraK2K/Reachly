import type { JobState, LeadStatus } from "@reachly/shared"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  New: "New",
  Contacted: "Contacted",
  Replied: "Replied",
  Converted: "Converted",
  NotInterested: "Not interested",
}

const tone = {
  neutral: "bg-muted text-muted-foreground",
  blue: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
  green: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  red: "bg-red-500/12 text-red-700 dark:text-red-300",
  violet: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
}

const STATUS_TONE: Record<string, keyof typeof tone> = {
  New: "neutral",
  Contacted: "blue",
  Replied: "violet",
  Converted: "green",
  NotInterested: "red",
  Draft: "neutral",
  Active: "green",
  Paused: "amber",
  Completed: "blue",
  Queued: "neutral",
  Claimed: "amber",
  Sent: "green",
  Failed: "red",
  Skipped: "neutral",
}

export function StatusBadge({ status, className }: { status: LeadStatus | JobState | string; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("border-0 font-medium", tone[STATUS_TONE[status] ?? "neutral"], className)}>
      {LEAD_STATUS_LABEL[status as LeadStatus] ?? status}
    </Badge>
  )
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </div>
  )
}

export const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"
