import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import express from "express"
import router, { resetQmstrFlujo } from "../routes/qmstr_flujo.js"

// JAA-1435: mock del contrato del flujo automático de QMS-TR (docs/SPEC_flujo_qmstr_v1.1.md §2).
describe("flujo QMS-TR (mock-server, JAA-1435)", () => {
  let server
  let base
  const ORIG = process.env.MOCK_STEP_INTERVAL_MS

  beforeAll(async () => {
    process.env.MOCK_STEP_INTERVAL_MS = "5"
    const app = express()
    app.use(express.json())
    app.use("/api/v1", router)
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        base = `http://localhost:${server.address().port}/api/v1/qmstr_flujo`
        resolve()
      })
    })
  })
  beforeEach(() => resetQmstrFlujo())
  afterAll(async () => {
    if (ORIG === undefined) delete process.env.MOCK_STEP_INTERVAL_MS
    else process.env.MOCK_STEP_INTERVAL_MS = ORIG
    await new Promise((resolve) => server.close(resolve))
  })

  const get = (p) => fetch(`${base}${p}`).then(async (r) => ({ status: r.status, body: await r.json() }))
  const post = (p, body) =>
    fetch(`${base}${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) })
      .then(async (r) => ({ status: r.status, body: await r.json() }))
  const esperar = async (fn, ms = 3000) => {
    const fin = Date.now() + ms
    while (Date.now() < fin) {
      const v = await fn()
      if (v) return v
      await new Promise((r) => setTimeout(r, 20))
    }
    throw new Error("timeout")
  }

  it("estado, países y períodos con los conteos de hitos", async () => {
    const { body: estado } = await get("/estado")
    expect(estado).toMatchObject({ enabled: true, modo: "simulacion", paises: ["EC", "BO"], intervalo_segundos: 300 })
    const { body: paises } = await get("/paises")
    expect(paises[0]).toEqual({ codigo: "EC", nombre: "ecuador", etiqueta: "Ecuador" })
    const { body: periodos } = await get("/periodos?pais=EC")
    expect(periodos).toHaveLength(6)
    expect(periodos[0]).toEqual({ periodo: "202609", h3: 100, h4: 95, h10: 0, tandas: 4 })
  })

  it("tablero de Ecuador 202609: 103 bases en todos los estados", async () => {
    const { body: bases } = await get("/bases?pais=EC&periodo=202609")
    expect(bases).toHaveLength(103)
    const cuenta = bases.reduce((acc, b) => ({ ...acc, [b.estado]: (acc[b.estado] ?? 0) + 1 }), {})
    expect(cuenta).toEqual({ aplicada: 35, bypass: 1, revertida: 2, en_proceso: 48, pendiente: 7, retenida: 5, sin_hito4: 3, fuera_de_alcance: 2 })
    const enCurso = bases.find((b) => b.tanda_estado === "corriendo")
    expect(enCurso.historial[0].evento).toMatch(/tanda 4/)
  })

  it("períodos cerrados: todas las bases aplicadas", async () => {
    const { body: bases } = await get("/bases?pais=BO&periodo=202608")
    expect(bases).toHaveLength(58)
    expect(new Set(bases.map((b) => b.estado))).toEqual(new Set(["aplicada"]))
  })

  it("la tanda trae snapshot_desde y, una vez terminada, el progreso final guardado", async () => {
    const { body: tandas } = await get("/tandas?pais=EC&periodo=202609")
    expect(tandas.find((t) => t.estado === "corriendo")).toMatchObject({ progreso: null, snapshot_desde: expect.any(String) })
    const cerrada = tandas.find((t) => t.estado === "cerrada" && t.tipo !== "reversion")
    expect(cerrada.progreso).toMatchObject({ estado: "TERMINATED", porcentaje: 100 })
  })

  it("la tanda corriendo entrega progreso Databricks con for_each", async () => {
    const { body: tandas } = await get("/tandas?pais=EC&periodo=202609&estado=corriendo")
    expect(tandas).toHaveLength(1)
    const { body: p } = await get(`/tandas/${tandas[0].id}/progreso`)
    expect(p.estado).toBe("RUNNING")
    expect(p.porcentaje).toBeGreaterThanOrEqual(35)
    expect(p.productos_total).toBe(26)
    const motor = p.tareas.find((t) => t.clave === "motor_normales")
    expect(motor.for_each.total).toBe(23)
    expect(p.run_page_url).toMatch(/^https:\/\//)
  })

  it("override manual: valida hito 4, choques y fuera de alcance; luego corre y llega a DQ", async () => {
    const { body: bases } = await get("/bases?pais=EC&periodo=202609")
    const pend = bases.filter((b) => b.estado === "pendiente").map((b) => b.producto)
    const ret = bases.find((b) => b.estado === "retenida").producto
    const ocupada = bases.find((b) => b.tanda_estado === "corriendo").producto

    expect((await post("/tandas", { pais: "EC", periodo: "202609", productos: [] })).status).toBe(422)
    expect((await post("/tandas", { pais: "EC", periodo: "202609", productos: [701] })).body.message).toMatch(/fuera de alcance/)
    expect((await post("/tandas", { pais: "EC", periodo: "202609", productos: [ret] })).body).toMatchObject({ error: "validacion", message: expect.stringMatching(/hito 4/) })
    expect((await post("/tandas", { pais: "EC", periodo: "202609", productos: [ocupada] })).status).toBe(409)

    const { status, body: t } = await post("/tandas", {
      pais: "EC", periodo: "202609", productos: [...pend, ret], modo: "completo", forzar: true, nota: "prueba",
    })
    expect(status).toBe(201)
    expect(t).toMatchObject({ tipo: "manual", modo: "completo", estado: "detectada", numero: 5, creada_por: "dev@localhost" })
    expect(t.eventos[0].detalle).toMatch(/forzada sin hito 4/)
    const enDq = await esperar(async () => {
      const { body } = await get(`/tandas/${t.id}`)
      return body.estado === "en_dq" ? body : null
    }, 5000)
    expect(enDq.jira_key).toMatch(/^SIM-/)
    // como la API: el ticket queda resuelto y la tanda sigue en DQ hasta la vuelta siguiente
    const { body: resuelta } = await post(`/tandas/${t.id}/simular_cierre_ticket`)
    expect(resuelta.estado).toBe("en_dq")
    expect(t).toMatchObject({ nota: "prueba", ejecucion: "simulacion" })
    await esperar(async () => (await get(`/tandas/${t.id}`)).body.estado === "cerrada")
    const { body: correos } = await get("/correos?pais=EC&periodo=202609")
    expect(correos.filter((c) => c.tanda_id === t.id).map((c) => c.tipo).sort()).toEqual(["pase_mtr", "resultados"])
  })

  it("override manual: una base aplicada da 409 en modo completo aunque venga forzar", async () => {
    const { body: bases } = await get("/bases?pais=EC&periodo=202609")
    const aplicada = bases.find((b) => b.estado === "aplicada").producto
    const { status, body } = await post("/tandas", { pais: "EC", periodo: "202609", productos: [aplicada], forzar: true })
    expect(status).toBe(409)
    expect(body).toMatchObject({ error: "conflict", message: `La base ${aplicada} ya tiene QMS-TR aplicado; revírtela antes de volver a correrla` })
    // en solo_correr no se aplica nada en J: se puede lanzar
    expect((await post("/tandas", { pais: "EC", periodo: "202609", productos: [aplicada], modo: "solo_correr" })).status).toBe(201)
  })

  it("revertir: solo bases del zip, una vez, y deja la base revertida", async () => {
    const { body: tandas } = await get("/tandas?pais=EC&periodo=202609&tipo=liberacion&estado=cerrada")
    const t1 = tandas[0]
    const base = t1.productos.find((p) => !t1.bypass.includes(p) && p !== 13 && p !== 21)
    expect((await post(`/tandas/${t1.id}/revertir`, { productos: [base], motivo: "" })).status).toBe(422)
    expect((await post(`/tandas/${t1.id}/revertir`, { productos: [t1.bypass[0]], motivo: "x" })).status).toBe(422)
    expect((await post(`/tandas/${t1.id}/revertir`, { productos: [13], motivo: "x" })).status).toBe(409)
    const { status, body: r } = await post(`/tandas/${t1.id}/revertir`, { productos: [base], motivo: "Pedido de DC" })
    expect(status).toBe(201)
    expect(r).toMatchObject({ tipo: "reversion", tanda_origen: t1.id })
    await esperar(async () => (await get(`/tandas/${r.id}`)).body.estado === "en_dq")
    await post(`/tandas/${r.id}/simular_cierre_ticket`)
    await esperar(async () => (await get(`/tandas/${r.id}`)).body.estado === "cerrada")
    const { body: bases } = await get("/bases?pais=EC&periodo=202609")
    expect(bases.find((b) => b.producto === base).estado).toBe("revertida")
  })

  it("solo correr: cierra sin correo ni ticket, no deja la base aplicada y no se puede revertir", async () => {
    const { body: bases } = await get("/bases?pais=EC&periodo=202609")
    const pend = bases.filter((b) => b.estado === "pendiente").map((b) => b.producto)
    const { body: t } = await post("/tandas", { pais: "EC", periodo: "202609", productos: pend, modo: "solo_correr" })
    const cerrada = await esperar(async () => {
      const { body } = await get(`/tandas/${t.id}`)
      return body.estado === "cerrada" ? body : null
    }, 5000)
    expect(cerrada.jira_key).toBeNull()
    const { body: correos } = await get("/correos?pais=EC&periodo=202609")
    expect(correos.filter((c) => c.tanda_id === t.id)).toEqual([])
    const { body: despues } = await get("/bases?pais=EC&periodo=202609")
    expect(new Set(despues.filter((b) => pend.includes(b.producto)).map((b) => b.estado))).toEqual(new Set(["pendiente"]))
    expect((await post(`/tandas/${t.id}/revertir`, { productos: [pend[0]], motivo: "x" })).status).toBe(409)
  })

  it("pausar congela la tanda y reanudar la suelta; reintentar saca de revisión manual", async () => {
    const { body: [bo] } = await get("/tandas?pais=BO&periodo=202609&estado=revision_manual")
    const { body: re } = await post(`/tandas/${bo.id}/reintentar`)
    expect(re.estado).toBe("verificando")
    // una corrida corta (paso de 5 ms => 900 ms): pausada, el progreso y el estado no se mueven
    const { body: bases } = await get("/bases?pais=EC&periodo=202609")
    const pend = bases.filter((b) => b.estado === "pendiente").map((b) => b.producto)
    const { body: t } = await post("/tandas", { pais: "EC", periodo: "202609", productos: pend })
    await esperar(async () => (await get(`/tandas/${t.id}`)).body.estado === "corriendo")
    expect((await post(`/tandas/${t.id}/pausar`)).body.pausada).toBe(true)
    expect((await post(`/tandas/${t.id}/pausar`)).status).toBe(409)
    const antes = (await get(`/tandas/${t.id}/progreso`)).body.porcentaje
    await new Promise((r) => setTimeout(r, 1200))
    expect((await get(`/tandas/${t.id}`)).body.estado).toBe("corriendo")
    expect((await get(`/tandas/${t.id}/progreso`)).body.porcentaje).toBe(antes)
    expect((await post(`/tandas/${t.id}/reanudar`)).body.pausada).toBe(false)
    await esperar(async () => (await get(`/tandas/${t.id}`)).body.estado === "en_dq", 5000)
  })

  it("zip: URL firmada solo cuando la tanda ya pasó la corrida", async () => {
    const { body: [ec] } = await get("/tandas?pais=EC&estado=corriendo")
    expect((await get(`/tandas/${ec.id}/zip`)).status).toBe(409)
    const { body: [cerrada] } = await get("/tandas?pais=EC&periodo=202609&estado=cerrada&tipo=liberacion")
    const { body } = await get(`/tandas/${cerrada.id}/zip`)
    expect(body.url).toMatch(/\/zip\/descarga\?token=/)
  })

  it("contrato de la API real: errores {error, message}, correos en llaves planas y reversión sólo de tandas cerradas", async () => {
    const { body: estado } = await get("/estado")
    expect(estado).toMatchObject({ activo: true, config_error: null, error_config: null })

    const { status, body: err } = await post("/tandas", { pais: "EC", periodo: "202613", productos: [1] })
    expect(status).toBe(422)
    expect(err).toMatchObject({ error: "validacion", message: expect.stringMatching(/AAAAMM/) })

    // la tanda 2 de EC está en DQ: la API no la revierte mientras sus bases siguen en curso
    const { body: [enDq] } = await get("/tandas?pais=EC&periodo=202609&estado=en_dq")
    const base = enDq.productos.find((p) => !enDq.bypass.includes(p))
    expect((await post(`/tandas/${enDq.id}/revertir`, { productos: [base], motivo: "x" })).status).toBe(409)
    const vacio = await post(`/tandas/${enDq.id}/revertir`, { productos: [base], motivo: "" })
    expect(vacio.status).toBe(422)
    expect(Array.isArray(vacio.body.detail)).toBe(true)

    const { body: bases } = await get("/bases?pais=EC&periodo=202609")
    const pend = bases.filter((b) => b.estado === "pendiente").map((b) => b.producto)
    const { body: t } = await post("/tandas", { pais: "EC", periodo: "202609", productos: pend })
    await esperar(async () => (await get(`/tandas/${t.id}`)).body.estado === "en_dq", 5000)
    await post(`/tandas/${t.id}/simular_cierre_ticket`)
    const cerrada = await esperar(async () => {
      const { body } = await get(`/tandas/${t.id}`)
      return body.estado === "cerrada" ? body : null
    }, 5000)
    expect(cerrada.correos).toMatchObject({
      resultados: expect.any(String), resultados_hilo: null, resultados_enviado: true,
      pase_mtr: expect.any(String), pase_mtr_hilo: null, pase_mtr_enviado: true,
    })
    const { body: correos } = await get("/correos?pais=EC&periodo=202609")
    const pase = correos.find((c) => c.id === cerrada.correos.pase_mtr)
    // en simulación no se busca el hilo de la liberación: sale como correo nuevo
    expect(pase).toMatchObject({ en_respuesta_a: null, enviado: false, asunto: `[QMS-TR] Ecuador 202609 · tanda ${t.numero} · pase a MTR` })
  })
})
