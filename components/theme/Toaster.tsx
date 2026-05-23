"use client"

import { useState, useEffect } from "react"
import { Toaster as SonnerToaster } from "sonner"
import { useTheme } from "next-themes"

export function Toaster() {
  const { theme = "system" } = useTheme()
  const [position, setPosition] = useState<"bottom-right" | "bottom-center">("bottom-right")

  useEffect(() => {
    function updatePosition() {
      setPosition(window.innerWidth < 768 ? "bottom-center" : "bottom-right")
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    return () => window.removeEventListener("resize", updatePosition)
  }, [])

  return (
    <SonnerToaster
      theme={theme as "light" | "dark" | "system"}
      position={position}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "flex items-center gap-3 w-full p-4 rounded-lg border bg-background text-foreground shadow-lg font-sans",
          title: "text-sm font-medium font-sans",
          description: "text-sm text-muted-foreground font-sans",
          success: "border-green-500 bg-green-100 dark:bg-green-900 dark:border-green-700",
          error: "border-destructive bg-red-100 dark:bg-red-900 dark:border-red-700",
          warning: "border-yellow-500 bg-yellow-100 dark:bg-yellow-900 dark:border-yellow-700",
          info: "border-blue-500 bg-blue-100 dark:bg-blue-900 dark:border-blue-700",
        },
      }}
    />
  )
}
