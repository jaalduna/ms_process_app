import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import express from "express"
import weightingParamsRouter, { resetWeightingParams } from "../routes/weighting-params.js"

let server
let baseUrl

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use("/api/v1", weightingParamsRouter)
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}/api/v1`
      resolve()
    })
  })
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

beforeEach(() => resetWeightingParams())

const upload = (pais, filename) =>
  fetch(`${baseUrl}/weighting/params/${pais}/universo/upload?filename=${encodeURIComponent(filename)}`, {
    method: "POST",
  })

const publish = (pais, body) =>
  fetch(`${baseUrl}/weighting/params/${pais}/universo/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

describe("Universo Excel upload flow (JAA-580 / JAA-583)", () => {
  it("ac1: valid upload returns valid:true, a preview diff and an upload_token", async () => {
    const res = await upload("chile", "Universo.xlsx")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.errors).toEqual([])
    expect(body.upload_token).toMatch(/^utok_chile_/)
    expect(body.preview).toEqual({ added: 1, removed: 0, changed: 1 })
  })

  it("ac2: invalid upload returns valid:false with row/column errors and a null token", async () => {
    const res = await upload("chile", "Universo-invalid.xlsx")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.upload_token).toBeNull()
    expect(body.errors.length).toBeGreaterThan(0)
    // At least one error pinpoints a row + column.
    expect(body.errors.some((e) => e.row === 3 && e.field === "Q2-26")).toBe(true)
  })

  it("ac3: publishing a valid token bumps the version + row_count and the GET reflects it", async () => {
    const before = await (await fetch(`${baseUrl}/weighting/params/chile/universo`)).json()
    const beforeCount = before.version.row_count

    const uploaded = await (await upload("chile", "Universo.xlsx")).json()
    const pubRes = await publish("chile", { upload_token: uploaded.upload_token })
    expect(pubRes.status).toBe(200)
    const pub = await pubRes.json()
    expect(pub.table).toBe("universo")
    // `version` is the nested WeightingParamsVersion object (real JAA-580 shape).
    expect(pub.version.version).toBe(1)
    expect(pub.version.version_id).toBe("wv_universo_chile_1")
    expect(pub.unchanged).toBe(false)
    expect(pub.row_count).toBe(beforeCount + 1)

    const after = await (await fetch(`${baseUrl}/weighting/params/chile/universo`)).json()
    expect(after.version.row_count).toBe(beforeCount + 1)
    expect(after.version.hash).toBe(pub.version.hash)
  })

  it("a token can only be published once (consumed → 404)", async () => {
    const uploaded = await (await upload("chile", "Universo.xlsx")).json()
    expect((await publish("chile", { upload_token: uploaded.upload_token })).status).toBe(200)
    expect((await publish("chile", { upload_token: uploaded.upload_token })).status).toBe(404)
  })

  it("an unknown or cross-country token is rejected (404), nothing persisted", async () => {
    expect((await publish("chile", { upload_token: "nope" })).status).toBe(404)

    const uploaded = await (await upload("chile", "Universo.xlsx")).json()
    // same token, different country → 404
    expect((await publish("mexico", { upload_token: uploaded.upload_token })).status).toBe(404)
  })

  it("an invalid upload persists nothing and mints no token to publish", async () => {
    const bad = await (await upload("chile", "Universo-invalid.xlsx")).json()
    expect(bad.upload_token).toBeNull()
    const before = await (await fetch(`${baseUrl}/weighting/params/chile/universo`)).json()
    expect(before.version.row_count).toBe(6) // unchanged seed
  })

  it("rejects an unknown country with 404", async () => {
    expect((await upload("narnia", "Universo.xlsx")).status).toBe(404)
  })
})
