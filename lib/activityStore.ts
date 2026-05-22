export interface Activity {
  id: string
  toolSlug: string
  fileName: string
  outputSize: number
  timestamp: number
}

const STORAGE_KEY = "pdf-tools-activity"
const MAX_ACTIVITIES = 50

function readActivities(): Activity[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Activity[]) : []
  } catch {
    return []
  }
}

function writeActivities(activities: Activity[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activities))
  } catch {
    // storage full — clear and retry
    localStorage.removeItem(STORAGE_KEY)
  }
}

export function recordActivity(
  toolSlug: string,
  fileName: string,
  outputSize: number
): void {
  const activities = readActivities()
  activities.unshift({
    id: crypto.randomUUID(),
    toolSlug,
    fileName,
    outputSize,
    timestamp: Date.now(),
  })
  if (activities.length > MAX_ACTIVITIES) {
    activities.length = MAX_ACTIVITIES
  }
  writeActivities(activities)

  // Notify listeners (same-tab) that activity changed
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("activity-update"))
  }
}

export function getRecentActivities(limit = 10): Activity[] {
  return readActivities().slice(0, limit)
}

export function getStats(): { filesToday: number; filesThisMonth: number } {
  const activities = readActivities()
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  let filesToday = 0
  let filesThisMonth = 0

  for (const a of activities) {
    if (a.timestamp >= startOfMonth) {
      filesThisMonth++
      if (a.timestamp >= startOfDay) {
        filesToday++
      }
    }
  }

  return { filesToday, filesThisMonth }
}
