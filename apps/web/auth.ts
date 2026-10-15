import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { serviceCall } from "@/lib/service"

/** Google sign-in shows up only when its OAuth keys are configured. */
export const googleEnabled = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET

class LockedOut extends CredentialsSignin {
  code = "locked"
}

type ApiUser = { id: string; email: string; name: string | null }

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: "password",
      name: "Email and password",
      credentials: { email: {}, password: {} },
      authorize: async (c) => {
        const { status, data } = await serviceCall<ApiUser>("/auth/verify", { email: c.email, password: c.password })
        if (status === 429) throw new LockedOut()
        return status === 201 || status === 200 ? { id: data.id, email: data.email, name: data.name } : null
      },
    }),
    ...(googleEnabled ? [Google] : []),
  ],
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 24 * 60 * 60 },
  callbacks: {
    authorized: ({ auth }) => !!auth?.user,
    // No self sign-up: a Google account may sign in only if an admin added its email.
    signIn: async ({ account, user }) => {
      if (account?.provider !== "google") return true
      const { data } = await serviceCall<{ allowed: boolean }>("/auth/allowed", { email: user.email })
      return !!data?.allowed
    },
  },
})
