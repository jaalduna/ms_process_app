import { Router } from "express"
import { verifyAppToken } from "./auth.js"
import {
  ELEG_DEFS, ELEG_REFERENCIA, IDPESOS, PESAJE_AJUSTES_DEFAULT, PESAJE_DEFS, PESAJE_REFERENCIA,
  paisesDe, planDe, regionesDe, simularEleg, simularPesaje, tablasDe, validacionesDe,
} from "../lib/iteracion-motor.js"

/**
 * Flujo iterativo de Elegibilidad y Pesaje — mock del contrato de ms-process-api `/iteracion`.
 * Contrato: specs/SPEC-iteracion.md (prefijo /api/v1/iteracion).
 *
 * - GET  /iteracion/:proceso/paises
 * - GET|POST /iteracion/:proceso/:pais/:periodo/preparacion
 * - GET  /iteracion/:proceso/:pais/:periodo/parametros
 * - POST /iteracion/:proceso/:pais/:periodo/simulacion
 * - GET|POST /iteracion/:proceso/:pais/:periodo/escenarios, POST …/escenarios/:id/elegir
 * - GET  /iteracion/:proceso/:pais/:periodo/publicacion, POST …/publicacion/{enviar,aprobar,devolver}
 *
 * Siempre `engine: "simulated"`: los resultados salen de `lib/iteracion-motor.js`. La preparación
 * termina sola de forma perezosa: cada lectura la da por `lista` cuando pasó su duración
 * (5 pasos de MOCK_STEP_INTERVAL_MS: 10 s normal, <1 s con mock:fast).
 */
const router = Router()

const STEP = () => Number(process.env.MOCK_STEP_INTERVAL_MS) || 2000
const DURACION_PREPARACION = () => 5 * STEP()
const ENGINE = "simulated"

const PROCESOS = {
  elegibilidad: {
    defs: ELEG_DEFS, referencia: ELEG_REFERENCIA, etiquetaReferencia: (periodo) => `Mes pasado (${anterior(periodo)})`,
    nombreReferencia: "Mes pasado", ajustesDefault: () => ({ regiones_cerradas: [] }),
    operar: ["admin", "eligibility_specialist"], aprobar: ["admin", "eligibility_approver"],
  },
  pesaje: {
    defs: PESAJE_DEFS, referencia: PESAJE_REFERENCIA, etiquetaReferencia: () => "Parámetros del país",
    nombreReferencia: "Parámetros del país", ajustesDefault: () => structuredClone(PESAJE_AJUSTES_DEFAULT),
    operar: ["admin", "weighting_specialist", "pesaje_specialist"], aprobar: ["admin", "weighting_approver"],
  },
}

function anterior(periodo) {
  const y = Number(periodo.slice(0, 4))
  const m = Number(periodo.slice(4))
  return m === 1 ? `${y - 1}12` : `${y}${String(m - 1).padStart(2, "0")}`
}

// ---------------------------------------------------------------------------
// Estado en memoria, por proceso|país|período
// ---------------------------------------------------------------------------

const estados = new Map()

export function resetIteracion() {
  estados.clear()
}

function clave(proceso, pais, periodo) {
  return `${proceso}|${pais}|${periodo}`
}

function estadoDe(proceso, pais, periodo) {
  const k = clave(proceso, pais, periodo)
  if (!estados.has(k)) {
    const def = PROCESOS[proceso]
    const ajustes = def.ajustesDefault()
    const sim = simular(proceso, pais, periodo, { ...def.referencia }, ajustes)
    estados.set(k, {
      prep: { estado: "sin_preparar", iniciado_ms: null, preparado_en: null, version: 0 },
      seq: 1,
      escenarios: [{
        id: "e1", nombre: def.nombreReferencia, es_referencia: true, creado_por: "sistema", creado_en: new Date().toISOString(),
        parametros: { ...def.referencia }, ajustes, resumen: sim.kpis, _tot: sim._tot,
      }],
      elegido_id: "e1",
      pub: { estado: "borrador", destino: proceso === "pesaje" ? "sql" : null, enviado_por: null, aprobado_por: null, bitacora: [] },
    })
  }
  const st = estados.get(k)
  if (st.prep.estado === "preparando" && Date.now() - st.prep.iniciado_ms >= DURACION_PREPARACION()) {
    st.prep.estado = "lista"
    st.prep.version += 1
    st.prep.preparado_en = new Date(st.prep.iniciado_ms + DURACION_PREPARACION()).toISOString()
  }
  return st
}

