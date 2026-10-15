"use client"

import Papa from "papaparse"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { call } from "@/lib/client"

const FIELDS = [
  { key: "handle", label: "Instagram handle", required: true, guess: /^(handle|username|instagram|ig|user|profile|url|link)/i },
  { key: "name", label: "Name", guess: /^(name|full ?name|first ?name)/i },
  { key: "niche", label: "Niche", guess: /^niche/i },
  { key: "industry", label: "Industry", guess: /^(industry|category)/i },
  { key: "followers", label: "Followers", guess: /^followers/i },
  { key: "tags", label: "Tags", guess: /^tags?$/i },
  { key: "notes", label: "Notes", guess: /^(notes?|comment)/i },
  { key: "timezone", label: "Timezone (IANA)", guess: /^(timezone|tz|time ?zone)$/i },
] as const
type Field = (typeof FIELDS)[number]["key"]
const NONE = "__none"

type Result = { created: number; updated: number; skipped: { row: number; reason: string }[] }

export function ImportLeadsDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Partial<Record<Field, string>>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result>()

  function reset() {
    setRows([])
    setHeaders([])
    setMapping({})
    setResult(undefined)
  }

  function onFile(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: ({ data, meta, errors }) => {
        if (!meta.fields?.length) return toast.error(errors[0]?.message ?? "Could not read this CSV")
        if (data.length > 10000) return toast.error("Up to 10,000 rows per import. Split the file and import in parts.")
        setRows(data)
        setHeaders(meta.fields)
        const m: Partial<Record<Field, string>> = {}
        for (const f of FIELDS) {
          const h = meta.fields.find((h) => f.guess.test(h.trim()))
          if (h) m[f.key] = h
        }
        setMapping(m)
      },
    })
  }

  async function submit() {
    setBusy(true)
    try {
      const mapped = rows.map((r) => Object.fromEntries(Object.entries(mapping).map(([f, h]) => [f, r[h!]?.trim() ?? ""])))
      const res = await call<Result>("/leads/import", { body: { rows: mapped } })
      setResult(res)
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const preview = rows.slice(0, 3)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import leads from CSV</DialogTitle>
          <DialogDescription>Needs a header row and an Instagram handle (or profile URL) column. Existing handles are updated, not duplicated.</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <p>
              <b>{result.created}</b> created · <b>{result.updated}</b> updated · <b>{result.skipped.length}</b> skipped
            </p>
            {result.skipped.length > 0 && (
              <ul className="max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs">
                {result.skipped.slice(0, 100).map((s) => (
                  <li key={s.row}>
                    Row {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : !rows.length ? (
          <div className="grid gap-2">
            <Label htmlFor="csv">CSV file</Label>
            <Input id="csv" type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            <p className="text-xs text-muted-foreground">Example header: handle,name,niche,industry,followers,tags,notes</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm">
              {rows.length.toLocaleString()} rows found. Match your columns:
            </p>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-normal">
                    {f.label}
                    {"required" in f && <span className="text-destructive">*</span>}
                  </Label>
                  <Select value={mapping[f.key] ?? NONE} onValueChange={(v) => setMapping({ ...mapping, [f.key]: v === NONE ? undefined : v })}>
                    <SelectTrigger size="sm" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— skip —</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {mapping.handle && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <p className="mb-1 font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">Preview</p>
                {preview.map((r, i) => (
                  <p key={i} className="truncate">
                    @{r[mapping.handle!]} {mapping.name && `· ${r[mapping.name]}`} {mapping.niche && `· ${r[mapping.niche]}`}
                  </p>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>
                Choose another file
              </Button>
              <Button onClick={submit} disabled={!mapping.handle || busy}>
                {busy ? "Importing…" : `Import ${rows.length.toLocaleString()} leads`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
