"use client"

import { signOut } from "next-auth/react"
import { useCallback, useEffect, useState } from "react"

export async function call<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const data = await res.json().catch(() => null)
  // Clears the session cookie too: a removed user would otherwise bounce between /login and the app forever.
  if (res.status === 401) await signOut({ redirectTo: "/login" })
  if (!res.ok) throw new Error([data?.message].flat().filter(Boolean).join("\n") || res.statusText)
  return data as T
}

/** Fetches `path` on mount and whenever it changes; `reload()` refetches. Pass null to skip. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(!!path)

  const reload = useCallback(async () => {
    if (!path) return
    setLoading(true)
    try {
      setData(await call<T>(path))
      setError(undefined)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, error, loading, reload, setData }
}
