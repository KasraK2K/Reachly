"use client"

import { BarChart3, Bot, Inbox, LayoutDashboard, LogOut, Megaphone, MessageSquareText, Moon, Settings, Sun, UserCog, Users } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { useTheme } from "next-themes"
import { Logo } from "@/components/logo"
import { useApi } from "@/lib/client"
import type { Me } from "@/lib/types"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const groups = [
  { label: null, items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Outreach",
    items: [
      { href: "/inbox", label: "Inbox", icon: Inbox },
      { href: "/leads", label: "Leads", icon: Users },
      { href: "/templates", label: "Templates", icon: MessageSquareText },
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/assistant", label: "Reply assistant", icon: Bot },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/users", label: "Users", icon: UserCog, adminOnly: true },
    ],
  },
]

export function AppSidebar({ user }: { user: { name: string | null; email: string; image: string | null } }) {
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const isAdmin = useApi<Me>("/me").data?.role === "Admin"

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1.5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Reachly</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g, i) => (
          <SidebarGroup key={i}>
            {g.label && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.filter((item) => !("adminOnly" in item) || isAdmin).map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={pathname.startsWith(item.href)}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              <Sun className="dark:hidden" />
              <Moon className="hidden dark:block" />
              <span>Toggle theme</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => signOut({ redirectTo: "/login" })} title={user.email}>
              <LogOut />
              <span className="truncate">Sign out {user.name ?? user.email}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
