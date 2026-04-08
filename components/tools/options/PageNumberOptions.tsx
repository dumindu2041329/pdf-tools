"use client"

interface Props {
  options: Record<string, unknown>
  onChange: (opts: Record<string, unknown>) => void
}

export function PageNumberOptions({ options, onChange }: Props) {
  const update = (key: string, val: unknown) => onChange({ ...options, [key]: val })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Vertical Position</label>
          <select
            value={(options.vertical_position as string) || "bottom"}
            onChange={(e) => update("vertical_position", e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
          >
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Horizontal Position</label>
          <select
            value={(options.horizontal_position as string) || "center"}
            onChange={(e) => update("horizontal_position", e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm text-muted-foreground">Format</label>
        <input
          type="text"
          placeholder="Page {n} of {p}"
          value={(options.text as string) || ""}
          onChange={(e) => update("text", e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
        />
        <p className="text-sm text-muted-foreground mt-1">Use {"{n}"} for page number, {"{p}"} for total pages</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Starting Number</label>
          <input
            type="number"
            min={1}
            value={(options.starting_number as number) || 1}
            onChange={(e) => update("starting_number", Number(e.target.value))}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">Font Size</label>
          <input
            type="number"
            min={6}
            max={72}
            value={(options.font_size as number) || 12}
            onChange={(e) => update("font_size", Number(e.target.value))}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-base cursor-pointer">
          <input
            type="checkbox"
            checked={!!options.first_cover}
            onChange={(e) => update("first_cover", e.target.checked)}
            className="rounded"
          />
          Skip first page (cover)
        </label>
      </div>
    </div>
  )
}
