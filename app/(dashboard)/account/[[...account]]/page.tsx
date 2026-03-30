import { UserProfile } from "@clerk/nextjs"

export default function AccountPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Account</h1>
        <p className="text-muted-foreground mt-1">Manage your account settings.</p>
      </div>
      <div className="flex justify-center">
        <UserProfile
          appearance={{
            elements: {
              card: "shadow-none border border-border bg-card rounded-2xl w-full max-w-2xl",
            },
          }}
        />
      </div>
    </div>
  )
}
