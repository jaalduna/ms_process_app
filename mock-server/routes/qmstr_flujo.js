import { Router } from "express"
import crypto from "crypto"

/**
 * Flujo automático de QMS-TR v1.1 (JAA-1435) — mock del contrato de ms-process-api `routes/qmstr_flujo.py`.
 * Contrato: docs/SPEC_flujo_qmstr_v1.1.md §2 (prefijo /api/v1/qmstr_flujo).
 *
 * - GET  /estado, /paises, /periodos?pais, /bases?pais&periodo
 * - GET  /tandas?pais&periodo&tipo&estado, /tandas/:tid, /tandas/:tid/progreso, /tandas/:tid/zip
 * - POST /tandas (override manual), /tandas/:tid/revertir, /tandas/:tid/{pausar,reanudar,reintentar}
 * - POST /tandas/:tid/simular_cierre_ticket, /vuelta
 * - GET  /avisos?pais&periodo
 *
 * Las tandas avanzan "solas" de forma perezosa: cada lectura las empuja por la máquina de estados según el
 * reloj (paso = MOCK_STEP_INTERVAL_MS). En `en_dq` esperan a que alguien simule el cierre del ticket, igual que
 * el JiraSimulado de la API. La corrida sembrada de Ecuador dura 20 min y parte al 35 %, así la vista siempre
 * tiene algo avanzando en vivo.
 */
const router = Router()

const STEP = () => Number(process.env.MOCK_STEP_INTERVAL_MS) || 2000
/** Duración de una corrida lanzada desde la UI (6 min con el paso normal, ~27 s con mock:fast). */
const DURACION_CORRIDA = () => 180 * STEP()
const MODO = () => (process.env.MOCK_QMSTR_MODO === "real" ? "real" : "simulacion")
const INTERVALO_S = 300
const USUARIO = "dev@localhost"

export const ESTADOS = ["detectada", "corriendo", "armando_reversion", "enviando", "en_dq", "verificando", "hito10",
  "cerrada", "revision_manual", "sin_bases"]
const ACTIVOS = new Set(["detectada", "corriendo", "armando_reversion", "enviando", "en_dq", "verificando", "hito10"])

const PAISES = [
  { codigo: "EC", nombre: "ecuador", etiqueta: "Ecuador", cod_asunto: "ECU" },
  { codigo: "BO", nombre: "bolivia", etiqueta: "Bolivia", cod_asunto: "BO" },
]
const PAIS = Object.fromEntries(PAISES.map((p) => [p.codigo, p]))
const FUERA_DE_ALCANCE = { EC: new Set([701, 702]), BO: new Set() }

const CATEGORIAS = [
  "Aceite", "Arroz", "Atún en conserva", "Azúcar", "Avena", "Bebidas energéticas", "Cerveza", "Café instantáneo",
  "Café molido", "Caldos", "Cereales listos", "Chocolate en polvo", "Chocolates", "Colados y picados", "Compotas",
  "Condimentos", "Crema dental", "Crema de leche", "Desodorante", "Detergente en polvo", "Detergente líquido",
  "Enjuague bucal", "Fideos", "Galletas dulces", "Galletas saladas", "Gaseosas", "Gelatina", "Harina", "Helados",
  "Insecticidas", "Jabón de lavar", "Jabón de tocador", "Jugos listos", "Ketchup", "Leche en polvo", "Leche líquida",
  "Leche saborizada", "Lavavajillas", "Limpiadores de piso", "Margarina", "Mayonesa", "Mermeladas", "Modificadores de leche",
  "Mostaza", "Néctares", "Pañales", "Pañitos húmedos", "Papel higiénico", "Pasta de tomate", "Pan de molde",
  "Queso fresco", "Quesos maduros", "Refrescos en polvo", "Salsa de soya", "Sal", "Sardinas", "Servilletas",
  "Shampoo", "Snacks salados", "Suavizante de ropa", "Toallas femeninas", "Toallas de cocina", "Té e infusiones",
  "Agua embotellada", "Agua saborizada", "Acondicionador", "Afeitadoras", "Alimento para perros", "Alimento para gatos",
  "Bebidas isotónicas", "Blanqueador", "Bolsas de basura", "Cloro", "Coladas", "Embutidos", "Endulzantes",
  "Esponjas", "Fórmulas infantiles", "Frijoles en conserva", "Granola", "Huevos", "Jamón", "Leche condensada",
  "Leche evaporada", "Mantequilla", "Maní", "Masa para pizza", "Palomitas", "Pan dulce", "Pasabocas", "Postres listos",
  "Protector solar", "Repelentes", "Salchichas", "Salsas para pasta", "Sopas instantáneas", "Tintes para cabello",
  "Tortillas", "Vinagre", "Vinos", "Yogur", "Ambientadores", "Cremas corporales", "Gel para cabello", "Talco",
]

const isoNow = () => new Date().toISOString()
const iso = (ms) => new Date(ms).toISOString()
const MIN = 60_000
const HORA = 60 * MIN

/** Hora de Chile con offset fijo -03:00 (octubre 2026, horario de verano). */
function chile(ano, mes, dia, hora, minuto = 0) {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}T${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:00-03:00`
}

/** Período anterior a AAAAMM. */
function anterior(periodo) {
  const y = Number(periodo.slice(0, 4))
  const m = Number(periodo.slice(4))
  return m === 1 ? `${y - 1}12` : `${y}${String(m - 1).padStart(2, "0")}`
}
/** Mes siguiente a AAAAMM como [año, mes] (la liberación de un período llega al mes siguiente). */
function siguiente(periodo) {
  const y = Number(periodo.slice(0, 4))
  const m = Number(periodo.slice(4))
  return m === 12 ? [y + 1, 1] : [y, m + 1]
}

const ENVIO_DQ = { asignado: true, adjunto: true, comentario: true, vinculo: true }
const PERIODO_ACTUAL = "202609"

// ---------------------------------------------------------------------------
// Estado en memoria
// ---------------------------------------------------------------------------

/** @type {{bases: Record<string, object[]>, tandas: Map<string, object>, avisos: object[], ultimaVuelta: string|null, resultado: object|null, jiraSeq: number}} */
let st

const claveBases = (pais, periodo) => `${pais}:${periodo}`

function nuevaTanda(campos) {
  const ahora = isoNow()
  return {
    id: crypto.randomUUID(), pais: campos.pais, periodo: campos.periodo, numero: campos.numero,
    categorias: campos.categorias ?? campos.productos, productos: campos.productos,
    h4_desde: campos.h4_desde, h4_hasta: campos.h4_hasta, estado: campos.estado ?? "detectada",
    estado_previo: campos.estado_previo ?? null, pausada: false, qms_run_id: campos.qms_run_id ?? null,
    jira_key: campos.jira_key ?? null, envio: campos.envio ?? {}, bypass: campos.bypass ?? [],
    validacion: campos.validacion ?? {}, error: campos.error ?? null, eventos: campos.eventos ?? [],
    created_at: campos.created_at ?? ahora, updated_at: campos.updated_at ?? ahora,
    tipo: campos.tipo ?? "liberacion", modo: campos.modo ?? "completo", creada_por: campos.creada_por ?? "qmstr_flujo",
    tanda_origen: campos.tanda_origen ?? null, snapshot_desde: campos.snapshot_desde ?? null, nota: campos.nota ?? null,
    // como la API: la tanda sólo avanza en el modo del flujo en que se creó
    ejecucion: campos.ejecucion ?? MODO(),
    // privados: reloj de la corrida y del próximo avance
    _corrida: campos._corrida ?? null, _sigEn: campos._sigEn ?? null,
  }
}

function publica(t) {
  const base = Object.fromEntries(Object.entries(t).filter(([k]) => !k.startsWith("_")))
  // como la API: el progreso final queda guardado en la tanda cuando la corrida terminó
  const terminada = t.qms_run_id && t.tipo !== "reversion" && t.estado !== "corriendo" && t.estado !== "detectada"
  return { ...base, progreso: terminada ? progreso(t) : null }
}

function evento(t, detalle, at = isoNow()) {
  t.eventos.push({ at, estado: t.estado, detalle })
  t.updated_at = at
}

function mover(t, estado, detalle, at = isoNow()) {
  t.estado = estado
  evento(t, detalle, at)
}

function nombreBase(pais, producto) {
  return st.bases[claveBases(pais, PERIODO_ACTUAL)]?.find((b) => b.producto === producto)?.nombre ?? `Producto ${producto}`
}

function filasPorHoja(n) {
  return { Imputaciones: n * 37, "Cantidad envasados": n * 2, Factores: n * 61, Exclusiones: n * 9 }
}

const MTR = { account_id: "712020:0ce95529-7fe5-44d3-8992-b22e3cfaa19d", nombre: "Alejandro Peña" }

/**
 * Aviso en el ticket de Jira (observador agregado o comentario con @mención). Como la API: en simulación no se
 * toca Jira, el aviso queda registrado con `publicado: false`.
 */
function aviso(t, tipo, at = isoNow()) {
  const p = PAIS[t.pais]
  const reversion = t.tipo === "reversion"
  const hechas = t.productos.filter((x) => !t.bypass.includes(x))
  const lista = hechas.slice(0, 6).map((x) => nombreBase(t.pais, x)).join(", ")
  const resto = hechas.length > 6 ? ` y ${hechas.length - 6} más` : ""
  const texto = {
    observadores: `Observadores agregados al ticket ${t.jira_key}.`,
    pase_mtr: `@${MTR.nombre} QMS-TR quedó aplicado y validado en las bases ${lista}${resto} de ${p.etiqueta}. Pueden seguir con MTR.`,
    reversion_aplicada: `@${MTR.nombre} La reversión de QMS-TR quedó aplicada en las bases ${lista}${resto} de ${p.etiqueta}.`,
  }[tipo]
  const a = {
    id: `${t.id}:${tipo}`, tanda_id: t.id, pais: t.pais, periodo: t.periodo, tipo, jira_key: t.jira_key, texto,
    destinatarios: [MTR], publicado: MODO() === "real", modo: MODO(), at,
  }
  st.avisos.push(a)
  t.envio = { ...t.envio, [tipo === "observadores" ? "observadores" : "aviso_mtr"]: true }
  return a
}

function nuevaJira() {
  st.jiraSeq += 1
  return MODO() === "simulacion" ? `SIM-${st.jiraSeq}` : `LAT-${4100 + st.jiraSeq}`
}

// ---------------------------------------------------------------------------
// Máquina de estados perezosa
// ---------------------------------------------------------------------------

function fraccion(t, ahora = Date.now()) {
  const c = t._corrida
  if (!c) return t.estado === "detectada" ? 0 : 1
  // pausada: el reloj de la corrida se congela en el instante de la pausa
  const efectivo = t.pausada && t._pausaEn ? t._pausaEn : ahora
  return Math.min(1, c.inicial + (efectivo - c.inicio) / c.duracion)
}

function avanzar(t) {
  const ahora = Date.now()
  for (let i = 0; i < 10; i++) {
    if (t.pausada || !t._sigEn && t.estado !== "corriendo") return
    if (t.estado === "corriendo") {
      if (t.pausada || fraccion(t, ahora) < 1) return
      const fin = t._corrida.inicio + (1 - t._corrida.inicial) * t._corrida.duracion
      if (t.modo === "solo_correr") {
        mover(t, "cerrada", "corrida terminada; modo solo correr: sin ticket, avisos ni hito 10", iso(fin))
        t._sigEn = null
        return
      }
      mover(t, "enviando", `corrida terminada (${t.productos.length} productos)`, iso(fin))
      t._sigEn = fin + 3 * STEP()
      continue
    }
    if (ahora < t._sigEn) return
    const at = iso(t._sigEn)
    switch (t.estado) {
      case "detectada":
        if (t.tipo === "reversion") {
          mover(t, "armando_reversion", "armando el zip inverso desde el snapshot pre de la corrida original", at)
          t._sigEn = t._sigEn + 4 * STEP()
        } else {
          t.qms_run_id = crypto.randomUUID()
          t._corrida = { inicio: t._sigEn, inicial: 0, duracion: DURACION_CORRIDA(), run_id: Math.floor(1e14 + Math.random() * 9e14) }
          mover(t, "corriendo", `corrida qms_tr_run lanzada (${t.productos.length} productos)`, at)
          t._sigEn = null
        }
        break
      case "armando_reversion":
        mover(t, "enviando", `zip de reversión listo (${t.productos.length} bases)`, at)
        t._sigEn = t._sigEn + 3 * STEP()
        break
      case "enviando":
        t.jira_key = t.jira_key ?? nuevaJira()
        t.envio = { asignado: true, adjunto: true, comentario: true, vinculo: true }
        aviso(t, "observadores", at)
        mover(t, "en_dq", `${t.jira_key} creado y asignado a DQ${MODO() === "simulacion" ? " (simulado)" : ""}; MTR agregado como observador`, at)
        t._sigEn = null // espera el cierre del ticket
        return
      case "en_dq":
        if (!t._ticketResuelto) return
        mover(t, "verificando", `${t.jira_key} resuelto${MODO() === "simulacion" ? " (simulado)" : ""}`, at)
        t._sigEn = t._sigEn + 2 * STEP()
        break
      case "verificando": {
        // como la API (validacion.Resultado.resumen): totales + detalle por hoja
        const ok = MODO() === "simulacion" ? 0 : 3
        const by_sheet = Object.fromEntries(["Imputaciones", "Cantidad envasados", "Factores", "Exclusiones"]
          .map((h) => [h, { total: 3, checked: 3, applied: ok, pending: 3 - ok, mismatched: 0 }]))
        t.validacion = MODO() === "simulacion"
          ? { status: "no_aplicado", checked: 12, applied: 0, pending: 12, mismatched: 0, validated_at: at, validated_by: "qmstr_flujo", by_sheet }
          : { status: "aplicado", checked: 12, applied: 12, pending: 0, mismatched: 0, validated_at: at, validated_by: "qmstr_flujo", by_sheet }
        mover(t, "hito10", MODO() === "simulacion"
          ? "verificación en J: no aplicado (esperable en simulación, DQ no aplicó nada); sigue a hito 10"
          : "cambios aplicados en J (12/12)", at)
        t._sigEn = t._sigEn + 2 * STEP()
        break
      }
      case "hito10": {
        t.envio = { ...t.envio, hito10: true }
        const n = t.productos.length - t.bypass.length
        const verbo = t.tipo === "reversion" ? "anulado" : "registrado"
        mover(t, "cerrada", MODO() === "simulacion"
          ? `hito 10 simulado: se habría ${verbo} en ${n} bases`
          : `hito 10 ${verbo} en ${n} bases`, at)
        if (t.modo === "completo") {
          aviso(t, t.tipo === "reversion" ? "reversion_aplicada" : "pase_mtr", at)
          evento(t, `aviso a MTR en ${t.jira_key}${MODO() === "simulacion" ? " (simulado)" : ""}`, at)
        }
        t._sigEn = null
        return
      }
      default:
        return
    }
  }
}

function tandas() {
  for (const t of st.tandas.values()) avanzar(t)
  return [...st.tandas.values()]
}

// ---------------------------------------------------------------------------
// Siembra
// ---------------------------------------------------------------------------

function sembrarPeriodoCerrado(pais, periodo, n) {
  const [y, m] = siguiente(periodo)
  const bases = CATEGORIAS.slice(0, n).map((nombre, i) => ({
    producto: 10 + i, nombre,
    h3: chile(y, m, 2, 10, i % 50), h4: chile(y, m, 3, 9, i % 50), h4_anulado: false,
    h10: chile(y, m, 6, 11, i % 50), fuera_de_alcance: false,
  }))
  st.bases[claveBases(pais, periodo)] = bases
  const productos = bases.map((b) => b.producto)
  const h4s = bases.map((b) => b.h4).sort()
  const t = nuevaTanda({
    pais, periodo, numero: 1, productos, h4_desde: h4s[0], h4_hasta: h4s.at(-1), estado: "cerrada",
    jira_key: `LAT-${3000 + Number(periodo.slice(4)) * 10 + (pais === "EC" ? 1 : 2)}`, qms_run_id: crypto.randomUUID(),
    envio: ENVIO_DQ, created_at: chile(y, m, 3, 10),
    updated_at: chile(y, m, 6, 11), validacion: { status: "aplicado", checked: 12, applied: 12, pending: 0, mismatched: 0 },
    eventos: [
      { at: chile(y, m, 3, 10), estado: "detectada", detalle: `liberación de ${n} bases` },
      { at: chile(y, m, 6, 11), estado: "cerrada", detalle: `hito 10 registrado en ${n} bases` },
    ],
  })
  st.tandas.set(t.id, t)
  aviso(t, "observadores", chile(y, m, 3, 10, 5))
  aviso(t, "pase_mtr", chile(y, m, 6, 11))
}

/**
 * Período actual (202609): bases repartidas en tandas en distintos estados. `plan` = lista de grupos
 * [cantidad, rol] en el orden de CATEGORIAS; los roles se resuelven abajo.
 */
function sembrarActual(pais, plan, extras = []) {
  const bases = []
  const grupos = {}
  let i = 0
  for (const [cantidad, rol, h4dia, h4hora] of plan) {
    grupos[rol] = []
    for (let k = 0; k < cantidad; k++, i++) {
      const producto = 10 + i
      const conH4 = !["retenida", "sin_hito4"].includes(rol)
      bases.push({
        producto, nombre: CATEGORIAS[i], h3: rol === "sin_hito4" ? null : chile(2026, 9, 26 + (i % 4), 9 + (i % 8), (i * 7) % 60),
        h4: conH4 ? chile(2026, 10, h4dia, h4hora, (k * 3) % 60) : null, h4_anulado: false, h10: null, fuera_de_alcance: false,
      })
      grupos[rol].push(producto)
    }
  }
  for (const [producto, nombre] of extras) {
    bases.push({ producto, nombre, h3: chile(2026, 9, 29, 15), h4: chile(2026, 10, 1, 9, 40), h4_anulado: false, h10: null,
      fuera_de_alcance: true })
  }
  st.bases[claveBases(pais, PERIODO_ACTUAL)] = bases
  return grupos
}

function rango(pais, productos) {
  const hs = st.bases[claveBases(pais, PERIODO_ACTUAL)].filter((b) => productos.includes(b.producto)).map((b) => b.h4).sort()
  return [hs[0], hs.at(-1)]
}

function sembrarEcuador() {
  const g = sembrarActual("EC", [
    [38, "t1", 1, 9], [22, "t2", 3, 10], [26, "t3", 6, 15], [7, "pendiente", 8, 9], [5, "retenida"], [3, "sin_hito4"],
  ], [[701, "Bebidas alcohólicas (importadas)"], [702, "Cigarrillos"]])
  const ahora = Date.now()

  const [d1, h1] = rango("EC", g.t1)
  const t1 = nuevaTanda({
    pais: "EC", periodo: PERIODO_ACTUAL, numero: 1, productos: g.t1, bypass: [g.t1[17]], h4_desde: d1, h4_hasta: h1,
    estado: "cerrada", jira_key: "SIM-1", qms_run_id: crypto.randomUUID(), created_at: chile(2026, 10, 1, 10, 5),
    envio: ENVIO_DQ,
    validacion: { status: "no_aplicado", checked: 12, applied: 0, pending: 12, mismatched: 0 },
    eventos: [
      { at: chile(2026, 10, 1, 10, 5), estado: "detectada", detalle: "liberación de 38 bases (hito 4 entre 09:00 y 09:56)" },
      { at: chile(2026, 10, 1, 10, 6), estado: "corriendo", detalle: "corrida qms_tr_run lanzada (38 productos)" },
      { at: chile(2026, 10, 1, 10, 48), estado: "enviando", detalle: "corrida terminada; 1 base sin cambios del motor queda en bypass" },
      { at: chile(2026, 10, 1, 10, 50), estado: "en_dq", detalle: "SIM-1 creado y asignado a DQ (simulado); MTR agregado como observador" },
      { at: chile(2026, 10, 2, 16, 12), estado: "verificando", detalle: "SIM-1 marcado como resuelto por dev@localhost" },
      { at: chile(2026, 10, 2, 16, 14), estado: "hito10", detalle: "verificación en J: no aplicado (esperable en simulación, DQ no aplicó nada); sigue a hito 10" },
      { at: chile(2026, 10, 2, 16, 15), estado: "cerrada", detalle: "hito 10 simulado: se habría registrado en 37 bases" },
    ],
  })
  st.tandas.set(t1.id, t1)
  aviso(t1, "observadores", chile(2026, 10, 1, 10, 50))
  aviso(t1, "pase_mtr", chile(2026, 10, 2, 16, 15))

  const [d2, h2] = rango("EC", g.t2)
  const t2 = nuevaTanda({
    pais: "EC", periodo: PERIODO_ACTUAL, numero: 2, productos: g.t2, h4_desde: d2, h4_hasta: h2, estado: "en_dq",
    jira_key: "SIM-2", qms_run_id: crypto.randomUUID(), created_at: chile(2026, 10, 3, 11, 2),
    envio: ENVIO_DQ,
    eventos: [
      { at: chile(2026, 10, 3, 11, 2), estado: "detectada", detalle: "liberación de 22 bases (hito 4 entre 10:00 y 10:57)" },
      { at: chile(2026, 10, 3, 11, 3), estado: "corriendo", detalle: "corrida qms_tr_run lanzada (22 productos)" },
      { at: chile(2026, 10, 3, 11, 31), estado: "enviando", detalle: "corrida terminada (22 productos)" },
      { at: chile(2026, 10, 3, 11, 33), estado: "en_dq", detalle: "SIM-2 creado y asignado a DQ (simulado); MTR agregado como observador" },
    ],
  })
  st.tandas.set(t2.id, t2)
  aviso(t2, "observadores", chile(2026, 10, 3, 11, 33))

  // reversión de 2 bases de la tanda 1, pedida por DC
  const revertidas = [g.t1[3], g.t1[11]]
  const tr = nuevaTanda({
    pais: "EC", periodo: PERIODO_ACTUAL, numero: 3, productos: revertidas, h4_desde: d1, h4_hasta: h1, estado: "cerrada",
    tipo: "reversion", tanda_origen: t1.id, creada_por: "joaquin.aldunate@numerator.com", jira_key: "SIM-3",
    created_at: chile(2026, 10, 4, 9, 20), envio: ENVIO_DQ,
    eventos: [
      { at: chile(2026, 10, 4, 9, 20), estado: "detectada", detalle: `reversión de ${revertidas.length} bases de la tanda 1 por joaquin.aldunate@numerator.com: Pedido de DC por correo 04/10` },
      { at: chile(2026, 10, 4, 9, 21), estado: "armando_reversion", detalle: "armando el zip inverso desde el snapshot pre de la corrida original" },
      { at: chile(2026, 10, 4, 9, 23), estado: "enviando", detalle: "zip de reversión listo (2 bases, 214 factores, 3 bajas de imputación)" },
      { at: chile(2026, 10, 4, 9, 24), estado: "en_dq", detalle: "SIM-3 creado y asignado a DQ (simulado); MTR agregado como observador" },
      { at: chile(2026, 10, 5, 12, 2), estado: "verificando", detalle: "SIM-3 marcado como resuelto por joaquin.aldunate@numerator.com" },
      { at: chile(2026, 10, 5, 12, 3), estado: "hito10", detalle: "J coincide con los valores pre en la muestra (12/12)" },
      { at: chile(2026, 10, 5, 12, 4), estado: "cerrada", detalle: "hito 10 simulado: se habría anulado en 2 bases" },
    ],
  })
  st.tandas.set(tr.id, tr)
  aviso(tr, "observadores", chile(2026, 10, 4, 9, 24))
  aviso(tr, "reversion_aplicada", chile(2026, 10, 5, 12, 4))

  // la que está corriendo ahora: 20 min de corrida, va en 35 %
  const [d3, h3] = rango("EC", g.t3)
  const duracion = 20 * MIN
  const inicio = ahora - 0.35 * duracion
  const t3 = nuevaTanda({
    pais: "EC", periodo: PERIODO_ACTUAL, numero: 4, productos: g.t3, h4_desde: d3, h4_hasta: h3, estado: "corriendo",
    qms_run_id: crypto.randomUUID(), created_at: iso(inicio - 2 * MIN), snapshot_desde: iso(inicio - 3 * 60 * MIN),
    _corrida: { inicio, inicial: 0, duracion, run_id: 731204558812734 },
    eventos: [
      { at: iso(inicio - 2 * MIN), estado: "detectada", detalle: "liberación de 26 bases (hito 4 entre 15:00 y 15:57)" },
      { at: iso(inicio), estado: "corriendo", detalle: "corrida qms_tr_run lanzada (26 productos)" },
    ],
  })
  st.tandas.set(t3.id, t3)
}

function sembrarBolivia() {
  const g = sembrarActual("BO", [
    [30, "t1", 2, 11], [15, "t2", 5, 16], [8, "pendiente", 8, 10], [4, "retenida"], [3, "sin_hito4"],
  ])
  const [d1, h1] = rango("BO", g.t1)
  const t1 = nuevaTanda({
    pais: "BO", periodo: PERIODO_ACTUAL, numero: 1, productos: g.t1, h4_desde: d1, h4_hasta: h1, estado: "revision_manual",
    estado_previo: "verificando", jira_key: "SIM-4", qms_run_id: crypto.randomUUID(), created_at: chile(2026, 10, 2, 12),
    envio: ENVIO_DQ,
    error: "verificación en J: parcial (8/12) — 3 factores pendientes y 1 distinto en Galletas dulces",
    validacion: { status: "parcial", checked: 12, applied: 8, pending: 3, mismatched: 1 },
    eventos: [
      { at: chile(2026, 10, 2, 12, 0), estado: "detectada", detalle: "liberación de 30 bases" },
      { at: chile(2026, 10, 2, 12, 1), estado: "corriendo", detalle: "corrida qms_tr_run lanzada (30 productos)" },
      { at: chile(2026, 10, 2, 12, 39), estado: "enviando", detalle: "corrida terminada (30 productos)" },
      { at: chile(2026, 10, 2, 12, 41), estado: "en_dq", detalle: "SIM-4 creado y asignado a DQ (simulado); MTR agregado como observador" },
      { at: chile(2026, 10, 6, 10, 15), estado: "verificando", detalle: "SIM-4 marcado como resuelto por dev@localhost" },
      { at: chile(2026, 10, 6, 10, 18), estado: "revision_manual", detalle: "verificación en J: parcial (8/12)" },
    ],
  })
  st.tandas.set(t1.id, t1)
  aviso(t1, "observadores", chile(2026, 10, 2, 12, 41))

  const [d2, h2] = rango("BO", g.t2)
  const t2 = nuevaTanda({
    pais: "BO", periodo: PERIODO_ACTUAL, numero: 2, productos: g.t2, h4_desde: d2, h4_hasta: h2, estado: "hito10",
    jira_key: "SIM-5", qms_run_id: crypto.randomUUID(), created_at: chile(2026, 10, 5, 17), pausada: false,
    envio: ENVIO_DQ,
    validacion: { status: "no_aplicado", checked: 12, applied: 0, pending: 12, mismatched: 0 },
    eventos: [
      { at: chile(2026, 10, 5, 17, 0), estado: "detectada", detalle: "liberación de 15 bases" },
      { at: chile(2026, 10, 5, 17, 1), estado: "corriendo", detalle: "corrida qms_tr_run lanzada (15 productos)" },
      { at: chile(2026, 10, 5, 17, 22), estado: "enviando", detalle: "corrida terminada (15 productos)" },
      { at: chile(2026, 10, 5, 17, 24), estado: "en_dq", detalle: "SIM-5 creado y asignado a DQ (simulado)" },
      { at: chile(2026, 10, 7, 9, 30), estado: "verificando", detalle: "SIM-5 marcado como resuelto por dev@localhost" },
      { at: chile(2026, 10, 7, 9, 31), estado: "hito10", detalle: "verificación en J: no aplicado (esperable en simulación)" },
    ],
  })
  t2.pausada = true
  t2._pausaEn = Date.now()
  t2._sigEn = Date.now()
  t2.eventos.push({ at: chile(2026, 10, 7, 9, 40), estado: "hito10", detalle: "pausada por dev@localhost: revisar con DC antes del hito 10" })
  st.tandas.set(t2.id, t2)
  aviso(t2, "observadores", chile(2026, 10, 5, 17, 24))
}

/** Período recién abierto: hito 3 en todas las bases y ninguna con hito 4 todavía (esperando liberación). */
function sembrarPeriodoSinHito4(pais, periodo, n) {
  const y = Number(periodo.slice(0, 4))
  const m = Number(periodo.slice(4))
  st.bases[claveBases(pais, periodo)] = CATEGORIAS.slice(0, n).map((nombre, i) => ({
    producto: 10 + i, nombre, h3: chile(y, m, 2, 10, i % 50), h4: null, h4_anulado: false, h10: null, fuera_de_alcance: false,
  }))
}

export function resetQmstrFlujo() {
  st = { bases: {}, tandas: new Map(), avisos: [], ultimaVuelta: iso(Date.now() - 3 * MIN), resultado: { EC: "ok", BO: "ok" }, jiraSeq: 5 }
  sembrarEcuador()
  sembrarBolivia()
  sembrarPeriodoSinHito4("BO", "202610", 40)
  for (const p of PAISES) {
    let per = PERIODO_ACTUAL
    for (let k = 0; k < 5; k++) {
      per = anterior(per)
      sembrarPeriodoCerrado(p.codigo, per, p.codigo === "EC" ? 101 : 58)
    }
  }
}
resetQmstrFlujo()

// ---------------------------------------------------------------------------
// Derivados
// ---------------------------------------------------------------------------

function tandasDe(pais, periodo) {
  return tandas()
    .filter((t) => t.pais === pais && t.periodo === periodo)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

function estadoBase(b, ts, hayH4Periodo) {
  if (b.fuera_de_alcance) return { estado: "fuera_de_alcance", tanda: null }
  // una tanda "solo correr" ya terminada no aplicó nada en J (sin zip a DQ ni hito 10): no cambia el estado de la base
  const conBase = ts.filter((t) => t.productos.includes(b.producto) && t.estado !== "sin_bases"
    && !(t.modo === "solo_correr" && !ACTIVOS.has(t.estado)))
  const ultima = conBase.at(-1) ?? null
  if (!b.h4 || b.h4_anulado) {
    if (ultima && ACTIVOS.has(ultima.estado)) return { estado: "en_proceso", tanda: ultima }
    // retenida = hito 3 sin hito 4 mientras otras bases del período ya tienen hito 4; si ninguna lo tiene, aún se espera la liberación
    return { estado: b.h3 ? (hayH4Periodo ? "retenida" : "esperando_liberacion") : "sin_hito4", tanda: ultima }
  }
  if (!ultima) return { estado: "pendiente", tanda: null }
  // re-liberación: hito 4 posterior al último procesado
  const procesadas = conBase.filter((t) => t.tipo !== "reversion")
  const ultimoH4 = procesadas.map((t) => t.h4_hasta).sort().at(-1)
  if (ultimoH4 && new Date(b.h4) > new Date(ultimoH4) && !ACTIVOS.has(ultima.estado)) return { estado: "pendiente", tanda: ultima }
  if (ACTIVOS.has(ultima.estado) || ultima.estado === "revision_manual") return { estado: "en_proceso", tanda: ultima }
  if (ultima.tipo === "reversion") return { estado: "revertida", tanda: ultima }
  if (ultima.bypass.includes(b.producto)) return { estado: "bypass", tanda: ultima }
  return { estado: "aplicada", tanda: ultima }
}

function basesDe(pais, periodo) {
  const ts = tandasDe(pais, periodo)
  const bs = st.bases[claveBases(pais, periodo)] ?? []
  const hayH4Periodo = bs.some((b) => b.h4 && !b.h4_anulado)
  return bs.map((b) => {
    const { estado, tanda } = estadoBase(b, ts, hayH4Periodo)
    const historial = ts.filter((t) => t.productos.includes(b.producto)).flatMap((t) => {
      const tipo = { liberacion: "liberación", manual: "manual", reversion: "reversión" }[t.tipo]
      const evs = [{ at: t.created_at, tanda_id: t.id, tipo: t.tipo, evento: `entró a la tanda ${t.numero} (${tipo})` }]
      const cierre = t.eventos.findLast((e) => e.estado === "cerrada")
      if (cierre) evs.push({ at: cierre.at, tanda_id: t.id, tipo: t.tipo, evento: cierre.detalle })
      return evs
    })
    return {
      ...b, estado, tanda_id: tanda?.id ?? null, tanda_numero: tanda?.numero ?? null, tanda_estado: tanda?.estado ?? null,
      jira_key: tanda?.jira_key ?? null, historial,
    }
  })
}

const TAREAS = ["silver_builder", "panelistas", "prep", "hay_grandes", "hay_normales", "motor_grandes", "motor_normales", "entrega"]
/** Tramos [desde, hasta] de cada tarea sobre la fracción de la corrida. */
const TRAMOS = {
  silver_builder: [0, 0.08], panelistas: [0.08, 0.12], prep: [0.12, 0.2], hay_grandes: [0.2, 0.2], hay_normales: [0.2, 0.2],
  motor_grandes: [0.2, 0.9], motor_normales: [0.2, 0.9], entrega: [0.9, 1],
}

function progreso(t) {
  const c = t._corrida
  const total = t.productos.length
  const grandes = Math.min(3, total)
  const normales = total - grandes
  const terminada = t.estado !== "corriendo" && t.estado !== "detectada"
  const f = terminada ? 1 : fraccion(t)
  const inicioMs = c ? c.inicio - c.inicial * c.duracion : new Date(t.created_at).getTime() + MIN
  const duracion = c ? c.duracion : 40 * MIN
  const at = (x) => iso(inicioMs + x * duracion)
  const flaky = total >= 4 && [...String(t.id)].reduce((h, ch) => h + ch.charCodeAt(0), 0) % 2 === 0
  const tareas = TAREAS.map((clave) => {
    const [a, b] = TRAMOS[clave]
    const estado = f >= b && (f > a || b === a) ? "SUCCESS" : f >= a ? "RUNNING" : "PENDING"
    const tarea = { clave, estado, inicio: f >= a ? at(a) : null, fin: estado === "SUCCESS" ? at(b) : null }
    if (clave === "motor_grandes" || clave === "motor_normales") {
      const n = clave === "motor_grandes" ? grandes : normales
      const avance = Math.max(0, Math.min(1, (f - a) / (b - a)))
      // los grandes tardan más: van un poco detrás
      const completadas = Math.min(n, Math.floor(n * (clave === "motor_grandes" ? avance ** 1.3 : avance)))
      // algunas tandas simulan 1 iteración fallida en motor_normales (el producto queda en bypass)
      const fallidas = clave === "motor_normales" && flaky && completadas >= 2 ? 1 : 0
      const ok = completadas - fallidas
      tarea.for_each = { total: n, completadas: ok, fallidas, activas: estado === "RUNNING" ? Math.min(8, n - completadas) : 0 }
    }
    return tarea
  })
  const listos = tareas.filter((x) => x.for_each).reduce((s, x) => s + x.for_each.completadas, 0)
  const fallidos = tareas.filter((x) => x.for_each).reduce((s, x) => s + x.for_each.fallidas, 0)
  const runId = c?.run_id ?? 905118273340012
  return {
    run_id: runId, estado: f >= 1 ? "TERMINATED" : "RUNNING",
    run_page_url: `https://adb-2125673683576002.2.azuredatabricks.net/#job/476494422826160/run/${runId}`,
    inicio: at(0), fin: f >= 1 ? at(1) : null, productos_total: total, productos_listos: listos, productos_fallidos: fallidos,
    porcentaje: Math.round(f * 100), tareas,
  }
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

/** Como la API: su handler de HTTPException aplana el detail a `{error, message}`. */
function error(res, status, code, message, extra = {}) {
  return res.status(status).json({ error: code, message, ...extra })
}

function buscar(req, res) {
  const t = st.tandas.get(req.params.tid)
  if (!t) {
    error(res, 404, "not_found", `Tanda ${req.params.tid} no existe`)
    return null
  }
  avanzar(t)
  return t
}

router.get("/qmstr_flujo/estado", (_req, res) => {
  res.json({
    enabled: true, modo: MODO(), paises: PAISES.map((p) => p.codigo), intervalo_segundos: INTERVALO_S,
    ultima_vuelta: st.ultimaVuelta, resultado: st.resultado, error_config: null, activo: true, config_error: null,
  })
})

router.get("/qmstr_flujo/paises", (_req, res) => {
  res.json(PAISES.map(({ codigo, nombre, etiqueta }) => ({ codigo, nombre, etiqueta })))
})

router.get("/qmstr_flujo/periodos", (req, res) => {
  const pais = String(req.query.pais ?? "")
  if (!PAIS[pais]) return error(res, 422, "pais_invalido", `País no configurado en el flujo: '${pais}'`)
  const periodos = [...new Set(Object.keys(st.bases).filter((k) => k.startsWith(`${pais}:`)).map((k) => k.split(":")[1]))]
    .sort().reverse().slice(0, 6)
  res.json(periodos.map((periodo) => {
    const bs = st.bases[claveBases(pais, periodo)]
    return {
      periodo, h3: bs.filter((b) => b.h3).length, h4: bs.filter((b) => b.h4 && !b.h4_anulado).length,
      h10: bs.filter((b) => b.h10).length, tandas: tandasDe(pais, periodo).length,
    }
  }))
})

router.get("/qmstr_flujo/bases", (req, res) => {
  const pais = String(req.query.pais ?? "")
  const periodo = String(req.query.periodo ?? "")
  if (!PAIS[pais]) return error(res, 422, "pais_invalido", `País no configurado en el flujo: '${pais}'`)
  if (!/^\d{6}$/.test(periodo)) return error(res, 422, "validacion", "periodo debe ser AAAAMM")
  res.json(basesDe(pais, periodo))
})

router.get("/qmstr_flujo/tandas", (req, res) => {
  const { pais, periodo, tipo, estado } = req.query
  const items = tandas()
    .filter((t) => (!pais || t.pais === pais) && (!periodo || t.periodo === periodo) && (!tipo || t.tipo === tipo)
      && (!estado || t.estado === estado))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(publica)
  res.json(items)
})

router.get("/qmstr_flujo/tandas/:tid", (req, res) => {
  const t = buscar(req, res)
  if (t) res.json(publica(t))
})

router.post("/qmstr_flujo/tandas", (req, res) => {
  const { pais, periodo, productos, modo = "completo", forzar = false, nota = "" } = req.body ?? {}
  if (!PAIS[pais]) return error(res, 422, "pais_invalido", `País no configurado en el flujo: '${pais}'`)
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(String(periodo ?? ""))) return error(res, 422, "validacion", "El período debe ser AAAAMM")
  if (!Array.isArray(productos) || productos.length === 0 || !productos.every(Number.isInteger)) {
    return error(res, 422, "validacion", "Elige al menos una base")
  }
  if (!["completo", "solo_correr"].includes(modo)) return error(res, 422, "validacion", `Modo desconocido: '${modo}'`)
  const bases = st.bases[claveBases(pais, periodo)]
  if (!bases) return error(res, 422, "validacion", `No hay hitos de ${PAIS[pais].etiqueta} para ${periodo}`)
  const porId = new Map(bases.map((b) => [b.producto, b]))
  const desconocidas = productos.filter((p) => !porId.has(p))
  if (desconocidas.length) return error(res, 422, "validacion", `Bases que no existen en ${periodo}: ${desconocidas.join(", ")}`)
  const fuera = productos.filter((p) => FUERA_DE_ALCANCE[pais].has(p))
  if (fuera.length) return error(res, 422, "validacion", `Bases fuera de alcance de QMS-TR: ${fuera.join(", ")}`)
  const estados = new Map(basesDe(pais, periodo).map((b) => [b.producto, b.estado]))
  const aplicadas = modo === "completo" ? productos.filter((p) => estados.get(p) === "aplicada") : []
  if (aplicadas.length) {
    const lista = aplicadas.join(", ")
    return error(res, 409, "conflict", `La base ${lista} ya tiene QMS-TR aplicado; revírtela antes de volver a correrla`)
  }
  const sinH4 = productos.filter((p) => !porId.get(p).h4 || porId.get(p).h4_anulado)
  if (sinH4.length && !forzar) {
    return error(res, 422, "validacion", `Estas bases no tienen hito 4 vigente: ${sinH4.join(", ")}. Marca "forzar" para lanzarlas igual.`)
  }
  const choque = tandasDe(pais, periodo).find((t) => ACTIVOS.has(t.estado) && t.productos.some((p) => productos.includes(p)))
  if (choque) {
    const comunes = choque.productos.filter((p) => productos.includes(p))
    return error(res, 409, "conflict", `La tanda ${choque.numero} (${choque.estado}) ya tiene las bases ${comunes.join(", ")}`, { tanda_id: choque.id })
  }
  const h4s = productos.map((p) => porId.get(p).h4).filter(Boolean).sort()
  const ahora = isoNow()
  const numero = Math.max(0, ...tandasDe(pais, periodo).map((t) => t.numero)) + 1
  const t = nuevaTanda({
    pais, periodo, numero, productos: [...productos].sort((a, b) => a - b), tipo: "manual", modo, creada_por: USUARIO,
    nota: nota || null,
    h4_desde: h4s[0] ?? ahora, h4_hasta: h4s.at(-1) ?? ahora, _sigEn: Date.now() + 2 * STEP(),
  })
  const partes = [`override manual de ${USUARIO}: ${productos.length} bases, modo ${modo === "completo" ? "completo" : "solo correr"}`]
  if (sinH4.length) partes.push(`forzada sin hito 4 en ${sinH4.join(", ")}`)
  if (nota) partes.push(`nota: ${nota}`)
  evento(t, partes.join("; "))
  st.tandas.set(t.id, t)
  res.status(201).json(publica(t))
})

router.post("/qmstr_flujo/tandas/:tid/revertir", (req, res) => {
  const origen = buscar(req, res)
  if (!origen) return
  const { productos, motivo } = req.body ?? {}
  if (!Array.isArray(productos) || productos.length === 0) return error(res, 422, "validacion", "Elige al menos una base para revertir")
  if (!motivo) {
    // `motivo: str = Field(min_length=1)`: el 422 estándar de FastAPI
    return res.status(422).json({ detail: [{ type: "string_too_short", loc: ["body", "motivo"], msg: "String should have at least 1 character" }] })
  }
  if (!String(motivo).trim()) return error(res, 422, "validacion", "indica el motivo de la reversión")
  if (origen.ejecucion !== MODO()) {
    return error(res, 409, "conflict", `la tanda se corrió en modo ${origen.ejecucion} y el flujo está en modo ${MODO()}`)
  }
  // La API acepta verificando/hito10 en REVERSIBLES, pero sus propias bases siguen en una tanda en curso
  // y responde 409: en la práctica sólo se revierte una tanda cerrada.
  if (origen.estado !== "cerrada") {
    return error(res, 409, "conflict", `bases en una tanda en curso: ${productos.join(", ")} (la tanda ${origen.numero} está ${origen.estado})`)
  }
  if (origen.tipo === "reversion") return error(res, 409, "conflict", "Una reversión no se revierte; lanza un override manual")
  if (origen.modo === "solo_correr") {
    return error(res, 409, "conflict", "Una tanda solo correr no envió nada a DQ: no hay cambios que revertir")
  }
  const ajenas = productos.filter((p) => !origen.productos.includes(p) || origen.bypass.includes(p))
  if (ajenas.length) return error(res, 422, "validacion", `Estas bases no estaban en el zip de la tanda ${origen.numero}: ${ajenas.join(", ")}`)
  const yaRevertidas = tandasDe(origen.pais, origen.periodo)
    .filter((t) => t.tipo === "reversion" && t.tanda_origen === origen.id)
    .flatMap((t) => t.productos).filter((p) => productos.includes(p))
  if (yaRevertidas.length) return error(res, 409, "conflict", `Ya se revirtieron: ${yaRevertidas.join(", ")}`)
  const otras = tandasDe(origen.pais, origen.periodo).filter((t) => t.ejecucion === MODO())
  const posteriores = otras.filter((t) => t.tipo !== "reversion" && t.numero > origen.numero)
    .flatMap((t) => t.productos).filter((p) => productos.includes(p))
  if (posteriores.length) {
    return error(res, 409, "conflict", `bases que pasaron por una tanda posterior (revierte esa): ${[...new Set(posteriores)].join(", ")}`)
  }
  const enCurso = otras.filter((t) => ACTIVOS.has(t.estado)).flatMap((t) => t.productos).filter((p) => productos.includes(p))
  if (enCurso.length) return error(res, 409, "conflict", `bases en una tanda en curso: ${[...new Set(enCurso)].join(", ")}`)
  const numero = Math.max(0, ...tandasDe(origen.pais, origen.periodo).map((t) => t.numero)) + 1
  const t = nuevaTanda({
    pais: origen.pais, periodo: origen.periodo, numero, productos: [...productos].sort((a, b) => a - b), tipo: "reversion",
    tanda_origen: origen.id, creada_por: USUARIO, h4_desde: origen.h4_desde, h4_hasta: origen.h4_hasta,
    nota: String(motivo).trim(), _sigEn: Date.now() + 2 * STEP(),
  })
  evento(t, `reversión de ${productos.length} bases de la tanda ${origen.numero} por ${USUARIO}: ${String(motivo).trim()}`)
  st.tandas.set(t.id, t)
  res.status(201).json(publica(t))
})

router.post("/qmstr_flujo/tandas/:tid/pausar", (req, res) => {
  const t = buscar(req, res)
  if (!t) return
  if (!ACTIVOS.has(t.estado) || t.pausada) return error(res, 409, "conflict", `No se puede pausar una tanda ${t.pausada ? "ya pausada" : t.estado}`)
  t.pausada = true
  t._pausaEn = Date.now()
  evento(t, `pausada por ${USUARIO}`)
  res.json(publica(t))
})

router.post("/qmstr_flujo/tandas/:tid/reanudar", (req, res) => {
  const t = buscar(req, res)
  if (!t) return
  if (!t.pausada) return error(res, 409, "conflict", "La tanda no está pausada")
  t.pausada = false
  // el reloj de la corrida no avanza mientras está pausada
  const pausa = Date.now() - (t._pausaEn ?? Date.now())
  if (t._corrida) t._corrida.inicio += pausa
  if (t._sigEn) t._sigEn += pausa
  evento(t, `reanudada por ${USUARIO}`)
  res.json(publica(t))
})

router.post("/qmstr_flujo/tandas/:tid/reintentar", (req, res) => {
  const t = buscar(req, res)
  if (!t) return
  if (t.estado !== "revision_manual") return error(res, 409, "conflict", `Solo se reintenta una tanda en revisión manual (está ${t.estado})`)
  const volver = t.estado_previo ?? "detectada"
  t.error = null
  mover(t, volver, `reintento por ${USUARIO}: vuelve a ${volver}`)
  t.estado_previo = null
  t._sigEn = Date.now() + 2 * STEP()
  res.json(publica(t))
})

router.post("/qmstr_flujo/tandas/:tid/simular_cierre_ticket", (req, res) => {
  const t = buscar(req, res)
  if (!t) return
  if (MODO() !== "simulacion") return error(res, 409, "conflict", "Solo disponible en modo simulación")
  if (t.estado !== "en_dq") return error(res, 409, "conflict", `El ticket solo se cierra con la tanda en DQ (está ${t.estado})`)
  // como la API: el ticket queda resuelto pero la tanda sigue en DQ hasta la vuelta siguiente
  t._ticketResuelto = true
  evento(t, `${t.jira_key} marcado como resuelto por ${USUARIO} (simulado)`)
  t._sigEn = Date.now() + 2 * STEP()
  res.json(publica(t))
})

router.get("/qmstr_flujo/tandas/:tid/progreso", (req, res) => {
  const t = buscar(req, res)
  if (!t) return
  if (t.tipo === "reversion") return error(res, 409, "conflict", "Una reversión no corre en Databricks")
  if (!t.qms_run_id) return error(res, 409, "conflict", `La tanda ${t.numero} todavía no lanza su corrida`)
  res.json(progreso(t))
})

router.get("/qmstr_flujo/tandas/:tid/zip", (req, res) => {
  const t = buscar(req, res)
  if (!t) return
  if (["detectada", "corriendo", "armando_reversion"].includes(t.estado)) {
    return error(res, 409, "conflict", `El zip todavía no está listo (tanda ${t.estado})`)
  }
  res.json({ url: `/api/v1/qmstr_flujo/tandas/${t.id}/zip/descarga?token=mock`, expires_in: 60 })
})

router.get("/qmstr_flujo/tandas/:tid/zip/descarga", (req, res) => {
  const t = st.tandas.get(req.params.tid)
  if (!t || !req.query.token) return error(res, 401, "unauthorized", "token inválido")
  const nombre = `qms_tr_${PAIS[t.pais].nombre}_${t.periodo}_${t.tipo === "reversion" ? "reversion" : "tanda"}${t.numero}.zip`
  res.setHeader("Content-Type", "application/zip")
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`)
  res.send(Buffer.from(`QMS-TR mock ${nombre}\n`))
})

router.get("/qmstr_flujo/avisos", (req, res) => {
  tandas()
  const { pais, periodo } = req.query
  res.json(st.avisos
    .filter((a) => (!pais || a.pais === pais) && (!periodo || a.periodo === periodo))
    .sort((a, b) => b.at.localeCompare(a.at)))
})

router.post("/qmstr_flujo/vuelta", (_req, res) => {
  tandas()
  st.ultimaVuelta = isoNow()
  st.resultado = Object.fromEntries(PAISES.map((p) => [p.codigo, "ok"]))
  res.json(st.resultado)
})

export default router
