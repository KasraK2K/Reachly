"use client"

import { KeyRound, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { fmtDate, PageHeader } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { call, useApi } from "@/lib/client"
import type { Me, User } from "@/lib/types"

export default function UsersPage() {
  const me = useApi<Me>("/me").data
  const { data: users, error, reload } = useApi<User[]>("/users")
  const [adding, setAdding] = useState(false)
  const [resetting, setResetting] = useState<User | null>(null)
  const [deleting, setDeleting] = useState<User | null>(null)

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn()
      toast.success(ok)
      reload()
      return true
    } catch (e) {
      toast.error((e as Error).message)
      return false
    }
  }

  if (error) return <PageHeader title="Users" description={error} />

  return (
    <>
      <PageHeader title="Users" description="Only people you add here can sign in. Each user has their own leads, templates and campaigns.">
        <Button onClick={() => setAdding(true)}>
          <Plus /> Add user
        </Button>
      </PageHeader>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Sign-in</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!users && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6" />
                </TableCell>
              </TableRow>
            )}
            {users?.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium">
                    {u.name ?? "—"} {u.id === me?.id && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">{u.email}</div>
                </TableCell>
                <TableCell>
                  <Select
                    value={u.role}
                    disabled={u.id === me?.id}
                    onValueChange={(role) => run(() => call(`/users/${u.id}`, { method: "PATCH", body: { role } }), "Role updated")}
                  >
                    <SelectTrigger size="sm" className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {u.hasPassword && <Badge variant="outline">Password</Badge>}
                    <Badge variant="outline">Google</Badge>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtDate(u.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => setResetting(u)} aria-label="Set password">
                      <KeyRound />
                    </Button>
                    {u.id !== me?.id && (
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(u)} aria-label="Delete user">
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Google sign-in works for any user whose Google account uses the same email, when Google is configured.</p>

      <AddUserDialog
        open={adding}
        onOpenChange={setAdding}
        onSubmit={(body) => run(() => call("/users", { body }), "User added")}
      />

      <Dialog open={!!resetting} onOpenChange={(o) => !o && setResetting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set password for {resetting?.email}</DialogTitle>
            <DialogDescription>Share it with them privately. They can sign in with it right away.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault()
              const password = String(new FormData(e.currentTarget).get("password"))
              if (await run(() => call(`/users/${resetting!.id}`, { method: "PATCH", body: { password } }), "Password set")) setResetting(null)
            }}
          >
            <Input name="password" type="password" autoComplete="new-password" minLength={8} required placeholder="At least 8 characters" autoFocus />
            <DialogFooter>
              <Button type="submit">Set password</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.email}?</DialogTitle>
            <DialogDescription>This also deletes all of their leads, templates, campaigns and Instagram accounts. It can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (await run(() => call(`/users/${deleting!.id}`, { method: "DELETE" }), "User deleted")) setDeleting(null)
              }}
            >
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AddUserDialog({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (body: object) => Promise<boolean> }) {
  const [role, setRole] = useState("Member")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>Leave the password empty if they will only sign in with Google.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const password = String(fd.get("password") ?? "")
            const ok = await onSubmit({ email: fd.get("email"), name: fd.get("name"), role, ...(password && { password }) })
            if (ok) onOpenChange(false)
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="u-email">Email</Label>
            <Input id="u-email" name="email" type="email" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="u-name">Name</Label>
              <Input id="u-name" name="name" />
            </div>
            <div className="grid gap-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Member">Member</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="u-password">Temporary password</Label>
            <Input id="u-password" name="password" type="password" autoComplete="new-password" minLength={8} placeholder="Optional, at least 8 characters" />
          </div>
          <DialogFooter>
            <Button type="submit">Add user</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
