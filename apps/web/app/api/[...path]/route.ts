import { NextRequest, NextResponse } from "next/server"
import { API_URL, apiToken } from "@/lib/server-api"

/** BFF: forwards /api/* to the Nest API with the user's identity. The browser never talks to the API directly. */
async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (req.method !== "GET" && req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ message: "Bad origin" }, { status: 403 })
  }
  const token = await apiToken()
  if (!token) return NextResponse.json({ message: "Not signed in" }, { status: 401 })

  const { path } = await params
  const body = req.method === "GET" ? undefined : await req.text()
  const res = await fetch(`${API_URL}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`, {
    method: req.method,
    headers: { authorization: `Bearer ${token}`, ...(body && { "content-type": "application/json" }) },
    body: body || undefined,
    cache: "no-store",
  }).catch(() => null)
  if (!res) return NextResponse.json({ message: "API is unreachable" }, { status: 502 })
  return new Response(res.body, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } })
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE }
