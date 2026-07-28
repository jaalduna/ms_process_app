import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import express from "express"
import macrocacRouter, { resetMacrocac } from "../routes/macrocac.js"

// JAA-1048 — the mock-server must honor the macrocac contract (upload +
// dry-run execute + status polling + report downloads) so the UI (JAA-1051/
// 1053) and the real backend (JAA-1052) build against the same seam.
// Endpoints (base /api/v1):
//   POST /macrocac/uploads                     -> 201 {upload_id,...} | 422 {error,missing_columns}
//   POST /macrocac/runs                        -> 201 {run_id, status:"running", dry_run:true, ...}
//   GET  /macrocac/runs                        -> list
//   GET  /macrocac/runs/:runId                 -> status + resultado_lote once succeeded
//   GET  /macrocac/runs/:runId/reporte         -> xlsx blob (409 until succeeded)
//   GET  /macrocac/runs/:runId/reporte-diff    -> xlsx blob (409 until succeeded)
describe("macrocac API (mock-server, JAA-1048 contract)", () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use("/api/v1", macrocacRouter)
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}/api/v1`
        resolve()
      })
    })
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  beforeEach(() => {
    resetMacrocac()
  })

  afterEach(() => {
    delete process.env.MOCK_STEP_INTERVAL_MS
  })

  function uploadUrl({ filename = "correcciones_bo.xlsx", pais = "BO", tabla = "j_atoscompra_new" } = {}) {
    const params = new URLSearchParams({ filename, pais, tabla })
    return `${baseUrl}/macrocac/uploads?${params.toString()}`
  }

  async function uploadValid(overrides = {}) {
    const res = await fetch(uploadUrl(overrides), { method: "POST" })
    expect(res.status).toBe(201)
    return res.json()
  }

  // -------------------------------------------------------------------------
  // Uploads
  // -------------------------------------------------------------------------

  it("valid upload returns 201 with the correcciones_bo.xlsx-shaped envelope", async () => {
    const body = await uploadValid()
    expect(body.upload_id).toBeTruthy()
    expect(body.filename).toBe("correcciones_bo.xlsx")
    expect(body.pais).toBe("BO")
    expect(body.tabla).toBe("j_atoscompra_new")
    expect(typeof body.motivo).toBe("string")
    expect(body.filas).toBe(14)
    expect(body.columnas).toEqual(
      expect.arrayContaining([
        "IdAto",
        "Flg",
        "NewQuantidade",
        "NewPreco",
        "NewIdCanal",
        "NewForma_Compra",
        "NewUnidadesPack",
        "NewDataCompra",
        "NewIdArtigo",
        "NewPacksComprados",
      ]),
    )
  })

  it("upload with a 'sin-idato' magic filename returns 422 missing_columns", async () => {
    const res = await fetch(uploadUrl({ filename: "correcciones_sin-idato.xlsx" }), { method: "POST" })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe("missing_columns")
    expect(body.missing_columns).toEqual(expect.arrayContaining(["IdAto"]))
  })

  it("upload with an 'invalid' magic filename returns 422 missing_columns", async () => {
    const res = await fetch(uploadUrl({ filename: "invalid.xlsx" }), { method: "POST" })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe("missing_columns")
    expect(Array.isArray(body.missing_columns)).toBe(true)
    expect(body.missing_columns.length).toBeGreaterThan(0)
  })

  it("upload with an unknown pais returns 400", async () => {
    const res = await fetch(uploadUrl({ pais: "AR" }), { method: "POST" })
    expect(res.status).toBe(400)
  })

  it("upload with an unknown tabla returns 400", async () => {
    const res = await fetch(uploadUrl({ tabla: "not_a_table" }), { method: "POST" })
    expect(res.status).toBe(400)
  })

  // -------------------------------------------------------------------------
  // Runs — create, dedupe, 404
  // -------------------------------------------------------------------------

  it("creates a dry-run run with 201", async () => {
    const upload = await uploadValid()
    const res = await fetch(`${baseUrl}/macrocac/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_id: upload.upload_id }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.run_id).toBeTruthy()
    expect(body.status).toBe("running")
    expect(body.dry_run).toBe(true)
    expect(body.pais).toBe("BO")
    expect(body.tabla).toBe("j_atoscompra_new")
    expect(body.upload_id).toBe(upload.upload_id)
    expect(body.created_at).toBeTruthy()
  })

  it("returns 404 for an unknown upload_id", async () => {
    const res = await fetch(`${baseUrl}/macrocac/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_id: "upl_does_not_exist" }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 409 when a run is already active for the same (pais,tabla)", async () => {
    const upload = await uploadValid()
    const first = await fetch(`${baseUrl}/macrocac/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_id: upload.upload_id }),
    })
    expect(first.status).toBe(201)
    const firstBody = await first.json()

    const upload2 = await uploadValid()
    const second = await fetch(`${baseUrl}/macrocac/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_id: upload2.upload_id }),
    })
    expect(second.status).toBe(409)
    const secondBody = await second.json()
    expect(secondBody.error).toBe("run_in_progress")
    expect(secondBody.run_id).toBe(firstBody.run_id)
  })

  // -------------------------------------------------------------------------
  // Progression + resultado_lote
  // -------------------------------------------------------------------------

  it("progresses running -> succeeded and exposes resultado_lote with 14 rows", async () => {
    process.env.MOCK_STEP_INTERVAL_MS = "20"
    const upload = await uploadValid()
    const create = await fetch(`${baseUrl}/macrocac/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_id: upload.upload_id }),
    })
    const { run_id } = await create.json()

    let body
    for (let i = 0; i < 50; i++) {
      const res = await fetch(`${baseUrl}/macrocac/runs/${run_id}`)
      body = await res.json()
      if (body.status === "succeeded") break
      await new Promise((r) => setTimeout(r, 15))
    }

    expect(body.status).toBe("succeeded")
    expect(Array.isArray(body.resultado_lote)).toBe(true)
    expect(body.resultado_lote.length).toBe(14)
    for (const row of body.resultado_lote) {
      expect(row).toHaveProperty("IdAto")
      expect(typeof row.ok).toBe("boolean")
      expect(typeof row.mensaje).toBe("string")
      expect(["M", "E"]).toContain(row.accion)
    }
    expect(body.resultado_lote.some((r) => r.ok === false)).toBe(true)
    expect(body.resultado_lote.some((r) => r.accion === "M")).toBe(true)
    expect(body.resultado_lote.some((r) => r.accion === "E")).toBe(true)
  })

  it("lists runs via GET /macrocac/runs", async () => {
    const upload = await uploadValid()
    await fetch(`${baseUrl}/macrocac/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_id: upload.upload_id }),
    })
    const res = await fetch(`${baseUrl}/macrocac/runs`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.items ?? body)).toBe(true)
  })

  it("returns 404 for an unknown run id", async () => {
    const res = await fetch(`${baseUrl}/macrocac/runs/run_does_not_exist`)
    expect(res.status).toBe(404)
  })

  // -------------------------------------------------------------------------
  // Downloads
  // -------------------------------------------------------------------------

  it("reporte/reporte-diff return 409 before the run has succeeded", async () => {
    const upload = await uploadValid()
    const create = await fetch(`${baseUrl}/macrocac/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_id: upload.upload_id }),
    })
    const { run_id } = await create.json()

    const reporte = await fetch(`${baseUrl}/macrocac/runs/${run_id}/reporte`)
    expect(reporte.status).toBe(409)
    const diff = await fetch(`${baseUrl}/macrocac/runs/${run_id}/reporte-diff`)
    expect(diff.status).toBe(409)
  })

  it("reporte/reporte-diff return 200 with xlsx headers once succeeded", async () => {
    process.env.MOCK_STEP_INTERVAL_MS = "20"
    const upload = await uploadValid()
    const create = await fetch(`${baseUrl}/macrocac/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_id: upload.upload_id }),
    })
    const { run_id } = await create.json()

    let status
    for (let i = 0; i < 50; i++) {
      const res = await fetch(`${baseUrl}/macrocac/runs/${run_id}`)
      status = (await res.json()).status
      if (status === "succeeded") break
      await new Promise((r) => setTimeout(r, 15))
    }
    expect(status).toBe("succeeded")

    const reporte = await fetch(`${baseUrl}/macrocac/runs/${run_id}/reporte`)
    expect(reporte.status).toBe(200)
    expect(reporte.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    expect(reporte.headers.get("content-disposition")).toContain("reporte_bo.xlsx")

    const diff = await fetch(`${baseUrl}/macrocac/runs/${run_id}/reporte-diff`)
    expect(diff.status).toBe(200)
    expect(diff.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    expect(diff.headers.get("content-disposition")).toContain("reporte_bo_diff.xlsx")
  })
})