function simular(proceso, pais, periodo, parametros, ajustes) {
  return proceso === "elegibilidad"
    ? simularEleg(pais, periodo, parametros, ajustes)
    : simularPesaje(pais, periodo, parametros, ajustes)
}

// ---------------------------------------------------------------------------
// Usuario, errores y validación
// ---------------------------------------------------------------------------

/** Mismo criterio que /auth/me: JWT de la app → claims; dev bypass / sin token → admin de desarrollo. */
function requestUser(req) {
  const authHeader = req.headers.authorization ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
  if (token && token !== "dev-bypass-token") {
    const claims = verifyAppToken(token)
    if (!claims) return null
    return { email: claims.email, name: claims.name ?? claims.email, roles: claims.roles ?? [], countries: claims.countries ?? [] }
  }
  return { email: "dev@localhost", name: "Dev User", roles: ["admin"], countries: ["*"] }
}

const tieneRol = (user, roles) => user.roles.some((r) => roles.includes(String(r).toLowerCase()))
const esAdmin = (user) => tieneRol(user, ["admin"])

class ErrorHttp extends Error {
  constructor(status, error, message) {
    super(message)
    this.status = status
    this.error = error
  }
}
const fallo = (status, error, message) => { throw new ErrorHttp(status, error, message) }

/** Envuelve un handler: resuelve usuario, proceso, país y período, y traduce ErrorHttp a {error, message}. */
function handler(fn, { roles = "operar", conPais = true } = {}) {
  return (req, res) => {
    try {
      const user = requestUser(req)
      if (!user) fallo(401, "invalid_token", "JWT verification failed")
      const { proceso } = req.params
      const def = PROCESOS[proceso]
      if (!def) fallo(404, "proceso_desconocido", `Proceso desconocido: ${proceso}`)
      if (!tieneRol(user, def.operar) && !tieneRol(user, def.aprobar)) {
        fallo(403, "forbidden", `Required role(s): ${def.operar.join(", ")}`)
      }
      if (roles === "operar" && !tieneRol(user, def.operar)) {
        fallo(403, "forbidden", `Required role(s): ${def.operar.join(", ")}`)
      }
      if (roles === "aprobar" && !tieneRol(user, def.aprobar)) {
        fallo(403, "forbidden", `Required role(s): ${def.aprobar.join(", ")}`)
      }
      const ctx = { user, proceso, def }
      if (conPais) {
        const { pais, periodo } = req.params
        if (!paisesDe(proceso).some((p) => p.id === pais)) fallo(404, "pais_desconocido", `País desconocido para ${proceso}: ${pais}`)
        if (!/^\d{4}(0[1-9]|1[0-2])$/.test(periodo)) fallo(422, "periodo_invalido", `Período inválido: ${periodo} (AAAAMM)`)
        const base = pais.replace(/_ooh$/, "")
        if (!user.countries.includes("*") && !user.countries.includes(base)) fallo(403, "forbidden", `Sin acceso a ${base}`)
        Object.assign(ctx, { pais, periodo, st: estadoDe(proceso, pais, periodo) })
      }
      res.status(200)
      const body = fn(ctx, req, res)
      res.json(body)
    } catch (e) {
      if (e instanceof ErrorHttp) return res.status(e.status).json({ error: e.error, message: e.message })
      throw e
    }
  }
}

function validarParametros(def, parametros) {
  if (parametros != null && (typeof parametros !== "object" || Array.isArray(parametros))) {
    fallo(422, "parametros_invalidos", "`parametros` debe ser un objeto")
  }
  const entrada = parametros ?? {}
  for (const k of Object.keys(entrada)) {
    if (!def.defs.some((d) => d.clave === k)) fallo(422, "parametro_desconocido", `Parámetro desconocido: ${k}`)
  }
  const out = { ...def.referencia }
  for (const d of def.defs) {
    if (!(d.clave in entrada)) continue
    const v = entrada[d.clave]
    if (d.tipo === "booleano") {
      if (typeof v !== "boolean") fallo(422, "parametro_invalido", `${d.clave} debe ser verdadero o falso`)
    } else {
      if (typeof v !== "number" || !Number.isFinite(v)) fallo(422, "parametro_invalido", `${d.clave} debe ser un número`)
      if (d.tipo === "entero" && !Number.isInteger(v)) fallo(422, "parametro_invalido", `${d.clave} debe ser entero`)
      if (v < d.min - 1e-9 || v > d.max + 1e-9) fallo(422, "fuera_de_rango", `${d.clave} = ${v} fuera de rango [${d.min}, ${d.max}]`)
    }
    out[d.clave] = v
  }
  return out
}

