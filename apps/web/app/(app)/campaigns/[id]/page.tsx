"use client"

import { JOB_STATES } from "@reachly/shared"
import { ArrowLeft, Pause, Pencil, Play, Trash2 } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { fmtDate, PageHeader, StatusBadge } from "@/components/common"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { call, useApi } from "@/lib/client"
import type { Campaign, Job } from "@/lib/types"

type Detail = Campaign & { jobs: Job[]; total: number; page: number; pageSize: number }

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [state, setState] = useState("all")
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Job | null>(null)
  const [text, setText] = useState("")
  const qs = new URLSearchParams({ page: String(page), ...(state !== "all" && { state }) })
  const { data: c, reload } = useApi<Detail>(`/campaigns/${id}?${qs}`)

  async function act(action: "activate" | "pause") {
    try {
      await call(`/campaigns/${id}/${action}`, { method: "POST" })
      toast.success(action === "activate" ? "Campaign is live. Make sure the extension is running." : "Campaign paused")
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function remove() {
    try {
      await call(`/campaigns/${id}`, { method: "DELETE" })
      router.push("/campaigns")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function saveJob() {
    try {
      await call(`/campaigns/${id}/jobs/${editing!.id}`, { method: "PATCH", body: { renderedText: text } })
      setEditing(null)
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (!c) return <Skeleton className="h-96" />
  const total = Object.values(c.counts).reduce((a, b) => a + b, 0)
  const pages = Math.max(1, Math.ceil(c.total / c.pageSize))

  return (
    <>
      <Link href="/campaigns" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Campaigns
      </Link>
      <PageHeader title={c.name} description={`From @${c.igAccount.handle} · variants: ${c.templates.map((t) => t.name).join(", ")}`}>
        <StatusBadge status={c.status} className="self-center" />
        {(c.status === "Draft" || c.status === "Paused") && (
          <Button onClick={() => act("activate")}>
            <Play /> {c.status === "Draft" ? "Start sending" : "Resume"}
          </Button>
        )}
        {c.status === "Active" && (
          <Button variant="outline" onClick={() => act("pause")}>
            <Pause /> Pause
          </Button>
        )}
        {c.status !== "Active" && (
          <Button variant="ghost" size="icon" onClick={remove} aria-label="Delete campaign">
            <Trash2 />
          </Button>
        )}
      </PageHeader>

      {c.status === "Draft" && (
        <Alert className="mb-6">
          <AlertTitle>Review before sending</AlertTitle>
          <AlertDescription>
            Every message below is already written. Edit any of them, then press Start sending. Messages go out through the Chrome extension at the pace set for @{c.igAccount.handle} in Settings.
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(["Queued", "Sent", "Skipped", "Failed"] as const).map((s) => (
          <Card key={s} className="py-4">
            <CardContent className="px-4">
              <p className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">{s}</p>
              <p className="text-2xl font-semibold tabular-nums">{c.counts[s].toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
        <Card className="py-4">
          <CardContent className="px-4">
            <p className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">Total</p>
            <p className="text-2xl font-semibold tabular-nums">{total.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={state}
        onValueChange={(v) => {
          setState(v)
          setPage(1)
        }}
        className="mb-3"
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          {JOB_STATES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {s}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {c.jobs.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="align-top">
                  <div className="font-medium">{j.lead.name ?? "—"}</div>
                  <div className="text-sm text-muted-foreground">@{j.lead.handle}</div>
                </TableCell>
                <TableCell className="max-w-md align-top">
                  <p className="text-sm whitespace-pre-wrap">{j.renderedText}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{j.template.name}</p>
                </TableCell>
                <TableCell className="align-top">
                  <StatusBadge status={j.state} />
                  {j.error && <p className="mt-1 max-w-40 text-xs text-destructive">{j.error}</p>}
                </TableCell>
                <TableCell className="align-top text-sm whitespace-nowrap text-muted-foreground">{fmtDate(j.sentAt)}</TableCell>
                <TableCell className="align-top">
                  {j.state === "Queued" && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit message"
                      onClick={() => {
                        setEditing(j)
                        setText(j.renderedText)
                      }}
                    >
                      <Pencil />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!c.jobs.length && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nothing here.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Message to @{editing?.lead.handle}</DialogTitle>
          </DialogHeader>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} />
          <DialogFooter>
            <Button onClick={saveJob} disabled={!text.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
