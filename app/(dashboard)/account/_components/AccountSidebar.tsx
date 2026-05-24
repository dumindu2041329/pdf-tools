"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { User, CreditCard, Shield } from "lucide-react"
import { cn } from "@/lib/utils"

const sidebarLinks = [
  { href: "/account/profile", label: "Profile", icon: User },
  { href: "/account/billing", label: "Billing", icon: CreditCard },
  { href: "/account/security", label: "Security", icon: Shield },
]

export function AccountSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-full shrink-0 md:w-56 lg:w-64">
      <nav className="space-y-1">
        {sidebarLinks.map(({ href, label, icon: Icon }) => {
          const active = href === "/account/profile"
            ? pathname === "/account/profile" || pathname === "/account"
            : pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
