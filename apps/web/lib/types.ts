import type { CampaignStatus, JobState, LeadStatus } from "@reachly/shared"

export interface Lead {
  id: string
  handle: string
  name: string | null
  niche: string | null
  industry: string | null
  followers: number | null
  notes: string | null
  timezone: string | null
  status: LeadStatus
  tags: string[]
  createdAt: string
}

export interface Template {
  id: string
  name: string
  body: string
  sent: number
  updatedAt: string
}

export interface Account {
  id: string
  handle: string
  igUserId: string | null
  timezone: string
  dailyLimit: number
  minDelaySec: number
  maxDelaySec: number
  quietStart: string
  quietEnd: string
  pauseOnErrors: boolean
  pausedReason: string | null
  lastHeartbeatAt: string | null
  extensionVersion: string | null
  sent24h: number
  queued: number
  online: boolean
}

export interface Campaign {
  id: string
  name: string
  status: CampaignStatus
  createdAt: string
  igAccount: { id?: string; handle: string }
  templates: { id: string; name: string; body?: string }[]
  steps?: { position: number; delayDays: number; template: { id: string; name: string } }[]
  counts: Record<JobState, number>
}

export interface Job {
  id: string
  renderedText: string
  state: JobState
  error: string | null
  sentAt: string | null
  step: number
  dueAt: string | null
  attempts: number
  lead: { id: string; handle: string; name: string | null; status: LeadStatus }
  template: { name: string }
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface Me {
  id: string
  email: string
  name: string | null
  role: "Admin" | "Member"
  hasPassword: boolean
}

export interface User extends Me {
  createdAt: string
}
