"use client"

import { LEAD_STATUSES, type LeadStatus } from "@reachly/shared"
import { Download, Plus, Search, Trash2, Upload } from "lucide-react"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { EmptyState, fmtDate, LEAD_STATUS_LABEL, PageHeader, StatusBadge } from "@/components/common"
import { AddLeadDialog } from "@/components/add-lead-dialog"
import { ImportLeadsDialog } from "@/components/import-leads-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { call, useApi } from "@/lib/client"
import type { Lead, Page } from "@/lib/types"

const PAGE_SIZE = 50

export default function LeadsPage() {
  return (
    <Suspense>
      <Leads />
    </Suspense>
  )
}

function Leads() {
  const search = useSearchParams()
  const initialStatus = search.get("status")
  const [q, setQ] = useState(search.get("q") ?? "")
  const [debouncedQ, setDebouncedQ] = useState("")
  const [status, setStatus] = useState(initialStatus ?? "all")
  const [tag, setTag] = useState("all")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importOpen, setImportOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250)
    return () => clearTimeout(t)
  }, [q])
  useEffect(() => setPage(1), [debouncedQ, status, tag])

  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
  if (debouncedQ) params.set("q", debouncedQ)
  if (status !== "all") params.set("status", status)
  if (tag !== "all") params.set("tag", tag)
  const { data, loading, reload, setData } = useApi<Page<Lead>>(`/leads?${params}`)
  const tags = useApi<string[]>("/leads/tags")

  const refresh = () => {
    reload()
    tags.reload()
    setSelected(new Set())
  }

  async function changeStatus(lead: Lead, s: LeadStatus) {
    try {
      await call(`/leads/${lead.id}`, { method: "PATCH", body: { status: s } })
      setData((d) => d && { ...d, items: d.items.map((l) => (l.id === lead.id ? { ...l, status: s } : l)) })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function deleteSelected() {
    try {
      await call("/leads/delete", { body: { ids: [...selected] } })
      toast.success(`Deleted ${selected.size} leads`)
      refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const items = data?.items ?? []
  const allChecked = items.length > 0 && items.every((l) => selected.has(l.id))
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <>
      <PageHeader title={`Leads${data ? ` (${data.total.toLocaleString()})` : ""}`} description="Your prospect list. Bring it from a spreadsheet or add people one by one.">
        <Button variant="outline" asChild>
          <a href="/api/leads/export" download>
            <Download /> Export CSV
          </a>
        </Button>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Upload /> Import CSV
        </Button>
        <Button onClick={() => setAddOpen(true)}>
          <Plus /> Add lead
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search handle, name, niche or notes" className="pl-8" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {LEAD_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tag} onValueChange={setTag}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            {tags.data?.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <Button variant="destructive" onClick={deleteSelected}>
            <Trash2 /> Delete {selected.size}
          </Button>
        )}
      </div>

      {!loading && data?.total === 0 && !debouncedQ && status === "all" && tag === "all" ? (
        <EmptyState title="No leads yet">
          Import a CSV with at least an Instagram handle column, or add a lead manually.
          <div className="mt-4">
            <Button onClick={() => setImportOpen(true)}>
              <Upload /> Import CSV
            </Button>
          </div>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={(v) => setSelected(v ? new Set(items.map((l) => l.id)) : new Set())}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Niche / industry</TableHead>
                <TableHead className="text-right">Followers</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !data
                ? Array.from({ length: 6 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-6" />
                      </TableCell>
                    </TableRow>
                  ))
                : items.map((l) => (
                    <TableRow key={l.id} data-state={selected.has(l.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(l.id)}
                          onCheckedChange={(v) => {
                            const next = new Set(selected)
                            if (v) next.add(l.id)
                            else next.delete(l.id)
                            setSelected(next)
                          }}
                          aria-label={`Select ${l.handle}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{l.name ?? "—"}</div>
                        <a href={`https://www.instagram.com/${l.handle}/`} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:underline">
                          @{l.handle}
                        </a>
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-sm">{[l.niche, l.industry].filter(Boolean).join(" · ") || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.followers?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell>
                        <Select value={l.status} onValueChange={(v) => changeStatus(l, v as LeadStatus)}>
                          <SelectTrigger size="sm" className="h-auto border-0 bg-transparent p-0 shadow-none">
                            <StatusBadge status={l.status} />
                          </SelectTrigger>
                          <SelectContent>
                            {LEAD_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {LEAD_STATUS_LABEL[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-56 flex-wrap gap-1">
                          {l.tags.map((t) => (
                            <Badge key={t} variant="outline" className="font-normal">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">{fmtDate(l.createdAt)}</TableCell>
                    </TableRow>
                  ))}
              {data && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No leads match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

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

      <ImportLeadsDialog open={importOpen} onOpenChange={setImportOpen} onDone={refresh} />
      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} onDone={refresh} />
    </>
  )
}
