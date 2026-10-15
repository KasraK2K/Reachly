import { SignJWT } from "jose"

export const API_URL = process.env.API_URL ?? "http://localhost:4000"
const secret = new TextEncoder().encode(process.env.INTERNAL_JWT_SECRET)

/**
 * Server-only call to the API as the web app itself (not as a user): sign-in checks and first-run setup.
 * Returns the HTTP status with the parsed body so callers can branch on 401/409/429.
 */
export async function serviceCall<T>(path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const token = await new SignJWT({ svc: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("reachly-web")
    .setAudience("reachly-api")
    .setIssuedAt()
    .setExpirationTime("1m")
    .sign(secret)
  const res = await fetch(`${API_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, ...(body !== undefined && { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

export async function setupNeeded(): Promise<boolean> {
  const { data } = await serviceCall<{ needed: boolean }>("/auth/setup")
  return !!data?.needed
}
