import { describe, expect, it } from "vitest"
import { pollInterval } from "../useQmsTr"
import type { QmsTrRun } from "../../types"

const r = (status: QmsTrRun["status"]) => ({ status }) as QmsTrRun

describe("pollInterval", () => {
  it("3 s con corridas en curso", () => expect(pollInterval([r("running"), r("waiting_snapshot")])).toBe(3000))
  it("30 s si solo hay corridas esperando el snapshot", () => expect(pollInterval([r("waiting_snapshot"), r("completed")])).toBe(30_000))
  it("sin polling si nada está activo", () => expect(pollInterval([r("completed"), r("failed")])).toBe(false))
})
