import { SignJWT } from "jose"
import { auth } from "@/auth"

export { API_URL } from "@/lib/service"
const secret = new TextEncoder().encode(process.env.INTERNAL_JWT_SECRET)

/** Short-lived token the API trusts as "this signed-in user". Never sent to the browser. */
export async function apiToken(): Promise<string | null> {
  const session = await auth()
  const user = session?.user
  if (!user?.email) return null
  return new SignJWT({ email: user.email, name: user.name, picture: user.image })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("reachly-web")
    .setAudience("reachly-api")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret)
}
