import { clerkMiddleware } from "@clerk/nextjs/server"

// Resource-based auth checks are performed in the protected layouts/pages
// (e.g. app/(dashboard)/layout.tsx) using auth.protect(), per the
// current Clerk guidance. Middleware no longer uses path matching.
export default clerkMiddleware(async (auth, req) => {
  // Intentionally empty: route protection is handled in the layout.
}, { clockSkewInMs: 60000 })

export const config = {
  matcher: ["/((?!_next|/api/tools/|/api/activity|/api/usage|/api/download/|/api/ai/|/api/billing/|/api/webhooks/.*).*)"],
}