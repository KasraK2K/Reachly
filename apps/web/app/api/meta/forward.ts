import { API_URL } from "@/lib/service"

/** Meta posts `signed_request` as a form; the API takes JSON and verifies the signature. */
export async function forwardSignedRequest(req: Request, path: string) {
  const form = await req.formData().catch(() => null)
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signed_request: form?.get("signed_request") ?? "" }),
    cache: "no-store",
  }).catch(() => null)
  return new Response(res ? await res.text() : '{"ok":false}', { status: res?.status ?? 502, headers: { "content-type": "application/json" } })
}
