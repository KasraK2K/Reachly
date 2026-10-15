import { redirect } from "next/navigation"
import { signIn } from "@/auth"
import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { serviceCall, setupNeeded } from "@/lib/service"

export const metadata = { title: "Set up" }

/** First run only: creates the admin account. Disappears once an admin exists. */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await setupNeeded())) redirect("/login")
  const { error } = await searchParams

  return (
    <AuthShell title="Create the admin account" description="This is a one-time step. The admin signs in with this email and password, and adds everyone else from the Users page.">
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm whitespace-pre-line text-destructive">
          {error}
        </p>
      )}
      <form
        className="grid gap-4"
        action={async (fd) => {
          "use server"
          const email = String(fd.get("email") ?? "")
          const password = String(fd.get("password") ?? "")
          if (password !== fd.get("confirm")) redirect(`/setup?error=${encodeURIComponent("Passwords don't match.")}`)
          const { status, data } = await serviceCall<{ message?: string | string[] }>("/auth/setup", { email, name: fd.get("name"), password })
          if (status === 409) redirect("/login")
          if (status >= 400) {
            const msg = [data?.message].flat().filter(Boolean).map((m) => String(m).replace(/^\w+: /, "")).join("\n")
            redirect(`/setup?error=${encodeURIComponent(msg || "Setup failed.")}`)
          }
          await signIn("password", { email, password, redirectTo: "/dashboard" })
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" autoFocus />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <Button type="submit" size="lg" className="w-full">
          Create admin account
        </Button>
      </form>
    </AuthShell>
  )
}
