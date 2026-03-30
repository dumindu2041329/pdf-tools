import { SignIn } from "@clerk/nextjs"

export default function SignInPage() {
  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground mt-2">
          Sign in to access your PDF tools
        </p>
      </div>
      <SignIn
        appearance={{
          elements: {
            card: "shadow-2xl border border-border bg-card rounded-2xl",
            formButtonPrimary:
              "bg-primary hover:bg-primary/90 text-primary-foreground",
          },
        }}
      />
    </div>
  )
}
