// lib/auth.ts
// Clerk auth helpers for plan management

import { clerkClient } from "@clerk/nextjs/server"
import { setUserPlan } from "@/lib/db"

export type UserPlan = "free" | "premium"

export async function getUserPlan(userId: string): Promise<UserPlan> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    return ((user.publicMetadata as Record<string, unknown>)?.plan as UserPlan) ?? "free"
  } catch {
    return "free"
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
