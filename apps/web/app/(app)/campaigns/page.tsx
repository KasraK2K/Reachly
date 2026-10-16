"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { EmptyState, PageHeader, StatusBadge } from "@/components/common"
import { NewCampaignDialog } from "@/components/new-campaign-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/lib/client"
import type { Campaign } from "@/lib/types"

export default function CampaignsPage() {
  const { data, loading } = useApi<Campaign[]>("/campaigns")
  const [open, setOpen] = useState(false)

  return (
    <>
      <PageHeader title="Campaigns" description="A campaign sends a first message and optional follow-ups per lead from one Instagram account, paced by your account limits.">
        <Button onClick={() => setOpen(true)}>
          <Plus /> New campaign
        </Button>
      </PageHeader>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : !data?.length ? (
        <EmptyState title="No campaigns yet">
          You need leads, at least one template, and an Instagram account in Settings.
          <div className="mt-4">
            <Button onClick={() => setOpen(true)}>
              <Plus /> New campaign
            </Button>
          </div>
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((c) => {
            const total = Object.values(c.counts).reduce((a, b) => a + b, 0)
            const done = c.counts.Sent + c.counts.Failed + c.counts.Skipped
            return (
              <Link key={c.id} href={`/campaigns/${c.id}`} className="group">
                <Card className="h-full transition-all duration-300 ease-out group-hover:-translate-y-0.5 group-hover:shadow-md">
                  <CardHeader>
                    <CardTitle>{c.name}</CardTitle>
                    <CardDescription>
                      @{c.igAccount.handle} · {c.templates.length} variant{c.templates.length === 1 ? "" : "s"}
                    </CardDescription>
                    <CardAction>
                      <StatusBadge status={c.status} />
                    </CardAction>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Progress value={total ? (done / total) * 100 : 0} />
                    <div className="flex justify-between text-sm text-muted-foreground tabular-nums">
                      <span>
                        {c.counts.Sent.toLocaleString()} sent of {total.toLocaleString()}
                      </span>
                      <span>{c.counts.Queued.toLocaleString()} queued</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      <NewCampaignDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
