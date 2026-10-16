import { API_URL } from "@/lib/service"

/** Public: Meta's webhook verification (GET) and message events (POST). The API checks the signature over these exact bytes. */
export async function GET(req: Request) {
  const res = await fetch(`${API_URL}/webhooks/instagram${new URL(req.url).search}`, { cache: "no-store" }).catch(() => null)
  return new Response(res ? await res.text() : "", { status: res?.status ?? 502, headers: { "content-type": "text/plain" } })
}

export async function POST(req: Request) {
  const res = await fetch(`${API_URL}/webhooks/instagram`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": req.headers.get("x-hub-signature-256") ?? "" },
    body: await req.text(),
    cache: "no-store",
  }).catch(() => null)
  return new Response(res ? await res.text() : '{"ok":false}', { status: res?.status ?? 502, headers: { "content-type": "application/json" } })
}
