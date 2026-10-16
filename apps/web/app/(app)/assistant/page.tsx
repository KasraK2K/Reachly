"use client"

import { Copy, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { PageHeader, StatusBadge } from "@/components/common"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { call, useApi } from "@/lib/client"
import type { Lead, Page } from "@/lib/types"

const FIELDS = [
  { key: "persona", label: "Persona", hint: "Who you are and how you talk. E.g. “Sam, runs a small video studio, friendly and direct.”" },
  { key: "knowledge", label: "Knowledge", hint: "Your offer, prices, results, links. The assistant only uses facts written here." },
  { key: "goal", label: "Goal", hint: "What a good next step is. E.g. “Get them to book a 15-minute call: calendly.com/sam/15”." },
  { key: "objections", label: "Objections", hint: "Common pushback and how you answer it." },
  { key: "handoff", label: "Handoff rules", hint: "When you want to take over yourself. E.g. “custom pricing, complaints”." },
] as const
type Setter = Record<(typeof FIELDS)[number]["key"], string>

function Setup() {
  const { data, setData } = useApi<Setter>("/assistant/settings")
  const [busy, setBusy] = useState(false)
  if (!data) return null

  async function save() {
    setBusy(true)
    try {
      setData(await call<Setter>("/assistant/settings", { method: "PATCH", body: data }))
      toast.success("Saved")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="grid gap-4">
        {FIELDS.map((f) => (
          <div key={f.key} className="grid gap-1.5">
            <Label htmlFor={`ai-${f.key}`}>{f.label}</Label>
            <Textarea id={`ai-${f.key}`} rows={f.key === "knowledge" ? 6 : 3} value={data[f.key]} onChange={(e) => setData({ ...data, [f.key]: e.target.value })} />
            <p className="text-xs text-muted-foreground">{f.hint}</p>
          </div>
        ))}
        <Button className="justify-self-start" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  )
}

function Suggest() {
  const [q, setQ] = useState("")
  const [debounced, setDebounced] = useState("")
  const [lead, setLead] = useState<Lead | null>(null)
  const [conversation, setConversation] = useState("")
  const [result, setResult] = useState<{ suggestions: string[]; handoff: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])
  const matches = useApi<Page<Lead>>(debounced && !lead ? `/leads?${new URLSearchParams({ q: debounced, pageSize: "6" })}` : null).data

  async function suggest() {
    setBusy(true)
    setResult(null)
    try {
      setResult(await call("/assistant/suggest", { body: { conversation, ...(lead && { leadId: lead.id }) } }))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function markReplied() {
    try {
      setLead(await call<Lead>(`/leads/${lead!.id}`, { method: "PATCH", body: { status: "Replied" } }))
      toast.success("Marked Replied. Remaining follow-ups are cancelled.")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ai-lead">Lead (optional)</Label>
            {lead ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">@{lead.handle}</span>
                <StatusBadge status={lead.status} />
                {(lead.status === "New" || lead.status === "Contacted") && (
                  <Button variant="outline" size="sm" onClick={markReplied}>
                    Mark Replied
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setLead(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <Input id="ai-lead" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by handle or name" />
                {!!matches?.items.length && (
                  <div className="grid rounded-md border">
                    {matches.items.map((l) => (
                      <button key={l.id} className="flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => setLead(l)}>
                        <span>
                          @{l.handle} <span className="text-muted-foreground">{l.name}</span>
                        </span>
                        <StatusBadge status={l.status} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <p className="text-xs text-muted-foreground">Picking the lead adds their name, niche and notes to the context.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ai-convo">Conversation</Label>
            <Textarea
              id="ai-convo"
              rows={10}
              value={conversation}
              onChange={(e) => setConversation(e.target.value)}
              placeholder={"Paste the DM thread from Instagram, e.g.\nMe: hey Jane, loved your last reel…\nJane: thanks! what do you do exactly?"}
            />
          </div>
          <Button className="justify-self-start" onClick={suggest} disabled={busy || !conversation.trim()}>
            <Sparkles /> {busy ? "Thinking…" : "Suggest replies"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid content-start gap-3">
        {result?.handoff && (
          <Alert className="border-amber-500/40">
            <AlertTitle>Consider taking over</AlertTitle>
            <AlertDescription>{result.handoff}</AlertDescription>
          </Alert>
        )}
        {result?.suggestions.map((s, i) => (
          <Card key={i} className="py-4">
            <CardContent className="flex items-start justify-between gap-3 px-4">
              <p className="text-sm whitespace-pre-wrap">{s}</p>
              <Button variant="ghost" size="icon-sm" aria-label="Copy reply" onClick={() => navigator.clipboard.writeText(s).then(() => toast.success("Copied"))}>
                <Copy />
              </Button>
            </CardContent>
          </Card>
        ))}
        {!result && <p className="text-sm text-muted-foreground">Suggestions appear here. Nothing is sent: copy one, edit it, and send it from Instagram yourself.</p>}
      </div>
    </div>
  )
}

export default function AssistantPage() {
  return (
    <>
      <PageHeader title="Reply assistant" description="Paste a conversation and get three reply drafts written in your voice, using what you put in Setup." />
      <Tabs defaultValue="suggest">
        <TabsList className="mb-4">
          <TabsTrigger value="suggest">Suggest replies</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
        </TabsList>
        <TabsContent value="suggest">
          <Suggest />
        </TabsContent>
        <TabsContent value="setup">
          <Setup />
        </TabsContent>
      </Tabs>
    </>
  )
}