function validarAjustes(proceso, pais, ajustes) {
  const a = ajustes ?? {}
  if (typeof a !== "object" || Array.isArray(a)) fallo(422, "ajustes_invalidos", "`ajustes` debe ser un objeto")
  if (proceso === "elegibilidad") {
    const cerradas = a.regiones_cerradas ?? []
    if (!Array.isArray(cerradas)) fallo(422, "ajustes_invalidos", "regiones_cerradas debe ser una lista")
    const ids = regionesDe(pais).map((r) => r[0])
    const malas = cerradas.filter((c) => !ids.includes(c))
    if (malas.length) fallo(422, "region_desconocida", `Regiones desconocidas: ${malas.join(", ")}`)
    return { regiones_cerradas: [...new Set(cerradas)] }
  }
  const idpesos = a.idpesos ?? PESAJE_AJUSTES_DEFAULT.idpesos
  const vetadas = a.juntas_vetadas ?? []
  if (!Array.isArray(idpesos) || idpesos.length === 0) fallo(422, "ajustes_invalidos", "idpesos debe ser una lista no vacía")
  const validos = IDPESOS.map((i) => i[0])
  const malos = idpesos.filter((i) => !validos.includes(String(i)))
  if (malos.length) fallo(422, "idpeso_desconocido", `IdPesos desconocidos: ${malos.join(", ")}`)
  if (!Array.isArray(vetadas)) fallo(422, "ajustes_invalidos", "juntas_vetadas debe ser una lista")
  return {
    idpesos: validos.filter((i) => idpesos.map(String).includes(i)),
    juntas_vetadas: [...new Set(vetadas.map(String))],
  }
}

function exigirLista(st) {
  if (st.prep.estado !== "lista") fallo(409, "sin_preparar", "Los datos de este país y período no están preparados")
}

// ---------------------------------------------------------------------------
// Vistas
// ---------------------------------------------------------------------------

function vistaPreparacion(ctx) {
  const { proceso, pais, periodo, st } = ctx
  const lista = st.prep.estado === "lista"
  return {
    proceso, pais, periodo, engine: ENGINE,
    estado: st.prep.estado,
    preparado_en: st.prep.preparado_en,
    version_silver: lista ? `v${st.prep.version}` : null,
    fuente: "Snapshot bronze prd · 03-oct 08:12",
    tablas: tablasDe(proceso, pais, lista),
    validaciones: validacionesDe(proceso, pais, periodo),
    dependencias: dependenciasDe(proceso, pais, periodo),
  }
}

function dependenciasDe(proceso, pais, periodo) {
  if (proceso !== "pesaje" || pais.endsWith("_ooh")) return []
  const eleg = estados.get(clave("elegibilidad", pais, periodo))
  const publicada = eleg?.pub.estado === "publicada"
  return [{
    proceso: "elegibilidad",
    estado: publicada ? "publicada" : "pendiente",
    detalle: publicada
      ? `MorDom ${periodo} aprobado por ${eleg.pub.aprobado_por}`
      : `Elegibilidad de ${periodo} todavía no está publicada`,
  }]
}

function vistaEscenario(e) {
  return {
    id: e.id, nombre: e.nombre, es_referencia: e.es_referencia, creado_por: e.creado_por, creado_en: e.creado_en,
    parametros: e.parametros, ajustes: e.ajustes, resumen: e.resumen,
  }
}

