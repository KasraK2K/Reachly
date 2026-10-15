import { CredentialsSignin } from "next-auth"
import { redirect } from "next/navigation"
import { auth, googleEnabled, signIn } from "@/auth"
import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setupNeeded } from "@/lib/service"

export const metadata = { title: "Sign in" }

const ERRORS: Record<string, string> = {
  invalid: "Wrong email or password.",
  locked: "Too many attempts. Try again in 15 minutes.",
  AccessDenied: "This Google account hasn't been added to Reachly. Ask your admin to add your email.",
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if ((await auth())?.user) redirect("/dashboard")
  if (await setupNeeded()) redirect("/setup")
  const { error } = await searchParams

  return (
    <AuthShell title="Sign in to Reachly" description="Use the email and password your admin gave you.">
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERRORS[error] ?? "Sign-in failed. Try again."}
        </p>
      )}

      <form
        className="grid gap-4"
        action={async (fd) => {
          "use server"
          try {
            await signIn("password", { email: fd.get("email"), password: fd.get("password"), redirectTo: "/dashboard" })
          } catch (e) {
            if (e instanceof CredentialsSignin) redirect(`/login?error=${e.code === "locked" ? "locked" : "invalid"}`)
            throw e
          }
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Button type="submit" size="lg" className="w-full">
          Sign in
        </Button>
      </form>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <form
            action={async () => {
              "use server"
              await signIn("google", { redirectTo: "/dashboard" })
            }}
          >
            <Button type="submit" size="lg" variant="outline" className="w-full">
              Continue with Google
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  )
}
