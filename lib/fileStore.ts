import { randomUUID } from "crypto"

interface StoredFile {
  buffer: Uint8Array
  filename: string
  contentType: string
}

const fileStore = new Map<string, StoredFile>()

export function storeFile(
  buffer: Uint8Array | ArrayBuffer,
  filename: string,
  contentType = "application/pdf"
): Promise<string> {
  const id = randomUUID()
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  fileStore.set(id, {
    buffer: data,
    filename,
    contentType,
  })
  return Promise.resolve(id)
}

export async function getFile(id: string): Promise<StoredFile | undefined> {
  return fileStore.get(id)
}

export async function deleteFile(id: string): Promise<void> {
  fileStore.delete(id)
}
