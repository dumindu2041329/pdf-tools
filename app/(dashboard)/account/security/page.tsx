"use client"

import { useUser, useClerk, useReverification } from "@clerk/nextjs"
import { useCallback, useState } from "react"
import {
  Lock,
  Monitor,
  Loader2,
  Check,
  Eye,
  EyeOff,
  MonitorSmartphone,
  Globe,
  LogOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"

export default function SecurityPage() {
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()

  // Password state
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState("")

  // Wrap the sensitive updatePassword call with useReverification so Clerk
  // handles the re-authentication flow automatically (e.g. re-prompting for
  // the current password) instead of requiring manual session refresh hacks.
  // If the user provides their current password, Clerk uses it directly to
  // authorize the change; otherwise the reverification flow kicks in.
  const updatePassword = useCallback(
    (params: { currentPassword?: string; newPassword: string }) => {
      if (!user) {
        throw new Error("User is not loaded")
      }
      return user.updatePassword(params)
    },
    [user]
  )
  const protectedUpdatePassword = useReverification(updatePassword)

  if (!isLoaded || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const hasPassword = user.passwordEnabled

  const handlePasswordChange = async () => {
    setPasswordError("")
    setPasswordSaved(false)

    if (hasPassword && !currentPassword) {
      setPasswordError("Please enter your current password")
      return
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters")
      return
    }
    if (hasPassword && newPassword === currentPassword) {
      setPasswordError("New password must be different from your current password")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match")
      return
    }

    setPasswordSaving(true)
    try {
      await protectedUpdatePassword({
        ...(hasPassword ? { currentPassword } : {}),
        newPassword,
      })
      setPasswordSaved(true)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setTimeout(() => setPasswordSaved(false), 3000)
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Failed to update password"
      )
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleSignOutAll = async () => {
    await signOut({ redirectUrl: "/" })
  }

  return (
    <div className="space-y-6">
      {/* Password */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Password</h2>
            <p className="text-sm text-muted-foreground">
              {hasPassword
                ? "Update your password to keep your account secure"
                : "Set a password for email sign-in"}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {hasPassword && (
            <div className="space-y-2">
              <label
                htmlFor="currentPassword"
                className="text-sm font-medium"
              >
                Current Password
              </label>
              <div className="relative">
                <input
                  id="currentPassword"
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 pr-10 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Enter current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrent ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="newPassword" className="text-sm font-medium">
              {hasPassword ? "New Password" : "Set Password"}
            </label>
            <div className="relative">
              <input
                id="newPassword"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 pr-10 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNew ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="confirmPassword"
              className="text-sm font-medium"
            >
              Confirm Password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 pr-10 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Confirm new password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {passwordError && (
            <p className="text-sm text-destructive">{passwordError}</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handlePasswordChange} disabled={passwordSaving} className="w-full sm:w-auto">
              {passwordSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : passwordSaved ? (
                <>
                  <Check className="h-4 w-4" />
                  Saved
                </>
              ) : (
                "Update Password"
              )}
            </Button>
            {passwordSaved && (
              <span className="text-sm text-green-600 dark:text-green-400">
                Password updated successfully
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Monitor className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Active Sessions</h2>
            <p className="text-sm text-muted-foreground">
              Manage devices where you&apos;re signed in
            </p>
          </div>
        </div>

        <div className="space-y-3 mb-4">
          {/* Current session */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-3 min-w-0">
              <MonitorSmartphone className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">This Device</p>
                <p className="text-xs text-muted-foreground">
                  Current session
                </p>
              </div>
            </div>
            <span className="self-start sm:self-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Active
            </span>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <Button variant="destructive" onClick={handleSignOutAll} className="w-full sm:w-auto">
            <LogOut className="h-4 w-4 mr-1.5" />
            Sign out all other sessions
          </Button>
        </div>
      </div>

      {/* Connected Accounts */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Connected Accounts</h2>
            <p className="text-sm text-muted-foreground">
              Manage social sign-in connections
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {user.externalAccounts.map((account) => (
            <div
              key={account.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 rounded-lg border border-border p-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Globe className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize">
                    {account.provider}
                  </p>
                  <p className="text-xs text-muted-foreground break-all">
                    {account.emailAddress ?? "Connected"}
                  </p>
                </div>
              </div>
              <span className="self-start sm:self-auto rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                Connected
              </span>
            </div>
          ))}
          {user.externalAccounts.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No connected accounts. You can link social accounts from Clerk.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