function vistaPublicacion(ctx) {
  const { proceso, pais, periodo, st, user, def } = ctx
  const pub = st.pub
  const esc = st.escenarios.find((e) => e.id === st.elegido_id) ?? null
  const plan = esc ? planDe(proceso, pais, periodo, esc._tot, pub.destino) : []
  const enviado = pub.estado !== "borrador"
  const aprobado = pub.estado === "publicada"
  const chequeos = proceso === "elegibilidad"
    ? [
      { texto: "Prueba sin escribir contra SQL: sin errores", nivel: "ok" },
      { texto: esc ? `Parámetros versionados con el escenario «${esc.nombre}»` : "Sin escenario elegido", nivel: esc ? "ok" : "pendiente" },
    ]
    : [
      { texto: "Error final bajo la meta en todos los IdPesos", nivel: esc && esc._tot.peorError < 0.001 ? "ok" : "aviso" },
      { texto: esc && esc._tot.outliers === 0 ? "Sin outliers" : `${esc?._tot.outliers ?? 0} outliers: se publican marcados`, nivel: esc && esc._tot.outliers === 0 ? "ok" : "aviso" },
    ]
  chequeos.push(
    { texto: enviado ? `Enviado por ${pub.enviado_por}` : "Enviado por el analista", nivel: enviado ? "ok" : "pendiente" },
    { texto: aprobado ? `Aprobado por ${pub.aprobado_por}` : "Aprobado por el responsable", nivel: aprobado ? "ok" : "pendiente" },
  )
  const puedeAprobar = pub.estado === "pendiente" && tieneRol(user, def.aprobar) && (esAdmin(user) || pub.enviado_por !== user.email)
  return {
    estado: pub.estado, engine: ENGINE,
    escenario_id: st.elegido_id, destino: pub.destino,
    plan, chequeos,
    enviado_por: pub.enviado_por, aprobado_por: pub.aprobado_por,
    puede_enviar: pub.estado === "borrador" && tieneRol(user, def.operar) && st.prep.estado === "lista" && esc !== null,
    puede_aprobar: puedeAprobar,
    bitacora: pub.bitacora.slice().reverse(),
  }
}

