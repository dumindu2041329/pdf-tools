import { randomUUID } from "crypto";

interface StoredFile {
  buffer: Uint8Array;
  filename: string;
  contentType: string;
}

const store = new Map<string, StoredFile>();

export function storeFile(
  buffer: Uint8Array | ArrayBuffer,
  filename: string,
  contentType = "application/pdf"
): string {
  const id = randomUUID();
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  store.set(id, { buffer: data, filename, contentType });
  return id;
}

export function getFile(id: string): StoredFile | undefined {
  return store.get(id);
}

export function deleteFile(id: string): void {
  store.delete(id);
}
