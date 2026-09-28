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

  /** Pollea el run hasta el estado pedido, como hace la UI. */
  async function waitForStatus(runId, status) {
    for (let i = 0; i < 50; i++) {
      const res = await fetch(`${baseUrl}/macrocac/runs/${runId}`)
      const body = await res.json()
      if (body.status === status) return body
      await new Promise((r) => setTimeout(r, 15))
    }
    throw new Error(`El run ${runId} nunca llegó a '${status}'.`)
  }

  // -------------------------------------------------------------------------
  // Catálogos — tablas, motivos, plantilla
  // -------------------------------------------------------------------------

  it("lista las tablas de la base del país, con los patrones que las trajeron", async () => {
    const res = await fetch(`${baseUrl}/macrocac/tablas?pais=BO`)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.pais).toBe("BO")
    expect(body.items.length).toBeGreaterThan(0)
    expect(body.items.every((t) => t.base === "BO_KWP")).toBe(true)
    // Solo la convención acordada y las oficiales: nada de _bkp.
    expect(body.items.map((t) => t.tabla)).toContain("_test_j_atoscompra_new_v1")
    expect(body.items.every((t) => !t.tabla.startsWith("_bkp"))).toBe(true)
    expect(body.patrones.length).toBeGreaterThan(0)
  })

  it("las tablas dependen del país: cada una sale de la base de su país", async () => {
    const res = await fetch(`${baseUrl}/macrocac/tablas?pais=CL`)
    const body = await res.json()

    expect(body.items.every((t) => t.base === "CL_KWP")).toBe(true)
    // j_atoscompra_new_rd es exacta y solo existe en RD.
    expect(body.items.map((t) => t.tabla)).not.toContain("j_atoscompra_new_rd")
  })

  it("RD solo ve su tabla oficial, no la de CAM/PNC (comparten CAM_KWP)", async () => {
    const rd = await (await fetch(`${baseUrl}/macrocac/tablas?pais=RD`)).json()
    const nombresRd = rd.items.map((t) => t.tabla)
    expect(nombresRd).toContain("j_atoscompra_new_rd")
    expect(nombresRd).not.toContain("j_atoscompra_new")

    const cam = await (await fetch(`${baseUrl}/macrocac/tablas?pais=CAM`)).json()
    const nombresCam = cam.items.map((t) => t.tabla)
    expect(nombresCam).toContain("j_atoscompra_new")
    expect(nombresCam).not.toContain("j_atoscompra_new_rd")
  })

  it("tablas con un país desconocido devuelve 400", async () => {
    const res = await fetch(`${baseUrl}/macrocac/tablas?pais=XX`)
    expect(res.status).toBe(400)
  })

  it("sirve el catálogo A_FlgMotivo con sus 9 filas", async () => {
    const res = await fetch(`${baseUrl}/macrocac/motivos?pais=BO`)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.items).toHaveLength(9)
    // El id es lo que la auditoría guarda en Flg_Motivo; la descripción es la
    // etiqueta. Confundirlos es lo que dejó 12.163 filas en "Otros".
    expect(body.items[0]).toEqual({ flg_motivo: 1, descricao: "EVA" })
    expect(body.items.map((m) => m.flg_motivo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(body.stale).toBe(false)
  })

  it("sirve la plantilla de correcciones como xlsx descargable", async () => {
    const res = await fetch(`${baseUrl}/macrocac/plantilla`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-disposition")).toContain("plantilla_correcciones.xlsx")
  })

  it("exige el motivo de formulario solo si hay filas sin MotivoCambio", async () => {
    const res = await fetch(uploadUrl({ filename: "correcciones-sin-motivo.xlsx" }), {
      method: "POST",
    })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe("motivo_requerido")
    expect(body.filas_sin_motivo).toBeGreaterThan(0)

    // Con el motivo elegido, la misma subida pasa y queda como fallback.
    const params = new URLSearchParams({
      filename: "correcciones-sin-motivo.xlsx",
      pais: "BO",
      tabla: "j_atoscompra_new",
      motivo: "5",
    })
    const conMotivo = await fetch(`${baseUrl}/macrocac/uploads?${params}`, { method: "POST" })
    expect(conMotivo.status).toBe(201)
    const upload = await conMotivo.json()
    expect(upload.flg_motivo).toBe(5)
    expect(upload.filas_sin_motivo).toBeGreaterThan(0)
  })

  it("la sonda HEAD del reporte responde igual que el GET", async () => {
    process.env.MOCK_STEP_INTERVAL_MS = "20"
    const upload = await uploadValid()
    const res = await fetch(`${baseUrl}/macrocac/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_id: upload.upload_id }),
    })
    const { run_id } = await res.json()

    // Mientras corre, 409: es lo que la UI usa para no ofrecer la descarga.
    const antes = await fetch(`${baseUrl}/macrocac/runs/${run_id}/reporte`, { method: "HEAD" })
    expect(antes.status).toBe(409)

    await waitForStatus(run_id, "succeeded")

    const despues = await fetch(`${baseUrl}/macrocac/runs/${run_id}/reporte`, { method: "HEAD" })
    expect(despues.status).toBe(200)
  })

  // -------------------------------------------------------------------------
  // Uploads
  // -------------------------------------------------------------------------

  it("valid upload returns 201 with the correcciones_bo.xlsx-shaped envelope", async () => {
    const body = await uploadValid()
    expect(body.upload_id).toBeTruthy()
    expect(body.filename).toBe("correcciones_bo.xlsx")
    expect(body.pais).toBe("BO")
    expect(body.tabla).toBe("j_atoscompra_new")
    // El motivo manda por fila (columna MotivoCambio); el del formulario es
    // solo el fallback de las filas que la traen vacía, así que es null cuando
    // no se envía y el archivo no lo necesita.
    expect(body.motivo).toBeNull()
    expect(body.flg_motivo).toBeNull()
    expect(body.filas_sin_motivo).toBe(0)
    expect(Array.isArray(body.motivos_resumen)).toBe(true)
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
    // "AR" ya NO sirve de ejemplo: los países son los 10 del motor canónico.
    const res = await fetch(uploadUrl({ pais: "XX" }), { method: "POST" })
    expect(res.status).toBe(400)
  })

  it("upload with an unknown tabla returns 400", async () => {
    const res = await fetch(uploadUrl({ tabla: "not_a_table" }), { method: "POST" })
    expect(res.status).toBe(400)
  })

  // -------------------------------------------------------------------------
  // Runs — create, dedupe, 404
  // -------------------------------------------------------------------------

  it("creates a run with 201 — y NO es dry-run", async () => {
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
    // El motor canónico no tiene modo simulación: aplica los UPDATE/DELETE y
    // hace COMMIT. El mock imita ese contrato, no un dry-run inexistente.
    expect(body.dry_run).toBe(false)
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
      expect(["M", "E", "X"]).toContain(row.accion)
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
