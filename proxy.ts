import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

const isProtectedRoute = createRouteMatcher([])

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
}, { clockSkewInMs: 60000 })

export const config = {
  matcher: ["/((?!_next|/api/tools/|/api/activity|/api/usage|/api/download/|/api/ai/|/api/webhooks/.*\\..*).*)"],
}