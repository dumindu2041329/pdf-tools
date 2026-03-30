import { SignUp } from "@clerk/nextjs"

export default function SignUpPage() {
  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Get started free</h1>
        <p className="text-muted-foreground mt-2">
          Create an account to unlock all PDF tools
        </p>
      </div>
      <SignUp
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
