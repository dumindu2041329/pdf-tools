/**
 * Lightweight user-agent → device info helper.
 *
 * The Scan-to-PDF flow shows the connecting phone's device name in
 * the desktop UI so the user knows which device is paired with the
 * session. `navigator.userAgent` doesn't expose the marketing name
 * ("iPhone 15 Pro") — only the platform ("iPhone") — so the best we
 * can do reliably client-side is a coarse { type, os, browser } triple
 * derived from well-known UA substrings.
 *
 * The parser is intentionally tiny and dependency-free; if we ever
 * need richer info we can swap in `ua-parser-js` later.
 */

export type DeviceType = "mobile" | "tablet" | "desktop"

export interface DeviceInfo {
  /** Coarse form factor: mobile / tablet / desktop. */
  type: DeviceType
  /** Best-effort OS name (e.g. "iOS", "Android", "macOS", "Windows"). */
  os: string
  /** Best-effort browser name (e.g. "Safari", "Chrome", "Firefox"). */
  browser: string
  /** Combined display string, e.g. "iOS · Safari" or "Android · Chrome". */
  label: string
}

/**
 * Parse a user-agent string into a `DeviceInfo`. Returns `null` for
 * unrecognized inputs (instead of throwing) so the caller can decide
 * whether to fall back to a generic label.
 */
export function parseDeviceInfo(userAgent: string | undefined | null): DeviceInfo | null {
  if (!userAgent) return null

  const ua = userAgent

  // OS detection — order matters because some UAs embed multiple tokens
  // (e.g. Chrome on iOS still says "iPhone" + "CriOS").
  let os = "Unknown"
  let type: DeviceType = "desktop"

  if (/iPhone|iPod/i.test(ua)) {
    os = "iOS"
    type = "mobile"
  } else if (/iPad/i.test(ua)) {
    os = "iOS"
    type = "tablet"
  } else if (/Android/i.test(ua)) {
    os = "Android"
    // Android tablets typically don't include "Mobile" in the UA.
    type = /Mobile/i.test(ua) ? "mobile" : "tablet"
  } else if (/Windows/i.test(ua)) {
    os = "Windows"
  } else if (/Mac OS X|Macintosh/i.test(ua)) {
    os = "macOS"
  } else if (/Linux/i.test(ua)) {
    os = "Linux"
  }

  // Browser detection — also order-sensitive because Safari identifies
  // itself inside Chrome's UA on iOS.
  let browser = "Unknown"
  if (/Edg\//i.test(ua)) {
    browser = "Edge"
  } else if (/OPR\//i.test(ua)) {
    browser = "Opera"
  } else if (/Firefox\//i.test(ua)) {
    browser = "Firefox"
  } else if (/CriOS\//i.test(ua)) {
    browser = "Chrome"
  } else if (/FxiOS\//i.test(ua)) {
    browser = "Firefox"
  } else if (/Chrome\//i.test(ua) && !/Chromium\//i.test(ua)) {
    browser = "Chrome"
  } else if (/Safari\//i.test(ua) && /Version\//i.test(ua)) {
    browser = "Safari"
  }

  const label = `${os} · ${browser}`
  return { type, os, browser, label }
}