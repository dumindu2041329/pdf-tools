// lib/auth.ts
// Clerk auth helpers for plan management

import { clerkClient } from "@clerk/nextjs/server"

export type UserPlan = "free" | "premium" | "business"

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
}

export async function grantBusinessAccess(userId: string): Promise<void> {
  const client = await clerkClient()
  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      plan: "business",
      planUpdatedAt: new Date().toISOString(),
    },
  })
}

export async function revokePremiumAccess(userId: string): Promise<void> {
  const client = await clerkClient()
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { plan: "free" },
  })
}
