"use client"

import Image from "next/image"
import { useUser, useClerk } from "@clerk/nextjs"
import {
  User,
  CreditCard,
  Shield,
  LogOut,
  ChevronRight,
  Crown,
  Zap,
} from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"

const planDetails: Record<string, { label: string; icon: typeof Crown; color: string }> = {
  free: { label: "Free Plan", icon: Zap, color: "text-muted-foreground" },
  premium: { label: "Premium Plan", icon: Crown, color: "text-yellow-500" },
  business: { label: "Business Plan", icon: Crown, color: "text-purple-500" },
}

export default function AccountPage() {
  const { user } = useUser()
  const { signOut } = useClerk()

  if (!user) return null

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || "User"
  const email = user.emailAddresses[0]?.emailAddress ?? ""
  const plan = ((user.publicMetadata as Record<string, unknown>)?.plan as string) ?? "free"
  const planInfo = planDetails[plan] ?? planDetails.free
  const PlanIcon = planInfo.icon

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight mb-8">
        Account Settings
      </h1>

      {/* Profile Card */}
      <div className="rounded-xl border border-border bg-card p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-semibold overflow-hidden">
            {user.imageUrl ? (
              <Image
                src={user.imageUrl}
                alt={fullName}
                width={64}
                height={64}
                className="h-full w-full object-cover"
              />
            ) : (
              fullName.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h2 className="text-xl font-semibold">{fullName}</h2>
            <p className="text-muted-foreground">{email}</p>
          </div>
        </div>
      </div>

      {/* Plan Section */}
      <div className="rounded-xl border border-border bg-card p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 ${planInfo.color}`}
            >
              <PlanIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">{planInfo.label}</h3>
              <p className="text-sm text-muted-foreground">
                {plan === "free"
                  ? "Upgrade to unlock more features and higher limits"
                  : "Your current subscription plan"}
              </p>
            </div>
          </div>
          {plan === "free" && (
            <Button asChild size="sm">
              <Link href="/#pricing">Upgrade</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Settings Links */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border mb-6">
        <Link
          href="/account/profile"
          className="flex items-center justify-between p-4 transition-colors hover:bg-accent/50"
        >
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Profile</p>
              <p className="text-sm text-muted-foreground">
                Update your name, photo, and personal details
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <Link
          href="/account/billing"
          className="flex items-center justify-between p-4 transition-colors hover:bg-accent/50"
        >
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Billing</p>
              <p className="text-sm text-muted-foreground">
                Manage your subscription and payment methods
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <Link
          href="/account/security"
          className="flex items-center justify-between p-4 transition-colors hover:bg-accent/50"
        >
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">Security</p>
              <p className="text-sm text-muted-foreground">
                Password, two-factor authentication, and sessions
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>

      {/* Sign Out */}
      <div className="rounded-xl border border-border bg-card p-4">
        <button
          type="button"
          onClick={() => signOut({ redirectUrl: "/" })}
          className="flex w-full items-center gap-3 p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut className="h-5 w-5" />
          <span className="font-medium">Sign out</span>
        </button>
      </div>
    </div>
  )
}
