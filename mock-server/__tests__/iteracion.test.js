import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import express from "express"
import jwt from "jsonwebtoken"
import router, { resetIteracion } from "../routes/iteracion.js"

// Flujo iterativo de Elegibilidad y Pesaje (specs/SPEC-iteracion.md), motor simulado.
describe("iteración Elegibilidad y Pesaje (mock-server)", () => {
  let server
  let base
  const ORIG = process.env.MOCK_STEP_INTERVAL_MS
  const SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production"
  const token = (email, roles, countries = ["*"]) => jwt.sign({ email, name: email, roles, countries }, SECRET)
  const ANALISTA = token("ana@example.com", ["eligibility_specialist"])
  const APROBADOR = token("resp@example.com", ["eligibility_approver"])
  const PESAJE = token("pe@example.com", ["weighting_specialist"])

  beforeAll(async () => {
    process.env.MOCK_STEP_INTERVAL_MS = "2"
    const app = express()
    app.use(express.json())
    app.use("/api/v1", router)
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        base = `http://localhost:${server.address().port}/api/v1/iteracion`
        resolve()
      })
    })
  })
  beforeEach(() => resetIteracion())
  afterAll(async () => {
    if (ORIG === undefined) delete process.env.MOCK_STEP_INTERVAL_MS
    else process.env.MOCK_STEP_INTERVAL_MS = ORIG
    await new Promise((resolve) => server.close(resolve))
  })

  const headers = (tk) => ({ "Content-Type": "application/json", ...(tk ? { Authorization: `Bearer ${tk}` } : {}) })
  const get = (p, tk) => fetch(`${base}${p}`, { headers: headers(tk) }).then(async (r) => ({ status: r.status, body: await r.json() }))
  const post = (p, body, tk) =>
    fetch(`${base}${p}`, { method: "POST", headers: headers(tk), body: JSON.stringify(body ?? {}) })
      .then(async (r) => ({ status: r.status, body: await r.json() }))
  const preparar = async (ruta, tk) => {
    await post(`${ruta}/preparacion`, {}, tk)
    const fin = Date.now() + 2000
    while (Date.now() < fin) {
      const { body } = await get(`${ruta}/preparacion`, tk)
      if (body.estado === "lista") return body
      await new Promise((r) => setTimeout(r, 5))
    }
    throw new Error("la preparación no terminó")
  }

  const ELEG = "/elegibilidad/brasil/202610"
  const PES = "/pesaje/brasil/202610"

  it("lista países por proceso; pesaje suma los paneles OOH", async () => {
    const { body: eleg } = await get("/elegibilidad/paises")
    expect(eleg.paises).toHaveLength(9)
    expect(eleg.paises.every((p) => p.panel === "hogares")).toBe(true)
    const { body: pes } = await get("/pesaje/paises")
    expect(pes.paises.filter((p) => p.panel === "ooh").map((p) => p.id)).toEqual(["brasil_ooh", "mexico_ooh"])
  })

  it("preparación: sin_preparar → preparando (202) → lista, con engine simulado", async () => {
    const { body: inicial } = await get(`${ELEG}/preparacion`)
    expect(inicial).toMatchObject({ estado: "sin_preparar", engine: "simulated", version_silver: null, dependencias: [] })
    const { status, body } = await post(`${ELEG}/preparacion`)
    expect(status).toBe(202)
    expect(body.estado).toBe("preparando")
    const lista = await preparar(ELEG)
    expect(lista.version_silver).toBe("v1")
    expect(lista.tablas.every((t) => t.estado === "lista")).toBe(true)
  })

  it("simular exige datos preparados y valida rangos", async () => {
    expect((await post(`${ELEG}/simulacion`, { parametros: {} })).body.error).toBe("sin_preparar")
    await preparar(ELEG)
    const fuera = await post(`${ELEG}/simulacion`, { parametros: { f_ok: 1.5 } })
    expect(fuera.status).toBe(422)
    expect(fuera.body.error).toBe("fuera_de_rango")
    expect((await post(`${ELEG}/simulacion`, { parametros: { inventado: 1 } })).status).toBe(422)
    expect((await post(`${ELEG}/simulacion`, { ajustes: { regiones_cerradas: ["XX"] } })).status).toBe(422)
  })

  it("simulación de elegibilidad: regiones de Brasil, cerrar una región no imputa en ella", async () => {
    await preparar(ELEG)
    const { body } = await post(`${ELEG}/simulacion`, { parametros: { f_ok: 0.9 }, ajustes: { regiones_cerradas: ["NE"] } })
    expect(body.engine).toBe("simulated")
    const { resultado } = body
    expect(resultado.tipo).toBe("elegibilidad")
    expect(resultado.regiones.reduce((a, r) => a + r.ideal, 0)).toBe(11298)
    const ne = resultado.regiones.find((r) => r.id === "NE")
    expect(ne).toMatchObject({ imputados: 0, estado: "cerrada" })
    expect(resultado.tendencia).toHaveLength(13)
    expect(resultado.tendencia.at(-1)).toMatchObject({ periodo: "202610", actual: true })
    expect(resultado.tendencia[0].periodo).toBe("202510")
    expect(resultado.comparaciones).toHaveLength(3)
    expect(body.kpis.map((k) => k.id)).toEqual(["imputados", "pct_imputado", "regiones_ok", "reemplazos"])
    expect(resultado.revision.hogares_imputar).toBe(body.kpis[0].valor)
  })

  it("más usos por donante imputa más hogares", async () => {
    await preparar(ELEG)
    const pocos = await post(`${ELEG}/simulacion`, { parametros: { n_rep_strict: 1, n_rep_flex: 1 } })
    const muchos = await post(`${ELEG}/simulacion`, { parametros: { n_rep_strict: 5, n_rep_flex: 5 } })
    expect(muchos.body.resultado.revision.hogares_imputar).toBeGreaterThan(pocos.body.resultado.revision.hogares_imputar)
  })

  it("parámetros: definiciones con tipos y referencia del mes pasado", async () => {
    const { body } = await get(`${ELEG}/parametros`)
    expect(body.definiciones.map((d) => d.clave)).toEqual(["f_ok", "f_fill_strict", "f_fill_flex", "n_rep_strict", "n_rep_flex", "actos_bajo"])
    expect(body.referencia.etiqueta).toBe("Mes pasado (202609)")
    const { body: pes } = await get(`${PES}/parametros`)
    expect(pes.definiciones.find((d) => d.clave === "CORRECAO_BOUNDS").tipo).toBe("booleano")
  })

  it("escenarios: nace la referencia elegida; crear re-simula y guarda el resumen", async () => {
    const { body: inicial } = await get(`${ELEG}/escenarios`)
    expect(inicial.elegido_id).toBe("e1")
    expect(inicial.escenarios[0]).toMatchObject({ es_referencia: true, nombre: "Mes pasado" })
    await preparar(ELEG)
    expect((await post(`${ELEG}/escenarios`, { nombre: "  " })).status).toBe(422)
    const { status, body } = await post(`${ELEG}/escenarios`, { nombre: "Sin Nordeste", parametros: { f_ok: 0.92 }, ajustes: { regiones_cerradas: ["NE"] } })
    expect(status).toBe(201)
    expect(body).toMatchObject({ id: "e2", es_referencia: false, creado_por: "dev@localhost" })
    expect(body.resumen[0].id).toBe("imputados")
    expect((await post(`${ELEG}/escenarios/e2/elegir`)).body).toEqual({ elegido_id: "e2" })
    expect((await post(`${ELEG}/escenarios/e9/elegir`)).status).toBe(404)
  })

  it("publicación: analista envía, no se aprueba a sí mismo, el responsable aprueba", async () => {
    await preparar(ELEG, ANALISTA)
    const { body: borrador } = await get(`${ELEG}/publicacion`, ANALISTA)
    expect(borrador).toMatchObject({ estado: "borrador", puede_enviar: true, puede_aprobar: false, destino: null })
    expect(borrador.plan.map((p) => p.tabla)).toContain("J_AtosCompra_New")

    const enviado = await post(`${ELEG}/publicacion/enviar`, { escenario_id: "e1" }, ANALISTA)
    expect(enviado.body).toMatchObject({ estado: "pendiente", enviado_por: "ana@example.com" })
    expect((await post(`${ELEG}/publicacion/aprobar`, {}, ANALISTA)).status).toBe(403)

    const vistaResp = await get(`${ELEG}/publicacion`, APROBADOR)
    expect(vistaResp.body.puede_aprobar).toBe(true)
    const aprobado = await post(`${ELEG}/publicacion/aprobar`, {}, APROBADOR)
    expect(aprobado.body).toMatchObject({ estado: "publicada", aprobado_por: "resp@example.com" })
    expect(aprobado.body.bitacora[0].texto).toMatch(/\(simulado\) no se escribió en SQL/)
    expect((await post(`${ELEG}/publicacion/aprobar`, {}, APROBADOR)).body.error).toBe("estado_invalido")
  })

  it("devolver exige comentario y vuelve a borrador; elegir otro escenario anula el envío", async () => {
    await preparar(ELEG)
    await post(`${ELEG}/publicacion/enviar`, { escenario_id: "e1" })
    expect((await post(`${ELEG}/publicacion/devolver`, { comentario: "" })).status).toBe(422)
    const devuelto = await post(`${ELEG}/publicacion/devolver`, { comentario: "revisar Nordeste" })
    expect(devuelto.body.estado).toBe("borrador")
    expect(devuelto.body.bitacora[0].texto).toBe("Devuelto: «revisar Nordeste»")

    await post(`${ELEG}/escenarios`, { nombre: "Otra" })
    await post(`${ELEG}/publicacion/enviar`, { escenario_id: "e1" })
    await post(`${ELEG}/escenarios/e2/elegir`)
    expect((await get(`${ELEG}/publicacion`)).body).toMatchObject({ estado: "borrador", escenario_id: "e2" })
  })

  it("roles: sin rol del proceso → 403; el aprobador no puede simular", async () => {
    expect((await get(`${ELEG}/preparacion`, PESAJE)).status).toBe(403)
    expect((await post(`${ELEG}/preparacion`, {}, APROBADOR)).status).toBe(403)
    expect((await get(`${ELEG}/preparacion`, APROBADOR)).status).toBe(200)
  })

  it("pesaje depende de Elegibilidad publicada; OOH no", async () => {
    const { body } = await get(`${PES}/preparacion`)
    expect(body.dependencias).toEqual([expect.objectContaining({ proceso: "elegibilidad", estado: "pendiente" })])
    const bloqueado = await post(`${PES}/preparacion`)
    expect(bloqueado.status).toBe(409)
    expect(bloqueado.body.error).toBe("dependencia_pendiente")

    await preparar(ELEG)
    await post(`${ELEG}/publicacion/enviar`, { escenario_id: "e1" })
    await post(`${ELEG}/publicacion/aprobar`)
    expect((await preparar(PES)).dependencias[0].estado).toBe("publicada")

    const ooh = await get("/pesaje/mexico_ooh/202610/preparacion")
    expect(ooh.body.dependencias).toEqual([])
    expect((await post("/pesaje/mexico_ooh/202610/preparacion")).status).toBe(202)
  })

  it("simulación de pesaje: filas por IdPeso, juntas vetables, unidad individuo en OOH", async () => {
    await preparar("/pesaje/brasil_ooh/202610")
    const ruta = "/pesaje/brasil_ooh/202610"
    const { body } = await post(`${ruta}/simulacion`, {
      parametros: { CORRECAO_BOUNDS: false, P_BOUNDS: 5, F_BOUNDS: 1 },
      ajustes: { idpesos: ["1", "7"] },
    })
    const r = body.resultado
    expect(r).toMatchObject({ tipo: "pesaje", unidad: "individuo", meta_error: 0.00001 })
    expect(r.idpesos.map((i) => i.nombre)).toEqual(["Mensual", "Ult12"])
    expect(r.juntas.length).toBeGreaterThan(0)
    expect(r.histograma.anterior).toHaveLength(10)
    expect(r.histograma.periodo_anterior).toBe("202609")

    const vetada = await post(`${ruta}/simulacion`, {
      parametros: { CORRECAO_BOUNDS: false, P_BOUNDS: 5, F_BOUNDS: 1 },
      ajustes: { idpesos: ["1"], juntas_vetadas: ["j1"] },
    })
    expect(vetada.body.resultado.juntas[0].vetada).toBe(true)
    expect(vetada.body.resultado.idpesos[0].juntas).toBe(r.idpesos[0].juntas - 1)

    expect((await post(`${ruta}/simulacion`, { parametros: { CORRECAO_BOUNDS: 1 } })).status).toBe(422)
    expect((await post(`${ruta}/simulacion`, { ajustes: { idpesos: [] } })).status).toBe(422)
  })

  it("pesaje: enviar con destino kronos cambia el plan", async () => {
    const ruta = "/pesaje/mexico_ooh/202610"
    await preparar(ruta, PESAJE)
    expect((await post(`${ruta}/publicacion/enviar`, { escenario_id: "e1", destino: "ftp" }, PESAJE)).status).toBe(422)
    const { body } = await post(`${ruta}/publicacion/enviar`, { escenario_id: "e1", destino: "kronos" }, PESAJE)
    expect(body).toMatchObject({ estado: "pendiente", destino: "kronos" })
    expect(body.plan[0].tabla).toBe("Excel para Kronos")
  })

  it("errores de ruta: proceso, país y período", async () => {
    expect((await get("/calibracion/paises")).status).toBe(404)
    expect((await get("/elegibilidad/brasil_ooh/202610/preparacion")).body.error).toBe("pais_desconocido")
    expect((await get("/elegibilidad/brasil/202613/preparacion")).body.error).toBe("periodo_invalido")
  })
})
