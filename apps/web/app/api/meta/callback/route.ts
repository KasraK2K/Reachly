import { NextRequest, NextResponse } from "next/server"
import { API_URL, apiToken } from "@/lib/server-api"

/** Instagram redirects here after the user approves (or cancels) Instagram Login. */
export async function GET(req: NextRequest) {
  const back = (q: Record<string, string>) => NextResponse.redirect(new URL(`/settings?${new URLSearchParams(q)}`, req.url))
  const p = req.nextUrl.searchParams
  if (p.get("error")) return back({ meta_error: p.get("error_description") || "Instagram login was cancelled." })
  const token = await apiToken()
  if (!token) return NextResponse.redirect(new URL("/login", req.url))

  const res = await fetch(`${API_URL}/meta/callback`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ code: p.get("code") ?? "", state: p.get("state") ?? "" }),
    cache: "no-store",
  }).catch(() => null)
  const data = await res?.json().catch(() => null)
  if (!res?.ok) return back({ meta_error: [data?.message].flat().join(" ") || "Could not connect Instagram." })
  return back({ meta: "connected" })
}
