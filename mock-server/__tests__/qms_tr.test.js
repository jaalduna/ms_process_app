import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import express from "express"
import qmsTrRouter, { resetQmsTrJobs } from "../routes/qms_tr.js"

// JAA-1401: mock del contrato QMS-TR de ms-process-api (JAA-1400).
describe("QMS-TR API (mock-server, JAA-1401)", () => {
  let server
  let baseUrl
  const ORIG = { step: process.env.MOCK_STEP_INTERVAL_MS, wait: process.env.MOCK_QMSTR_WAIT_MS }
  const PASADO = "2026-09-11T11:00:00Z"
  const FUTURO = new Date(Date.now() + 3 * 24 * 3_600_000).toISOString()

  beforeAll(async () => {
    process.env.MOCK_STEP_INTERVAL_MS = "20"
    process.env.MOCK_QMSTR_WAIT_MS = "60"
    const app = express()
    app.use(express.json())
    app.use("/api/v1", qmsTrRouter)
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}/api/v1`
        resolve()
      })
    })
  })

  afterEach(() => resetQmsTrJobs())

  afterAll(async () => {
    for (const [k, v] of [["MOCK_STEP_INTERVAL_MS", ORIG.step], ["MOCK_QMSTR_WAIT_MS", ORIG.wait]]) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    await new Promise((resolve) => server.close(resolve))
  })

  const post = (path, body) =>
    fetch(`${baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) })

  async function esperar(runId, estados, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs
    let run
    while (Date.now() < deadline) {
      run = await (await fetch(`${baseUrl}/qms_tr/runs/${runId}`)).json()
      if (estados.includes(run.status)) return run
      await new Promise((r) => setTimeout(r, 15))
    }
    throw new Error(`timeout esperando ${estados}; último ${run?.status}`)
  }

  it("resuelve el snapshot de J de un instante pasado", async () => {
    const r = await fetch(`${baseUrl}/qms_tr/snapshots/resolve?country=colombia&at=${encodeURIComponent(PASADO)}`)
    const s = await r.json()
    expect(s.status).toBe("ready")
    expect(new Date(s.j.timestamp).getTime()).toBeGreaterThanOrEqual(new Date(PASADO).getTime())
    expect(s.tables.length).toBeGreaterThan(1)
  })

  it("un instante futuro queda en espera con el ciclo esperado", async () => {
    const s = await (await fetch(`${baseUrl}/qms_tr/snapshots/resolve?country=colombia&at=${encodeURIComponent(FUTURO)}`)).json()
    expect(s.status).toBe("waiting")
    expect(new Date(s.expected_j_at).getTime()).toBeGreaterThanOrEqual(new Date(FUTURO).getTime())
  })

  it("rechaza instantes sin zona horaria", async () => {
    const r = await fetch(`${baseUrl}/qms_tr/snapshots/resolve?country=colombia&at=2026-09-11T11:00`)
    expect(r.status).toBe(422)
  })

  it("corrida completa: pasos en orden, rama de grandes omitida, descarga y validación", async () => {
    const r = await post("/qms_tr/runs", { country: "colombia", at: PASADO, mes_procesamiento: "202608", force_outcome: "pass" })
    expect(r.status).toBe(201)
    const creada = await r.json()
    expect(creada.status).toBe("running")
    const run = await esperar(creada.run_id, ["completed"])
    expect(run.steps.map((s) => s.name)).toEqual(["silver_builder", "panelistas", "prep", "motor_grandes", "motor_normales", "entrega"])
    expect(run.steps.find((s) => s.name === "motor_grandes").status).toBe("cancelled")
    expect(run.run_page_url).toContain("/run/")

    const { url } = await (await fetch(`${baseUrl}/qms_tr/runs/${run.run_id}/download-url`)).json()
    const zip = await fetch(`http://localhost:${server.address().port}${url}`)
    expect(zip.status).toBe(200)
    expect(zip.headers.get("content-disposition")).toContain(`qms_tr_colombia_${run.run_tag}.zip`)

    const v = await (await post(`/qms_tr/runs/${run.run_id}/validate`)).json()
    expect(v.validacion.by_sheet.factores.pending).toBe(1)
  })

  it("instante futuro: waiting_snapshot y luego parte sola", async () => {
    const creada = await (await post("/qms_tr/runs", { country: "brasil", at: FUTURO, mes_procesamiento: "202608" })).json()
    expect(creada.status).toBe("waiting_snapshot")
    const run = await esperar(creada.run_id, ["running", "completed"])
    expect(run.snapshot.status).toBe("ready")
  })

  it("409 con otra corrida activa del mismo país y mes", async () => {
    const primera = await (await post("/qms_tr/runs", { country: "chile", at: PASADO, mes_procesamiento: "202608" })).json()
    const r = await post("/qms_tr/runs", { country: "chile", at: PASADO, mes_procesamiento: "202608" })
    expect(r.status).toBe(409)
    expect((await r.json()).run_id).toBe(primera.run_id)
  })

  it("descarga antes de terminar es 409", async () => {
    const creada = await (await post("/qms_tr/runs", { country: "peru", at: FUTURO, mes_procesamiento: "202608" })).json()
    expect((await fetch(`${baseUrl}/qms_tr/runs/${creada.run_id}/download-url`)).status).toBe(409)
  })

  it("cancelar una corrida en espera", async () => {
    const creada = await (await post("/qms_tr/runs", { country: "ecuador", at: FUTURO, mes_procesamiento: "202608" })).json()
    const c = await (await post(`/qms_tr/runs/${creada.run_id}/cancel`)).json()
    expect(c.status).toBe("cancelled")
  })
})
