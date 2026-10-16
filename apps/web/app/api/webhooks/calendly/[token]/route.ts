import { API_URL } from "@/lib/service"

/** Public: Calendly posts here (the API itself isn't exposed). The secret token in the path is checked by the API. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const res = await fetch(`${API_URL}/webhooks/calendly/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await req.text(),
    cache: "no-store",
  }).catch(() => null)
  return new Response(res ? await res.text() : '{"ok":false}', { status: res?.status ?? 502, headers: { "content-type": "application/json" } })
}