function anotar(st, user, texto) {
  st.pub.bitacora.push({ en: new Date().toISOString(), usuario: user.email, texto })
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

const BASE = "/iteracion/:proceso/:pais/:periodo"

router.get("/iteracion/:proceso/paises", handler(({ proceso }) => ({ paises: paisesDe(proceso) }), { roles: "leer", conPais: false }))

router.get(`${BASE}/preparacion`, handler((ctx) => vistaPreparacion(ctx), { roles: "leer" }))

router.post(`${BASE}/preparacion`, handler((ctx, _req, res) => {
  const { st } = ctx
  const deps = dependenciasDe(ctx.proceso, ctx.pais, ctx.periodo)
  if (deps.some((d) => d.estado !== "publicada")) {
    fallo(409, "dependencia_pendiente", deps.find((d) => d.estado !== "publicada").detalle)
  }
  if (st.prep.estado !== "preparando") {
    st.prep.estado = "preparando"
    st.prep.iniciado_ms = Date.now()
  }
  res.status(202)
  return vistaPreparacion(ctx)
}))

router.get(`${BASE}/parametros`, handler(({ proceso, def, periodo }) => ({
  definiciones: def.defs,
  valores: { ...def.referencia },
  referencia: { etiqueta: def.etiquetaReferencia(periodo), valores: { ...def.referencia } },
  ajustes: def.ajustesDefault(),
  idpesos: proceso === "pesaje" ? IDPESOS.map(([id, nombre]) => ({ id, nombre })) : null,
}), { roles: "leer" }))

router.post(`${BASE}/simulacion`, handler((ctx, req) => {
  const { proceso, pais, periodo, def, st } = ctx
  exigirLista(st)
  const parametros = validarParametros(def, req.body?.parametros)
  const ajustes = validarAjustes(proceso, pais, req.body?.ajustes)
  const sim = simular(proceso, pais, periodo, parametros, ajustes)
  return { engine: ENGINE, duracion_ms: sim.duracion_ms, generado_en: new Date().toISOString(), kpis: sim.kpis, resultado: sim.resultado }
}))

router.get(`${BASE}/escenarios`, handler(({ st }) => ({
  escenarios: st.escenarios.map(vistaEscenario), elegido_id: st.elegido_id,
}), { roles: "leer" }))

router.post(`${BASE}/escenarios`, handler((ctx, req, res) => {
  const { proceso, pais, periodo, def, st, user } = ctx
  exigirLista(st)
  const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim() : ""
  if (!nombre) fallo(422, "nombre_requerido", "El escenario necesita un nombre")
  const parametros = validarParametros(def, req.body?.parametros)
  const ajustes = validarAjustes(proceso, pais, req.body?.ajustes)
  const sim = simular(proceso, pais, periodo, parametros, ajustes)
  st.seq += 1
  const esc = {
    id: `e${st.seq}`, nombre, es_referencia: false, creado_por: user.email, creado_en: new Date().toISOString(),
    parametros, ajustes, resumen: sim.kpis, _tot: sim._tot,
  }
  st.escenarios.push(esc)
  res.status(201)
  return vistaEscenario(esc)
}))

router.post(`${BASE}/escenarios/:id/elegir`, handler(({ st, user }, req) => {
  const esc = st.escenarios.find((e) => e.id === req.params.id)
  if (!esc) fallo(404, "escenario_no_encontrado", `Escenario no encontrado: ${req.params.id}`)
  if (st.pub.estado === "publicada") fallo(409, "estado_invalido", "La publicación de este período ya está cerrada")
  if (st.elegido_id !== esc.id && st.pub.estado === "pendiente") {
    st.pub.estado = "borrador"
    st.pub.enviado_por = null
    anotar(st, user, `Se eligió «${esc.nombre}»; el envío pendiente vuelve a borrador`)
  }
  st.elegido_id = esc.id
  return { elegido_id: esc.id }
}))

router.get(`${BASE}/publicacion`, handler((ctx) => vistaPublicacion(ctx), { roles: "leer" }))

router.post(`${BASE}/publicacion/enviar`, handler((ctx, req) => {
  const { proceso, st, user } = ctx
  exigirLista(st)
  if (st.pub.estado !== "borrador") fallo(409, "estado_invalido", `No se puede enviar desde «${st.pub.estado}»`)
  const esc = st.escenarios.find((e) => e.id === req.body?.escenario_id)
  if (!esc) fallo(404, "escenario_no_encontrado", `Escenario no encontrado: ${req.body?.escenario_id}`)
  if (proceso === "pesaje") {
    const destino = req.body?.destino ?? st.pub.destino
    if (!["sql", "kronos"].includes(destino)) fallo(422, "destino_invalido", "destino debe ser «sql» o «kronos»")
    st.pub.destino = destino
  } else if (req.body?.destino != null) {
    fallo(422, "destino_invalido", "Elegibilidad no usa destino")
  }
  st.elegido_id = esc.id
  st.pub.estado = "pendiente"
  st.pub.enviado_por = user.email
  anotar(st, user, `Escenario «${esc.nombre}» enviado a aprobación`)
  return vistaPublicacion(ctx)
}))

router.post(`${BASE}/publicacion/aprobar`, handler((ctx) => {
  const { st, user } = ctx
  if (st.pub.estado !== "pendiente") fallo(409, "estado_invalido", `No hay un envío pendiente (estado «${st.pub.estado}»)`)
  if (!esAdmin(user) && st.pub.enviado_por === user.email) fallo(403, "auto_aprobacion", "No puedes aprobar tu propio envío")
  const esc = st.escenarios.find((e) => e.id === st.elegido_id)
  st.pub.estado = "publicada"
  st.pub.aprobado_por = user.email
  anotar(st, user, `Aprobado «${esc.nombre}». (simulado) no se escribió en SQL`)
  return vistaPublicacion(ctx)
}, { roles: "aprobar" }))

router.post(`${BASE}/publicacion/devolver`, handler((ctx, req) => {
  const { st, user } = ctx
  const comentario = typeof req.body?.comentario === "string" ? req.body.comentario.trim() : ""
  if (!comentario) fallo(422, "comentario_requerido", "Para devolver hay que dejar un comentario")
  if (st.pub.estado !== "pendiente") fallo(409, "estado_invalido", `No hay un envío pendiente (estado «${st.pub.estado}»)`)
  st.pub.estado = "borrador"
  st.pub.enviado_por = null
  anotar(st, user, `Devuelto: «${comentario}»`)
  return vistaPublicacion(ctx)
}, { roles: "aprobar" }))

export default router
