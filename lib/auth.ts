// lib/auth.ts
// Clerk auth helpers for plan management

import { clerkClient } from "@clerk/nextjs/server"
import { getUserPlanFromDb, setUserPlan } from "@/lib/db"

export type UserPlan = "free" | "premium"

export async function getUserPlan(userId: string): Promise<UserPlan> {
  // Clerk metadata is the primary source of truth, but we also consult the
  // Supabase app_user table so the DB stays in sync and is used as a fallback
  // when Clerk is unavailable or the metadata hasn't been written yet.
  let clerkPlan: UserPlan = "free"
  let clerkOk = false
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    clerkPlan =
      ((user.publicMetadata as Record<string, unknown>)?.plan as UserPlan) ?? "free"
    clerkOk = true
  } catch {
    // Clerk fetch failed — fall through to DB lookup
  }

  if (clerkOk && clerkPlan === "premium") return "premium"

  try {
    const dbPlan = await getUserPlanFromDb(userId)
    if (dbPlan === "premium") return "premium"
    return clerkPlan
  } catch {
    return clerkPlan
  }
}

export async function grantPremiumAccess(userId: string): Promise<void> {
  const client = await clerkClient()
  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      plan: "premium",
      planUpdatedAt: new Date().toISOString(),
    },
  })
  try {
    // setUserPlan is now an UPSERT, so the app_user row is created if it
    // didn't exist before — no separate upsertUser() call is required.
    await setUserPlan(userId, "premium")
  } catch {
    // DB sync is best-effort; Clerk metadata remains source of truth
  }
}

export async function revokePremiumAccess(userId: string): Promise<void> {
  const client = await clerkClient()
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { plan: "free" },
  })
  try {
    await setUserPlan(userId, "free")
  } catch {
    // DB sync is best-effort; Clerk metadata remains source of truth
  }
}
