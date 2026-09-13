import { describe, expect, it } from "vitest"
import { getLimitsForPlan } from "@/lib/usageLimits"

describe("getLimitsForPlan", () => {
  it("returns the free caps by default", () => {
    expect(getLimitsForPlan("free")).toEqual({
      daily: 5,
      monthly: 30,
      maxFileSizeMB: 20,
    })
  })

  it("returns the premium caps", () => {
    expect(getLimitsForPlan("premium")).toEqual({
      daily: -1,
      monthly: -1,
      maxFileSizeMB: 4096,
    })
  })

  it("falls back to free for unknown plans", () => {
    expect(getLimitsForPlan("enterprise")).toEqual(getLimitsForPlan("free"))
  })
})
