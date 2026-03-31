// lib/iloveapi/signature.ts
// Full iLoveAPI Signature API wrapper

import { ilovepdf, getRawToken } from "./client"
import { ILoveAPIError } from "./errors"

// ── Types ────────────────────────────────────────────────────

export interface SignerDefinition {
  name: string
  email: string
  phone?: string
  type: "signer" | "validator" | "viewer"
  language?: string
  force_signature_type?: "all" | "text" | "sign" | "image"
  access_code?: string
  files: Array<{
    server_filename: string
    elements: Array<{
      type: "signature" | "initials" | "name" | "date" | "text" | "input"
      position: string
      pages: string
      size?: number
      content?: string
    }>
  }>
}

export interface CreateSignatureOptions {
  task: string
  files: Array<{
    server_filename: string
    filename: string
    brand_name?: string
    brand_logo?: string
  }>
  signers: SignerDefinition[]
  lock_order?: boolean
  expiration_days?: number
  message_signer?: string
  subject_signer?: string
  uuid_visible?: boolean
  signer_reminders?: boolean
  signer_reminder_days_cycle?: number
  verify_enabled?: boolean
}

export interface SignatureResponse {
  token_requester: string
  uuid: string
  status: string
  signers: Array<{
    token_signer: string
    name: string
    email: string
    status: string
  }>
}

// ── Functions ────────────────────────────────────────────────

export async function createSignatureRequest(
  options: CreateSignatureOptions,
  serverUrl: string
): Promise<SignatureResponse> {
  const res = await fetch(`https://${serverUrl}/v1/signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getRawToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(options),
  })
  if (!res.ok) throw new ILoveAPIError(await res.json())
  return res.json()
}

export async function getSignatureStatus(
  tokenRequester: string
): Promise<Record<string, unknown>> {
  try {
    const status = await ilovepdf.getSignatureStatus(tokenRequester)
    return status as unknown as Record<string, unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err.message) throw new ILoveAPIError({ message: err.message, type: "StatusError" })
    throw err
  }
}

export async function downloadSignedFile(
  server: string, // Kept for backwards compatibility but unused
  tokenRequester: string
): Promise<ArrayBuffer> {
  try {
    const arr = await ilovepdf.downloadSignedFiles(tokenRequester)
    return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    throw new ILoveAPIError({ type: "DownloadError", message: err.message || "Download failed" })
  }
}

export async function downloadAuditTrail(
  server: string, // Unused SDK handles it
  tokenRequester: string
): Promise<ArrayBuffer> {
  try {
    const arr = await ilovepdf.downloadAuditFiles(tokenRequester)
    return arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    throw new ILoveAPIError({ type: "DownloadError", message: err.message || "Download failed" })
  }
}

export async function voidSignatureRequest(
  tokenRequester: string
): Promise<Record<string, unknown>> {
  try {
    await ilovepdf.voidSignature(tokenRequester)
    return { success: true }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err.message) throw new ILoveAPIError({ message: err.message, type: "VoidError" })
    throw err
  }
}

export async function sendSignatureReminder(
  tokenRequester: string
): Promise<Record<string, unknown>> {
  try {
    await ilovepdf.sendReminders(tokenRequester)
    return { success: true }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    if (err.message) throw new ILoveAPIError({ message: err.message, type: "ReminderError" })
    throw err
  }
}

