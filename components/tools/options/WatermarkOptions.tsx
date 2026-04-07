"use client"

import { cn } from "@/lib/utils"

interface Props {
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

const positions = ["top", "middle", "bottom"] as const
const hPositions = ["left", "center", "right"] as const
const fonts = ["Arial", "Verdana", "Courier", "Times New Roman"] as const

export function WatermarkOptions({ options, onChange }: Props) {
  const mode = (options.mode as string) || "text"
  const update = (key: string, val: unknown) => onChange({ ...options, [key]: val })

  return (
    <div className="space-y-4">
      {/* Mode */}
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">Watermark Type</label>
        <div className="flex gap-2">
          {(["text", "image"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => update("mode", m)}
              className={cn(
                "rounded-lg border px-4 py-2 text-base font-medium capitalize transition-all cursor-pointer",
                mode === m ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
              )}
            >{m}</button>
          ))}
        </div>
      </div>

      {/* Text input */}
      {mode === "text" && (
        <>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Text</label>
            <input
              type="text"
              placeholder="CONFIDENTIAL"
              value={(options.text as string) || ""}
              onChange={(e) => update("text", e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Font</label>
              <select
                value={(options.font_family as string) || "Arial"}
                onChange={(e) => update("font_family", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
              >
                {fonts.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Font Size</label>
              <input
                type="number"
                min={8}
                max={120}
                placeholder="48"
                value={(options.font_size as number) || ""}
                onChange={(e) => update("font_size", Number(e.target.value))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Color</label>
            <input
              type="color"
              value={(options.font_color as string) || "#000000"}
              onChange={(e) => update("font_color", e.target.value)}
              className="h-9 w-16 rounded border border-input cursor-pointer"
            />
          </div>
        </>
      )}

      {/* Position */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Vertical</label>
          <select
            value={(options.vertical_position as string) || "middle"}
            onChange={(e) => update("vertical_position", e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base capitalize"
          >
            {positions.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Horizontal</label>
          <select
            value={(options.horizontal_position as string) || "center"}
            onChange={(e) => update("horizontal_position", e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base capitalize"
          >
            {hPositions.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
          </select>
        </div>
      </div>

      {/* Transparency */}
      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">Transparency ({(options.transparency as number) || 50}%)</label>
        <input
          type="range"
          min={1}
          max={100}
          value={(options.transparency as number) || 50}
          onChange={(e) => update("transparency", Number(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Rotation */}
      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">Rotation ({(options.rotation as number) || 0}°)</label>
        <input
          type="range"
          min={0}
          max={360}
          value={(options.rotation as number) || 0}
          onChange={(e) => update("rotation", Number(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Layer */}
      <div className="flex gap-2">
        {(["above", "below"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => update("layer", l)}
            className={cn(
              "rounded-lg border px-4 py-2 text-base font-medium capitalize transition-all cursor-pointer",
              (options.layer || "above") === l ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
            )}
          >{l} content</button>
        ))}
      </div>
    </div>
  )
}
