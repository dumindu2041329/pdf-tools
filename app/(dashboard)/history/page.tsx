import { Clock, Download, FileText } from "lucide-react"

export default function HistoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">History</h1>
        <p className="text-muted-foreground mt-1">View your past processed files.</p>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-4">
          <Clock className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-semibold">No history yet</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Files you process will appear here. Start by using any of our PDF tools.
        </p>
      </div>

      {/* History table placeholder — populated when DB is connected */}
      {/* <table className="w-full">
        <thead>
          <tr className="border-b text-left text-sm text-muted-foreground">
            <th className="pb-3 font-medium">File</th>
            <th className="pb-3 font-medium">Tool</th>
            <th className="pb-3 font-medium">Date</th>
            <th className="pb-3 font-medium">Size</th>
            <th className="pb-3 font-medium">Download</th>
          </tr>
        </thead>
      </table> */}
    </div>
  )
}
