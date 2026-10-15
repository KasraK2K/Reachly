"use client"

import { MERGE_FIELDS, renderTemplate, spintaxVariants, templateErrors } from "@reachly/shared"
import { Shuffle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { call, useApi } from "@/lib/client"
import type { Lead, Page, Template } from "@/lib/types"

const SAMPLE = { name: "Anna Kowalska", handle: "anna.studio", niche: "wedding photography", industry: "photographer" }

export function TemplateEditorDialog({
  template,
  open,
  onOpenChange,
  onSaved,
}: {
  template: Template | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState("")
  const [body, setBody] = useState("")
  const [seed, setSeed] = useState(0)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const sample = useApi<Page<Lead>>(open ? "/leads?pageSize=1" : null).data?.items[0] ?? SAMPLE

  useEffect(() => {
    if (open) {
      setName(template?.name ?? "")
      setBody(template?.body ?? "")
    }
  }, [open, template])

  function insert(text: string) {
    const el = ref.current
    if (!el) return setBody(body + text)
    const { selectionStart: s, selectionEnd: e } = el
    setBody(body.slice(0, s) + text + body.slice(e))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + text.length, s + text.length)
    })
  }

  const errors = body ? templateErrors(body) : []
  const preview = errors.length ? "" : renderTemplate(body, sample, seededRandom(seed))

  async function save() {
    setBusy(true)
    try {
      await call(template ? `/templates/${template.id}` : "/templates", { method: template ? "PATCH" : "POST", body: { name, body } })
      toast.success("Template saved")
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>
            Use merge fields for personal details and spintax like <code className="font-mono">{"{hey|hi}"}</code> so no two messages read exactly alike.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          <div className="grid content-start gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-name">Name</Label>
              <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Opener — photographers" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-body">Message</Label>
              <Textarea
                id="tpl-body"
                ref={ref}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                className="font-mono text-sm"
                placeholder={"{hey|hi} {{first_name|there}}, {saw|loved} your {{niche|work}}. quick question, are you taking new clients this season?"}
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {MERGE_FIELDS.map((f) => (
                  <Button key={f} type="button" variant="outline" size="xs" className="font-mono" onClick={() => insert(`{{${f}}}`)}>
                    {`{{${f}}}`}
                  </Button>
                ))}
                <Button type="button" variant="outline" size="xs" className="font-mono" onClick={() => insert("{option a|option b}")}>
                  {"{a|b}"}
                </Button>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{body && !errors.length ? `${spintaxVariants(body).toLocaleString()} wording variations` : "Fallback: {{first_name|there}}"}</span>
                <span>{body.length}/1000</span>
              </div>
              {errors.map((e) => (
                <p key={e} className="text-sm text-destructive">
                  {e}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-muted/40 p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase">Preview · @{sample.handle}</span>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => setSeed(seed + 1)} aria-label="Show another variation">
                <Shuffle />
              </Button>
            </div>
            {preview ? (
              <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">{preview}</div>
            ) : (
              <p className="text-sm text-muted-foreground">Your message will appear here.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={busy || !name.trim() || !body.trim() || errors.length > 0}>
            {busy ? "Saving…" : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Deterministic random so the preview only changes when the user asks for another variation. */
function seededRandom(seed: number) {
  let s = seed * 9301 + 49297
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}
