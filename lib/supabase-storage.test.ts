import { beforeAll, describe, expect, it } from "vitest"
import {
  ownerNamespace,
  ownerUploadPrefix,
  parsePublicUrl,
  parseScopedStorageUrl,
} from "@/lib/supabase-storage"

const PROJECT_URL = "https://exampleproject.supabase.co"

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = PROJECT_URL
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key"
})

describe("ownerNamespace", () => {
  it("maps anonymous callers to the shared guest namespace", () => {
    expect(ownerNamespace(null)).toBe("guest")
  })

  it("strips characters that would break the storage path contract", () => {
    expect(ownerNamespace("user_ABC-123/x")).toBe("user_ABC-123x")
  })

  it("falls back to 'user' when nothing safe remains", () => {
    expect(ownerNamespace("///")).toBe("user")
  })

  it("truncates to 64 chars", () => {
    expect(ownerNamespace("a".repeat(200))).toHaveLength(64)
  })
})

describe("ownerUploadPrefix", () => {
  it("roots every caller under uploads/<owner>/", () => {
    expect(ownerUploadPrefix("user_1")).toBe("uploads/user_1/")
    expect(ownerUploadPrefix(null)).toBe("uploads/guest/")
  })
})

describe("parsePublicUrl", () => {
  it("parses a valid public Storage URL", () => {
    expect(
      parsePublicUrl(`${PROJECT_URL}/storage/v1/object/public/pdf-uploads/uploads/guest/a.pdf`)
    ).toEqual({ bucket: "pdf-uploads", pathname: "uploads/guest/a.pdf" })
  })

  it("rejects a foreign origin (cross-host confusion)", () => {
    expect(
      parsePublicUrl("https://evil.com/storage/v1/object/public/pdf-uploads/x.pdf")
    ).toBeNull()
  })

  it("rejects URLs without the storage public marker", () => {
    expect(parsePublicUrl(`${PROJECT_URL}/some/other/path`)).toBeNull()
  })

  it("rejects a bucket with no object path", () => {
    expect(
      parsePublicUrl(`${PROJECT_URL}/storage/v1/object/public/pdf-uploads`)
    ).toBeNull()
  })

  it("returns null for unparseable input", () => {
    expect(parsePublicUrl("not a url")).toBeNull()
  })
})

describe("parseScopedStorageUrl", () => {
  const scope = { bucket: "pdf-uploads", prefixes: ["uploads/user_1/"] }

  it("accepts a URL inside the declared bucket + prefix", () => {
    const url = `${PROJECT_URL}/storage/v1/object/public/pdf-uploads/uploads/user_1/a.pdf`
    expect(parseScopedStorageUrl(url, scope)).toEqual({
      bucket: "pdf-uploads",
      pathname: "uploads/user_1/a.pdf",
    })
  })

  it("rejects another tenant's prefix in the same bucket", () => {
    const url = `${PROJECT_URL}/storage/v1/object/public/pdf-uploads/uploads/user_2/a.pdf`
    expect(parseScopedStorageUrl(url, scope)).toBeNull()
  })

  it("rejects server-owned prefixes", () => {
    const url = `${PROJECT_URL}/storage/v1/object/public/pdf-uploads/results/job/a.pdf`
    expect(parseScopedStorageUrl(url, scope)).toBeNull()
  })

  it("rejects a different bucket even with a matching path", () => {
    const url = `${PROJECT_URL}/storage/v1/object/public/scan-sessions/uploads/user_1/a.pdf`
    expect(parseScopedStorageUrl(url, scope)).toBeNull()
  })

  it("denies everything when prefixes is an empty array", () => {
    const url = `${PROJECT_URL}/storage/v1/object/public/pdf-uploads/uploads/user_1/a.pdf`
    expect(parseScopedStorageUrl(url, { bucket: "pdf-uploads", prefixes: [] })).toBeNull()
  })
})
