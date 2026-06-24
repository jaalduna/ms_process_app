import { describe, it, expect } from "vitest"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "../countries"
import { formatRelativeTime } from "../utils"

describe("country lookup tables", () => {
  it("maps known country codes to flag emoji", () => {
    expect(COUNTRY_FLAGS.chile).toBe("\u{1F1E8}\u{1F1F1}")
    expect(COUNTRY_FLAGS.brasil).toBe("\u{1F1E7}\u{1F1F7}")
    expect(COUNTRY_FLAGS.cam).toBe("\u{1F30E}")
  })

  it("maps known country codes to display labels", () => {
    expect(COUNTRY_LABELS.chile).toBe("Chile")
    expect(COUNTRY_LABELS.brasil).toBe("Brasil")
    expect(COUNTRY_LABELS.cam).toBe("CAM")
  })

  it("returns undefined for unknown codes (callers fall back to the raw code)", () => {
    expect(COUNTRY_FLAGS.atlantis).toBeUndefined()
    expect(COUNTRY_LABELS.atlantis).toBeUndefined()
  })
})

describe("formatRelativeTime", () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

  it('returns "just now" under a minute', () => {
    expect(formatRelativeTime(ago(30 * 1000))).toBe("just now")
  })

  it("returns minutes for under an hour", () => {
    expect(formatRelativeTime(ago(5 * 60 * 1000))).toBe("5m ago")
  })

  it("returns hours for under a day", () => {
    expect(formatRelativeTime(ago(3 * 60 * 60 * 1000))).toBe("3h ago")
  })

  it("returns days beyond 24h", () => {
    expect(formatRelativeTime(ago(2 * 24 * 60 * 60 * 1000))).toBe("2d ago")
  })
})
