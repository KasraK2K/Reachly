"use client"

import { Download } from "lucide-react"
import Link from "next/link"
import { EmptyState, PageHeader, StatusBadge } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useApi } from "@/lib/client"

interface Rates {
  id: string
  name: string
  messaged: number
  replied: number
  converted: number
}
interface Analytics {
  campaigns: (Rates & { status: string; messagesSent: number })[]
  variants: Rates[]
  daily: { day: string; sent: number }[]
}

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—")

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <p className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function RatesTable({ rows, first, extra }: { rows: Rates[]; first: string; extra?: (r: Rates) => React.ReactNode }) {
  const best = Math.max(...rows.filter((r) => r.messaged >= 20).map((r) => r.replied / r.messaged))
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{first}</TableHead>
            <TableHead className="text-right">Leads messaged</TableHead>
            <TableHead className="text-right">Replied</TableHead>
            <TableHead className="text-right">Reply rate</TableHead>
            <TableHead className="text-right">Converted</TableHead>
            <TableHead className="text-right">Conversion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <span className="font-medium">{r.name}</span> {extra?.(r)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.messaged.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{r.replied.toLocaleString()}</TableCell>
              <TableCell className={`text-right tabular-nums ${r.messaged >= 20 && r.replied / r.messaged === best ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}`}>
                {pct(r.replied, r.messaged)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.converted.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{pct(r.converted, r.messaged)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default function AnalyticsPage() {
  const { data } = useApi<Analytics>("/analytics")

  if (!data) return <Skeleton className="h-96" />
  const sum = (k: "messaged" | "replied" | "converted") => data.campaigns.reduce((a, c) => a + c[k], 0)
  const [messaged, replied, converted] = [sum("messaged"), sum("replied"), sum("converted")]

  // Last 14 days, including days with nothing sent.
  const byDay = new Map(data.daily.map((d) => [d.day, d.sent]))
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 13 + i)
    const key = d.toISOString().slice(0, 10)
    return { key, sent: byDay.get(key) ?? 0 }
  })
  const peak = Math.max(1, ...days.map((d) => d.sent))

  return (
    <>
      <PageHeader title="Analytics" description="Replies and conversions come from lead statuses. Mark leads Replied or Converted in Leads to keep these numbers right.">
        <Button variant="outline" asChild>
          <a href="/api/leads/export" download>
            <Download /> Export leads CSV
          </a>
        </Button>
      </PageHeader>

      {!messaged ? (
        <EmptyState title="Nothing sent yet">
          Numbers show up here once a <Link href="/campaigns" className="text-primary underline">campaign</Link> has sent messages.
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Leads messaged" value={messaged.toLocaleString()} />
            <Tile label="Replied" value={replied.toLocaleString()} sub={`${pct(replied, messaged)} reply rate`} />
            <Tile label="Converted" value={converted.toLocaleString()} sub={`${pct(converted, messaged)} of messaged`} />
            <Tile label="Reply → converted" value={pct(converted, replied)} />
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Messages sent</CardTitle>
              <CardDescription>Last 14 days (UTC)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-32 items-end gap-1" role="img" aria-label="Messages sent per day over the last 14 days">
                {days.map((d) => (
                  <div key={d.key} className="group relative flex h-full flex-1 flex-col justify-end">
                    <div className="rounded-t-sm bg-primary/80 transition-colors group-hover:bg-primary" style={{ height: `${(d.sent / peak) * 100}%`, minHeight: d.sent ? 2 : 0 }} />
                    <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-popover px-1.5 py-0.5 text-xs whitespace-nowrap shadow group-hover:block">
                      {d.sent} · {d.key.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{days[0].key.slice(5)}</span>
                <span>{days[13].key.slice(5)}</span>
              </div>
            </CardContent>
          </Card>

          <h2 className="mb-2 font-semibold">Campaigns</h2>
          <div className="mb-6">
            <RatesTable rows={data.campaigns} first="Campaign" extra={(r) => <StatusBadge status={data.campaigns.find((c) => c.id === r.id)!.status} className="ml-1" />} />
          </div>

          <h2 className="mb-1 font-semibold">First-message variants</h2>
          <p className="mb-2 text-sm text-muted-foreground">Compare templates used as the opening message. The best reply rate is highlighted once a variant has reached 20 leads.</p>
          <RatesTable rows={data.variants} first="Template" />
        </>
      )}
    </>
  )
}
