export interface WorkflowFile {
  name: string
  size: number
  type: string
  arrayBuffer: ArrayBuffer
}

export interface WorkflowSession {
  workflowId: string
  currentStepIndex: number
  totalSteps: number
  inputFiles: WorkflowFile[]
  stepResults: Array<{
    outputBuffer: ArrayBuffer
    filename: string
  } | null>
}

let memorySession: WorkflowSession | null = null

const DB_NAME = "pdf_tools_workflow_db"
const STORE_NAME = "workflow_session"
const SESSION_KEY = "current_session"

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

async function saveSessionToDB(session: WorkflowSession): Promise<void> {
  if (typeof window === "undefined") return
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(session, SESSION_KEY)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error("Failed to save session to IndexedDB:", error)
  }
}

async function loadSessionFromDB(): Promise<WorkflowSession | null> {
  if (typeof window === "undefined") return null
  try {
    const db = await openDB()
    return await new Promise<WorkflowSession | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(SESSION_KEY)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error("Failed to load session from IndexedDB:", error)
    return null
  }
}

async function clearSessionFromDB(): Promise<void> {
  if (typeof window === "undefined") return
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(SESSION_KEY)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error("Failed to clear session from IndexedDB:", error)
  }
}

export async function createWorkflowSession(
  workflowId: string,
  totalSteps: number,
  inputFiles: File[]
): Promise<WorkflowSession> {
  const serializedFiles: WorkflowFile[] = await Promise.all(
    inputFiles.map(async (file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
      arrayBuffer: await file.arrayBuffer(),
    }))
  )

  const session: WorkflowSession = {
    workflowId,
    currentStepIndex: 0,
    totalSteps,
    inputFiles: serializedFiles,
    stepResults: Array(totalSteps).fill(null),
  }

  memorySession = session
  await saveSessionToDB(session)
  return session
}

export function getWorkflowSession(): WorkflowSession | null {
  return memorySession
}

export async function loadWorkflowSession(): Promise<WorkflowSession | null> {
  if (memorySession) return memorySession
  const session = await loadSessionFromDB()
  if (session) {
    memorySession = session
  }
  return memorySession
}

export function updateWorkflowSession(updates: Partial<WorkflowSession>): WorkflowSession | null {
  if (!memorySession) return null

  memorySession = { ...memorySession, ...updates }
  saveSessionToDB(memorySession)
  return memorySession
}

export function clearWorkflowSession(): void {
  memorySession = null
  clearSessionFromDB()
}
