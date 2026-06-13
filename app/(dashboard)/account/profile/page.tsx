"use client"

import { useUser, useReverification } from "@clerk/nextjs"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import {
  Camera,
  Check,
  KeyRound,
  Loader2,
  Mail,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"

export default function ProfilePage() {
  const { user, isLoaded } = useUser()
  const [firstName, setFirstName] = useState(user?.firstName ?? "")
  const [lastName, setLastName] = useState(user?.lastName ?? "")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // Email state
  const [newEmail, setNewEmail] = useState("")
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError] = useState("")
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState("")
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyError, setVerifyError] = useState("")
  const [verifyingAddress, setVerifyingAddress] = useState("")

  // Wrap sensitive Clerk operations with reverification
  const createEmailSafe = useReverification((email: string) =>
    user!.createEmailAddress({ email })
  )
  const setPrimarySafe = useReverification((emailId: string) =>
    user!.update({ primaryEmailAddressId: emailId })
  )
  const destroyEmailSafe = useReverification((emailId: string) => {
    const emailAddress = user!.emailAddresses.find((e) => e.id === emailId)
    if (!emailAddress) throw new Error("Email address not found")
    return emailAddress.destroy()
  })

  if (!isLoaded || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || "User"
  const primaryEmail = user.primaryEmailAddress
  const allEmails = user.emailAddresses

  const handleSave = async () => {
    setSaving(true)
    setError("")
    setSaved(false)
    try {
      await user.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    setError("")
    try {
      await user.setProfileImage({ file })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photo")
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleRemovePhoto = async () => {
    try {
      await user.setProfileImage({ file: null })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove photo")
    }
  }

  const handleAddEmail = async () => {
    if (!newEmail.trim()) return
    setEmailLoading(true)
    setEmailError("")
    try {
      await user.reload()
      const created = await createEmailSafe(newEmail.trim())
      await user.reload()
      const emailAddress = user.emailAddresses.find((e) => e.id === created.id)
      if (!emailAddress) throw new Error("Email address not found after creation")
      await emailAddress.prepareVerification({ strategy: "email_code" })
      setVerifyingId(emailAddress.id)
      setVerifyingAddress(emailAddress.emailAddress)
      setNewEmail("")
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Failed to add email")
    } finally {
      setEmailLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!verifyingId || !verifyCode.trim()) return
    setVerifyLoading(true)
    setVerifyError("")
    try {
      const emailAddress = user.emailAddresses.find((e) => e.id === verifyingId)
      if (!emailAddress) throw new Error("Email address not found")
      await emailAddress.attemptVerification({ code: verifyCode.trim() })
      await user.reload()
      setVerifyingId(null)
      setVerifyCode("")
      setVerifyingAddress("")
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "Invalid code")
    } finally {
      setVerifyLoading(false)
    }
  }

  const handleSetPrimary = async (emailId: string) => {
    try {
      await setPrimarySafe(emailId)
      await user.reload()
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Failed to set primary email")
    }
  }

  const handleStartVerify = async (emailId: string) => {
    const emailAddress = user.emailAddresses.find((e) => e.id === emailId)
    if (!emailAddress) return
    try {
      await emailAddress.prepareVerification({ strategy: "email_code" })
      setVerifyingId(emailAddress.id)
      setVerifyingAddress(emailAddress.emailAddress)
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Failed to send verification code")
    }
  }

  const handleRemoveEmail = async (emailId: string) => {
    try {
      await destroyEmailSafe(emailId)
      await user.reload()
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Failed to remove email")
    }
  }

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-4">Profile Photo</h2>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div className="relative shrink-0">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground text-2xl font-semibold overflow-hidden">
              {user.imageUrl ? (
                <Image
                  src={user.imageUrl}
                  alt={fullName}
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                />
              ) : (
                fullName.charAt(0).toUpperCase()
              )}
            </div>
            {uploadingPhoto && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="photo-upload">
              <Button variant="outline" size="sm" asChild>
                <span className="cursor-pointer">
                  <Camera className="h-4 w-4 mr-1.5" />
                  Change Photo
                </span>
              </Button>
              <input
                id="photo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </label>
            {user.imageUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemovePhoto}
                className="text-destructive hover:text-destructive justify-start sm:justify-center"
              >
                <X className="h-4 w-4 mr-1.5" />
                Remove Photo
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-4">Personal Information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="firstName" className="text-sm font-medium">
              First Name
            </label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="First name"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="lastName" className="text-sm font-medium">
              Last Name
            </label>
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Last name"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4" />
                Saved
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
          {saved && (
            <span className="text-sm text-green-600 dark:text-green-400">
              Profile updated successfully
            </span>
          )}
        </div>
      </div>

      {/* Email */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-4">Email Addresses</h2>

        {/* Existing emails */}
        <div className="space-y-2 mb-4">
          {allEmails.map((email) => (
            <div
              key={email.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-input bg-background px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm break-all min-w-0">{email.emailAddress}</span>
                {primaryEmail?.id === email.id && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Primary
                  </span>
                )}
                {!email.verification?.status || email.verification.status !== "verified" ? (
                  <>
                    <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                      Unverified
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStartVerify(email.id)}
                      className="ml-0 sm:ml-2 h-7 px-2 text-xs"
                    >
                      Verify
                    </Button>
                  </>
                ) : null}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {primaryEmail?.id !== email.id && !user.passwordEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    title="Add password for email sign-in"
                  >
                    <Link href="/account/security">
                      <KeyRound className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Add password</span>
                    </Link>
                  </Button>
                )}
                {primaryEmail?.id !== email.id && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetPrimary(email.id)}
                      title="Set as primary"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveEmail(email.id)}
                      className="text-destructive hover:text-destructive"
                      title="Remove email"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {emailError && (
          <p className="mb-3 text-sm text-destructive">{emailError}</p>
        )}

        {/* Add new email */}
        {verifyingId ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <p className="text-sm">
              Enter the verification code sent to{" "}
              <span className="font-medium break-all">{verifyingAddress}</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Enter 6-digit code"
                maxLength={6}
              />
              <div className="flex gap-2">
                <Button onClick={handleVerifyCode} disabled={verifyLoading} size="sm" className="flex-1 sm:flex-none">
                  {verifyLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Verify"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setVerifyingId(null)
                    setVerifyingAddress("")
                    setVerifyCode("")
                    setVerifyError("")
                  }}
                  className="flex-1 sm:flex-none"
                >
                  Cancel
                </Button>
              </div>
            </div>
            {verifyError && (
              <p className="text-sm text-destructive">{verifyError}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Add another email address"
            />
            <Button
              onClick={handleAddEmail}
              disabled={emailLoading || !newEmail.trim()}
              size="sm"
              className="w-full sm:w-auto"
            >
              {emailLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
