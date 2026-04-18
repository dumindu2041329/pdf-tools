"use client"

import { Toaster as SonnerToaster } from "sonner"
import { useTheme } from "next-themes"

export function Toaster() {
  const { theme = "system" } = useTheme()

  return (
    <SonnerToaster
      theme={theme as "light" | "dark" | "system"}
      position="bottom-right"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "flex items-center gap-3 w-full p-4 rounded-lg border bg-background text-foreground shadow-lg",
          title: "text-sm font-medium",
          description: "text-sm text-muted-foreground",
          success: "border-green-500/20 bg-green-50 dark:bg-green-950/20",
          error: "border-destructive/20 bg-destructive/5",
          warning: "border-yellow-500/20 bg-yellow-50 dark:bg-yellow-950/20",
          info: "border-blue-500/20 bg-blue-50 dark:bg-blue-950/20",
        },
      }}
    />
  )
}
