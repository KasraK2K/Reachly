"use client"

import { useCallback, useEffect, useState } from "react"
import { call } from "@/lib/client"

/** Talks to the Reachly extension through its content script on this page (window.postMessage). */
export function useExtension() {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.data?.source !== "reachly-ext") return
      if (e.data.type === "hello") setVersion(e.data.version)
    }
    window.addEventListener("message", onMessage)
    window.postMessage({ source: "reachly-web", type: "ping" }, location.origin)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  const pair = useCallback(async () => {
    const { token } = await call<{ token: string }>("/extension/tokens", { method: "POST" })
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => done(false), 5000)
      const onMessage = (e: MessageEvent) => {
        if (e.source === window && e.data?.source === "reachly-ext" && e.data.type === "paired") done(!!e.data.ok)
      }
      const done = (ok: boolean) => {
        clearTimeout(timer)
        window.removeEventListener("message", onMessage)
        resolve(ok)
      }
      window.addEventListener("message", onMessage)
      window.postMessage({ source: "reachly-web", type: "pair", token }, location.origin)
    })
  }, [])

  return { installed: !!version, version, pair }
}
