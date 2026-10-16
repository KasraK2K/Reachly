"use client"

import { ArrowLeft, Send } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { EmptyState, fmtDate, PageHeader, StatusBadge } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { call, useApi } from "@/lib/client"
import type { Account, Conversation, Message, Thread } from "@/lib/types"
import { cn } from "@/lib/utils"

// ponytail: polling, not push. Fine for a handful of threads; add server-sent events if the inbox gets busy.
const POLL_MS = 15_000

function usePoll(reload: () => void) {
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && reload(), POLL_MS)
    return () => clearInterval(t)
  }, [reload])
}

const who = (c: { handle: string | null; name: string | null }) => (c.handle ? `@${c.handle}` : c.name || "Instagram user")

function hoursLeft(windowEndsAt: string | null) {
  const ms = windowEndsAt ? new Date(windowEndsAt).getTime() - Date.now() : 0
  return ms > 0 ? Math.ceil(ms / 3600_000) : 0
}

function ThreadView({ id, onBack, onChange }: { id: string; onBack: () => void; onChange: () => void }) {
  const { data, setData, reload } = useApi<Thread>(`/conversations/${id}`)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  usePoll(reload)
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" })
  }, [data?.messages.length])
  useEffect(() => {
    if (data) onChange()
  }, [data?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- refresh unread dots once the thread is opened

  if (!data) return null
  const left = hoursLeft(data.windowEndsAt)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!data) return
    setBusy(true)
    try {
      const msg = await call<Message>(`/conversations/${id}/reply`, { body: { text } })
      setData({ ...data, messages: [...data.messages, msg] })
      setText("")
      onChange()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{who(data)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {data.name && data.handle ? `${data.name} · ` : ""}to @{data.account.handle}
          </p>
        </div>
        {data.lead ? (
          <Link href={`/leads?q=${encodeURIComponent(data.handle ?? "")}`} title="Open in Leads">
            <StatusBadge status={data.lead.status} />
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">Not a lead</span>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {data.messages.map((m) => (
          <div key={m.id} className={cn("flex", m.fromMe && "justify-end")}>
            <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", m.fromMe ? "bg-primary text-primary-foreground" : "bg-muted")}>
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              <p className={cn("mt-1 text-[11px]", m.fromMe ? "text-primary-foreground/70" : "text-muted-foreground")}>{fmtDate(m.sentAt)}</p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="border-t p-3">
        {!data.account.connected ? (
          <p className="text-sm text-muted-foreground">
            @{data.account.handle} is no longer connected to the Instagram API. <Link className="underline" href="/settings">Reconnect it in Settings</Link> to reply here.
          </p>
        ) : left ? (
          <>
            <div className="flex items-end gap-2">
              <Textarea
                rows={2}
                value={text}
                placeholder="Write a reply…"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    e.currentTarget.form?.requestSubmit()
                  }
                }}
              />
              <Button type="submit" disabled={busy || !text.trim()} aria-label="Send reply">
                <Send />
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Enter to send, Shift+Enter for a new line. You can reply here for {left} more hour{left === 1 ? "" : "s"}.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Instagram only allows replies within 24 hours of their last message. Reply from the Instagram app, or wait for them to write again.</p>
        )}
      </form>
    </div>
  )
}

export default function InboxPage() {
  const { data: accounts } = useApi<Account[]>("/accounts")
  const { data: convos, reload } = useApi<Conversation[]>("/conversations")
  const [open, setOpen] = useState<string | null>(null)
  usePoll(reload)

  const connected = accounts?.some((a) => a.connection)
  const multi = new Set(convos?.map((c) => c.igAccount.handle)).size > 1

  return (
    <>
      <PageHeader title="Inbox" description="Replies to your connected Instagram accounts. A reply marks the lead Replied and stops its follow-ups." />
      {accounts && !connected && !convos?.length ? (
        <EmptyState title="No account connected to the Instagram API">
          Connect an account in <Link className="underline" href="/settings">Settings</Link> to receive replies here.
        </EmptyState>
      ) : convos && !convos.length ? (
        <EmptyState title="No messages yet">Conversations appear here when someone writes to a connected account.</EmptyState>
      ) : (
        <div className="flex h-[calc(100dvh-11rem)] min-h-96 overflow-hidden rounded-xl border">
          <ul className={cn("w-full shrink-0 overflow-y-auto border-r md:w-80", open && "hidden md:block")}>
            {convos?.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setOpen(c.id)}
                  className={cn("flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left hover:bg-muted/60", open === c.id && "bg-muted")}
                >
                  <span className="flex items-center gap-2">
                    {c.unread && <span className="size-2 shrink-0 rounded-full bg-blue-500" aria-label="Unread" />}
                    <span className={cn("truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>{who(c)}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{fmtDate(c.lastMessageAt)}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {c.last ? `${c.last.fromMe ? "You: " : ""}${c.last.text}` : ""}
                  </span>
                  {multi && <span className="text-[11px] text-muted-foreground">to @{c.igAccount.handle}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className={cn("min-w-0 flex-1 flex-col", open ? "flex" : "hidden md:flex")}>
            {open ? (
              <ThreadView key={open} id={open} onBack={() => setOpen(null)} onChange={reload} />
            ) : (
              <p className="m-auto text-sm text-muted-foreground">Pick a conversation</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
