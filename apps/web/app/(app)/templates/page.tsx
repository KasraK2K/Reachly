"use client"

import { spintaxVariants } from "@reachly/shared"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { EmptyState, PageHeader } from "@/components/common"
import { TemplateEditorDialog } from "@/components/template-editor-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { call, useApi } from "@/lib/client"
import type { Template } from "@/lib/types"

export default function TemplatesPage() {
  const { data, loading, reload } = useApi<Template[]>("/templates")
  const [editing, setEditing] = useState<Template | null>(null)
  const [open, setOpen] = useState(false)

  const edit = (t: Template | null) => {
    setEditing(t)
    setOpen(true)
  }

  async function remove(t: Template) {
    try {
      await call(`/templates/${t.id}`, { method: "DELETE" })
      toast.success("Template deleted")
      reload()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <PageHeader title="Templates" description="Message variants. A campaign rotates through the templates you pick, one per lead.">
        <Button onClick={() => edit(null)}>
          <Plus /> New template
        </Button>
      </PageHeader>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : !data?.length ? (
        <EmptyState title="No templates yet">
          Write your first opener. Keep it short and specific, the way you would type it yourself.
          <div className="mt-4">
            <Button onClick={() => edit(null)}>
              <Plus /> New template
            </Button>
          </div>
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((t) => (
            <Card key={t.id} className="transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle>{t.name}</CardTitle>
                <CardDescription>
                  {spintaxVariants(t.body).toLocaleString()} variations · {t.sent.toLocaleString()} sent
                </CardDescription>
                <CardAction className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => edit(t)} aria-label="Edit">
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(t)} aria-label="Delete">
                    <Trash2 />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-4 font-mono text-[13px] whitespace-pre-wrap text-muted-foreground">{t.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateEditorDialog template={editing} open={open} onOpenChange={setOpen} onSaved={reload} />
    </>
  )
}
