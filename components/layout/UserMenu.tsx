"use client"

import Link from "next/link"
import Image from "next/image"
import { useUser, useClerk } from "@clerk/nextjs"
import {
  LayoutDashboard,
  GitBranch,
  Settings,
  LogOut,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function UserMenu() {
  const { user } = useUser()
  const { signOut } = useClerk()

  if (!user) return null

  const initials =
    `${user.firstName?.charAt(0) ?? ""}${user.lastName?.charAt(0) ?? ""}`.toUpperCase() ||
    user.emailAddresses[0]?.emailAddress.charAt(0).toUpperCase() ||
    "U"

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "User"
  const email = user.emailAddresses[0]?.emailAddress ?? ""

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold ring-2 ring-primary/20 transition-transform hover:scale-105 cursor-pointer overflow-hidden"
        >
          {user.imageUrl ? (
            <Image
              src={user.imageUrl}
              alt={fullName}
              width={36}
              height={36}
              className="h-full w-full object-cover"
            />
          ) : (
            initials
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium leading-none">{fullName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/workflows" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Workflows
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Account Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ redirectUrl: "/" })}
          className="flex items-center gap-2 text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
