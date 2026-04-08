"use client"

import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"

interface Props {
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

export function UnlockOptions({ options, onChange }: Props) {
  const [show, setShow] = useState(false)

  return (
    <div className="space-y-1">
      <label className="text-sm text-muted-foreground">Current Password</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          placeholder="Enter file password"
          value={(options.password as string) || ""}
          onChange={(e) => onChange({ ...options, password: e.target.value })}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-base"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
