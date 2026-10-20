/**
 * Motor SIMULADO del flujo iterativo de Elegibilidad y Pesaje (specs/SPEC-iteracion.md).
 *
 * Genera resultados ilustrativos y deterministas a partir de los parámetros: no lee ni escribe
 * SQL. Las fórmulas son las del mockup validado con el equipo; la API (ms-process-api) tiene su
 * propia versión del mismo motor. Lo que importa es la forma del contrato, no que los números
 * coincidan entre los dos.
 */

// ---------------------------------------------------------------------------
// Países
// ---------------------------------------------------------------------------

const PAISES_HOGARES = [
  ["argentina", "Argentina"], ["bolivia", "Bolivia"], ["brasil", "Brasil"], ["cam", "CAM"], ["chile", "Chile"],
  ["colombia", "Colombia"], ["ecuador", "Ecuador"], ["mexico", "México"], ["peru", "Perú"],
]
const PAISES_OOH = [["brasil_ooh", "Brasil OOH"], ["mexico_ooh", "México OOH"]]

export function paisesDe(proceso) {
  const hogares = PAISES_HOGARES.map(([id, label]) => ({ id, label, panel: "hogares" }))
  if (proceso === "elegibilidad") return hogares
  return hogares.concat(PAISES_OOH.map(([id, label]) => ({ id, label, panel: "ooh" })))
}

// ---------------------------------------------------------------------------
// Elegibilidad
// ---------------------------------------------------------------------------

/** [id, nombre, ideal, natural] por país. Brasil suma 11.298 hogares ideales, como el real. */
const REGIONES = {
  brasil: [
    ["N", "Norte", 620, 541], ["NE", "Nordeste", 2480, 2188], ["GSP", "Gran São Paulo", 1710, 1652],
    ["ISP", "Interior SP", 1390, 1301], ["GRJ", "Gran Río", 1050, 929], ["MG", "MG / ES / RJ int.", 1460, 1384],
    ["S", "Sul", 1680, 1557], ["CO", "Centro-Oeste", 908, 788],
  ],
  argentina: [
    ["AMBA", "AMBA", 1100, 1040], ["CEN", "Centro", 620, 570], ["NOR", "NOA / NEA", 480, 430],
    ["CUY", "Cuyo", 300, 272], ["PAT", "Patagonia", 260, 232],
  ],
  bolivia: [["LPZ", "La Paz", 420, 398], ["SCZ", "Santa Cruz", 460, 430], ["CBB", "Cochabamba", 300, 276], ["RES", "Resto", 240, 214]],
  cam: [
    ["GT", "Guatemala", 520, 474], ["SV", "El Salvador", 400, 368], ["HN", "Honduras", 380, 340],
    ["CR", "Costa Rica", 360, 338], ["NI", "Nicaragua", 300, 266], ["PA", "Panamá", 340, 310],
  ],
  chile: [["GS", "Gran Santiago", 1250, 1180], ["NOR", "Norte", 420, 372], ["CEN", "Centro", 610, 566], ["SUR", "Sur", 540, 488]],
  colombia: [
    ["BOG", "Bogotá", 900, 842], ["ANT", "Antioquia", 520, 470], ["CAR", "Caribe", 610, 540],
    ["PAC", "Pacífico", 480, 436], ["CEN", "Centro", 560, 512],
  ],
  ecuador: [["UIO", "Quito", 520, 488], ["GYE", "Guayaquil", 600, 552], ["SIE", "Sierra", 360, 322], ["COS", "Costa", 420, 376]],
  mexico: [
    ["CDMX", "Valle de México", 1100, 1030], ["NOR", "Norte", 820, 748], ["OCC", "Occidente", 700, 644],
    ["CEN", "Centro", 760, 702], ["SUR", "Sureste", 640, 566], ["BAJ", "Bajío", 590, 548],
  ],
  peru: [["LIM", "Lima", 1000, 948], ["NOR", "Norte", 520, 466], ["SUR", "Sur", 480, 440], ["CEN", "Centro", 360, 318]],
}

/** % imputado de los últimos 12 cierres (fracción), del más antiguo al más reciente. */
const HIST = [0.061, 0.058, 0.064, 0.069, 0.062, 0.059, 0.066, 0.071, 0.068, 0.074, 0.07, 0.073]

export const ELEG_DEFS = [
  { clave: "f_ok", etiqueta: "Llenado mínimo para región OK", ayuda: "Bajo este llenado la región queda en déficit", tipo: "rango", min: 0.8, max: 1, paso: 0.01, formato: "pct" },
  { clave: "f_fill_strict", etiqueta: "Meta de llenado, misma celda", ayuda: "Pasada STRICT", tipo: "rango", min: 0.8, max: 1, paso: 0.01, formato: "pct" },
  { clave: "f_fill_flex", etiqueta: "Meta de llenado, celdas agrupadas", ayuda: "Pasada FLEX", tipo: "rango", min: 0.6, max: 1, paso: 0.01, formato: "pct" },
  { clave: "n_rep_strict", etiqueta: "Usos máx. por donante (strict)", ayuda: "Pasada STRICT: veces que se puede repetir un donante", tipo: "entero", min: 1, max: 5, paso: 1, formato: "num" },
  { clave: "n_rep_flex", etiqueta: "Usos máx. por donante (flex)", ayuda: "Pasada FLEX: veces que se puede repetir un donante", tipo: "entero", min: 1, max: 5, paso: 1, formato: "num" },
  { clave: "actos_bajo", etiqueta: "Umbral de actos para reemplazo", ayuda: "Pasada REEMPLAZO", tipo: "entero", min: 0, max: 10, paso: 1, formato: "num" },
]
export const ELEG_REFERENCIA = { f_ok: 0.9, f_fill_strict: 0.95, f_fill_flex: 0.85, n_rep_strict: 2, n_rep_flex: 3, actos_bajo: 4 }

export function regionesDe(pais) {
  return REGIONES[pais] ?? []
}

function calcularEleg(pais, p, cerradas) {
  const capS = Math.min(1, p.f_fill_strict * (0.78 + 0.08 * p.n_rep_strict))
  const capF = Math.min(1, p.f_fill_flex * (0.5 + 0.1 * p.n_rep_flex))
  const cap = Math.min(1, 0.7 * capS + 0.3 * capF)
  const tot = { ideal: 0, natural: 0, imput: 0, final: 0, ok: 0, conImput: 0 }
  const regiones = regionesDe(pais).map(([id, nombre, ideal, natural]) => {
    const cerrada = cerradas.includes(id)
    const imputados = cerrada ? 0 : Math.round((ideal - natural) * cap)
    const final = natural + imputados
    const cumplimiento = final / ideal
    let estado = cumplimiento >= p.f_ok ? "ok" : cumplimiento >= p.f_ok - 0.05 ? "justo" : "deficit"
    tot.ideal += ideal; tot.natural += natural; tot.imput += imputados; tot.final += final
    if (estado === "ok") tot.ok += 1
    if (imputados > 0) tot.conImput += 1
    if (cerrada) estado = "cerrada"
    return { id, nombre, ideal, natural, imputados, final, cumplimiento: Number(cumplimiento.toFixed(4)), estado }
  })
  tot.pct = tot.final ? tot.imput / tot.final : 0
  tot.reemplazos = Math.round(tot.natural * 0.004 * p.actos_bajo)
  tot.maxRep = Math.max(p.n_rep_strict, p.n_rep_flex)
  return { regiones, tot }
}

function periodosAnteriores(periodo, n) {
  let y = Number(periodo.slice(0, 4))
  let m = Number(periodo.slice(4))
  const out = []
  for (let i = 0; i < n; i++) {
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
    out.unshift(`${y}${String(m).padStart(2, "0")}`)
  }
  return out
}

const round = (x, d) => Number(x.toFixed(d))

export function simularEleg(pais, periodo, p, ajustes) {
  const { regiones, tot } = calcularEleg(pais, p, ajustes.regiones_cerradas)
  const base = calcularEleg(pais, ELEG_REFERENCIA, []).tot
  const dImput = tot.imput - base.imput
  const dPp = (tot.pct - base.pct) * 100
  const kpis = [
    { id: "imputados", etiqueta: "Hogares imputados", valor: tot.imput, formato: "num", nota: `${dImput >= 0 ? "+" : ""}${dImput} vs mes pasado`, estado: "neutro" },
    { id: "pct_imputado", etiqueta: "% imputado", valor: round(tot.pct, 4), formato: "pct", nota: `${dPp >= 0 ? "+" : ""}${dPp.toFixed(1)} pp vs mes pasado`, estado: dPp > 0.5 ? "aviso" : "neutro" },
    { id: "regiones_ok", etiqueta: "Regiones OK", valor: tot.ok, formato: "num", nota: `de ${regiones.length} · mínimo ${Math.round(p.f_ok * 100)}%`, estado: tot.ok === regiones.length ? "ok" : "aviso" },
    { id: "reemplazos", etiqueta: "Reemplazos de bajo uso", valor: tot.reemplazos, formato: "num", nota: `umbral ${p.actos_bajo} actos`, estado: "neutro" },
  ]
  const previos = periodosAnteriores(periodo, 12)
  const tendencia = previos.map((per, i) => ({ periodo: per, pct_imputado: HIST[i], actual: false }))
    .concat([{ periodo, pct_imputado: round(tot.pct, 4), actual: true }])
  const prom6 = HIST.slice(6).reduce((a, b) => a + b, 0) / 6
  const delta = (ref) => round((tot.pct - ref) * 100, 2)
  const donantes = [1, 2, 3, 4, 5].filter((k) => k <= tot.maxRep)
    .map((k) => ({ usos: k, hogares: Math.round(tot.imput * Math.pow(0.45, k - 1) * 0.6) }))
  return {
    kpis,
    resultado: {
      tipo: "elegibilidad",
      f_ok: p.f_ok,
      regiones,
      revision: { hogares_imputar: tot.imput, regiones_con_imputacion: tot.conImput },
      tendencia,
      comparaciones: [
        { etiqueta: "vs mes pasado", delta_pp: delta(HIST[11]) },
        { etiqueta: "vs promedio del semestre", delta_pp: delta(prom6) },
        { etiqueta: "vs hace un año", delta_pp: delta(HIST[0]) },
      ],
      donantes,
    },
    duracion_ms: 2100,
    _tot: tot,
  }
}

// ---------------------------------------------------------------------------
// Pesaje
// ---------------------------------------------------------------------------

export const IDPESOS = [
  ["1", "Mensual", 1], ["2", "Ult2", 0.9], ["3", "Ult3", 0.8], ["4", "Ult4", 0.72], ["5", "Ult6", 0.6],
  ["6", "Ult9", 0.52], ["7", "Ult12", 0.45], ["8", "Ult18", 0.38], ["9", "Ult24", 0.32],
]
const JUNTAS = [
  ["Nordeste", "NSE D/E con C2"], ["Norte", "tamaño 5+ con 4"], ["Sul", "edad dueña de casa 65+ con 50–64"],
  ["Centro-Oeste", "NSE A/B con C1"], ["Gran Río", "tamaño 1 con 2"], ["Interior SP", "NSE D/E con C2"],
  ["Gran São Paulo", "edad dueña de casa <35 con 35–49"], ["Nordeste", "tamaño 5+ con 4"], ["Sul", "NSE A/B con C1"],
  ["Norte", "NSE D/E con C2"],
]
const PREV = [3, 8, 15, 22, 24, 18, 12, 7, 4, 2]
/** Hogares (o individuos en OOH) pesables por país. */
const UNIVERSO_PANEL = {
  argentina: 2760, bolivia: 1420, brasil: 11214, cam: 2180, chile: 2780, colombia: 3000, ecuador: 1860,
  mexico: 4440, peru: 2300, brasil_ooh: 9842, mexico_ooh: 6120,
}

export const PESAJE_DEFS = [
  // Mismos parámetros y valores que el Pesaje de producción (modules/param_configs.py) y la API.
  { clave: "P_BOUNDS", etiqueta: "Percentil del límite", ayuda: "Límites de peso de cada celda: percentiles p y 100−p de sus pesos en los últimos 12 meses (2 = p2 / p98)", tipo: "entero", min: 1, max: 10, paso: 1, formato: "percentil" },
  { clave: "F_BOUNDS", etiqueta: "Factor sobre el límite", ayuda: "Multiplica el límite superior y divide el inferior (1,1 = 10 % de margen)", tipo: "rango", min: 1, max: 1.5, paso: 0.05, formato: "num" },
  { clave: "MAX_ROUNDS_COLAPSO", etiqueta: "Máx. rondas de juntas", ayuda: "Rondas de juntas automáticas permitidas por período", tipo: "entero", min: 0, max: 100, paso: 1, formato: "num" },
  { clave: "JERARQUIA_MIN_COLAPSO", etiqueta: "Jerarquía mínima de junta", ayuda: "Nivel de celda desde el que se permite juntar", tipo: "entero", min: 1, max: 3, paso: 1, formato: "num" },
  { clave: "CORRECAO_BOUNDS", etiqueta: "Corregir límites si quedan outliers", ayuda: "Repite el ajuste con corrección de límites", tipo: "booleano" },
  { clave: "IPF_TOL_ERR", etiqueta: "Tolerancia de error", ayuda: "El ajuste se detiene cuando ninguna celda se aleja de su meta del universo más que esto (0,01 % = 1e-4)", tipo: "rango", min: 0.00001, max: 0.001, paso: 0.00001, formato: "err" },
]
export const PESAJE_REFERENCIA = { P_BOUNDS: 2, F_BOUNDS: 1.1, MAX_ROUNDS_COLAPSO: 50, JERARQUIA_MIN_COLAPSO: 1, CORRECAO_BOUNDS: true, IPF_TOL_ERR: 0.0001 }
export const PESAJE_AJUSTES_DEFAULT = { idpesos: ["1", "3", "7"], juntas_vetadas: [] }

/** Meta del IPF: error final bajo 0,001% (fracción). */
const META_ERROR = 0.00001

function calcularIpf(p, vetadas, factor) {
  const outBase = Math.round(48 * (p.P_BOUNDS / 5) * (1 - ((p.F_BOUNDS - 1) / 0.5) * 0.8) * factor)
  const cand = Math.max(0, Math.min(p.MAX_ROUNDS_COLAPSO, Math.ceil(outBase / 2) - (p.JERARQUIA_MIN_COLAPSO - 1)))
  const vet = vetadas.filter((id) => Number(id.slice(1)) <= cand).length
  const acept = cand - vet
  let out = Math.max(0, outBase - acept * 2)
  if (p.CORRECAO_BOUNDS) out = Math.round(out * 0.3)
  // En % del mockup (meta < 0,001%) → fracción.
  const err = (0.0004 + 0.00015 * out + (p.CORRECAO_BOUNDS ? 0 : 0.0008)) / 100
  return { cand, acept, out, err: round(err, 8), errIni: round((0.8 + 1.4 * factor) / 100, 4) }
}

export function simularPesaje(pais, periodo, p, ajustes) {
  const ooh = pais.endsWith("_ooh")
  const universo = UNIVERSO_PANEL[pais] ?? 2000
  const sel = IDPESOS.filter(([id]) => ajustes.idpesos.includes(id))
  const filas = sel.map(([id, nombre, factor]) => {
    const r = calcularIpf(p, ajustes.juntas_vetadas, factor)
    return {
      id, nombre, pesados: universo - Math.round(factor * 40), error_inicial: r.errIni, error_final: r.err,
      outliers: r.out, juntas: r.acept, diferencia_actual: Math.round(14 * factor + r.out * 3),
    }
  })
  const mensual = calcularIpf(p, ajustes.juntas_vetadas, 1)
  const ancho = (p.F_BOUNDS - 1) / 0.5
  const actual = PREV.map((v, i) => {
    const borde = i === 0 || i === PREV.length - 1
    return Math.round(v * (borde ? 1.6 - ancho : 1 + 0.05 * Math.sin(i)))
  })
  const fuera = PREV.map((_, i) => (i === 0 || i === PREV.length - 1) && mensual.out > 0)
  const juntas = JUNTAS.slice(0, mensual.cand).map(([region, detalle], i) => {
    const id = `j${i + 1}`
    return { id, region, detalle, vetada: ajustes.juntas_vetadas.includes(id) }
  })
  const peor = filas.reduce((a, b) => (b.error_final > a.error_final ? b : a), filas[0])
  const totOut = filas.reduce((a, b) => a + b.outliers, 0)
  const totJ = filas.reduce((a, b) => a + b.juntas, 0)
  const vetadas = juntas.filter((j) => j.vetada).length
  const kpis = [
    { id: "peor_error", etiqueta: "Peor error final", valor: peor.error_final, formato: "err", nota: `${peor.nombre} · meta < 0,001%`, estado: peor.error_final < META_ERROR ? "ok" : "error" },
    { id: "outliers", etiqueta: "Outliers que quedan", valor: totOut, formato: "num", nota: `suma de ${filas.length} IdPesos`, estado: totOut === 0 ? "ok" : "error" },
    { id: "juntas", etiqueta: "Juntas aplicadas", valor: totJ, formato: "num", nota: `${vetadas} vetadas`, estado: "neutro" },
    { id: "duracion", etiqueta: "Tiempo de la vuelta", valor: filas.length * 6, formato: "seg", nota: "sobre datos preparados", estado: "neutro" },
  ]
  return {
    kpis,
    resultado: {
      tipo: "pesaje", unidad: ooh ? "individuo" : "hogar", meta_error: META_ERROR, idpesos: filas,
      histograma: { periodo_anterior: periodosAnteriores(periodo, 1)[0], anterior: PREV.slice(), actual, fuera },
      juntas,
    },
    duracion_ms: filas.length * 6000,
    _tot: { universo, idpesos: filas.length, peorError: peor.error_final, outliers: totOut },
  }
}

// ---------------------------------------------------------------------------
// Preparación (tablas, validaciones) y plan de escritura
// ---------------------------------------------------------------------------

export function tablasDe(proceso, pais, lista) {
  const estado = lista ? "lista" : "pendiente"
  if (proceso === "elegibilidad") {
    return [
      { nombre: "J_AtosCompra_New", filas: 3412880, estado },
      { nombre: "RG_Panelis", filas: 61204, estado },
      { nombre: "Domicilios / Paineis_Domicilios", filas: 14977, estado },
      { nombre: "E_Elegibilidad_PNC", filas: 70, estado },
      { nombre: "MorDom (historial)", filas: 128530, estado },
    ]
  }
  if (pais.endsWith("_ooh")) {
    return [
      { nombre: "MorOOH", filas: UNIVERSO_PANEL[pais], estado },
      { nombre: "RG_Individuos_Pesos_OOH", filas: 214330, estado },
      { nombre: "Universo OOH", filas: null, estado },
      { nombre: "Variables Q/M", filas: null, estado },
    ]
  }
  return [
    { nombre: "MorDom", filas: UNIVERSO_PANEL[pais], estado },
    { nombre: "RG_Panelis", filas: 61204, estado },
    { nombre: "RG_Domicilios_Pesos (histórico)", filas: 1208554, estado },
    { nombre: "Universo", filas: null, estado },
    { nombre: "Variables Q/M", filas: null, estado },
  ]
}

export function validacionesDe(proceso, pais, periodo) {
  if (proceso === "elegibilidad") {
    return [
      { id: "variables", titulo: "Variables completas", detalle: "Todas las variables Q/M de Estructura existen en RG_Panelis", nivel: "ok" },
      { id: "periodo", titulo: "Período de cierre", detalle: `Las fechas de E_Elegibilidad_PNC cubren ${periodo}`, nivel: "ok" },
      { id: "factor_rw1", titulo: "Actos dados de baja excluidos", detalle: "FACTOR_RW1 = 0 fuera (excepción 202603 aplicada)", nivel: "ok" },
      { id: "inconsistentes", titulo: "312 hogares inconsistentes", detalle: "Se excluyen; revisar ElgNat_Inconsist antes de seguir", nivel: "aviso" },
    ]
  }
  const unidad = pais.endsWith("_ooh") ? "individuos" : "hogares"
  return [
    { id: "universo", titulo: "Universo cuadra con las variables", detalle: "Todas las celdas de Q/M tienen meta poblacional", nivel: "ok" },
    { id: "nuevos", titulo: `184 ${unidad} sin peso el mes pasado`, detalle: "Entran sin histórico para calcular límites", nivel: "aviso" },
  ]
}

const fmtNum = (n) => Math.round(n).toLocaleString("es-CL")

export function planDe(proceso, pais, periodo, escenarioTot, destino) {
  if (proceso === "elegibilidad") {
    return [
      { paso: 1, tabla: "BKP_Actos_Eliminados", cambio: `Respaldo de ${fmtNum(escenarioTot.reemplazos)} actos que salen` },
      { paso: 2, tabla: "J_AtosCompra_New", cambio: `+${fmtNum(escenarioTot.imput * 41)} actos imputados (Flg_Scanner = 8), de una vez` },
      { paso: 3, tabla: "EPT_MorDom / EPT_Actos_*", cambio: `Upsert del período ${periodo}` },
      { paso: 4, tabla: "MorDom", cambio: `${fmtNum(escenarioTot.final)} hogares elegibles (SP de elegibilidad + conciliación con EPT_MorDom)` },
      { paso: 5, tabla: "RG_Domicilios_Pesos", cambio: "Flg_Elg por hogar, lo usa Pesaje" },
    ]
  }
  const ooh = pais.endsWith("_ooh")
  const unidad = ooh ? "individuos" : "hogares"
  if (destino === "kronos") {
    return [{ paso: 1, tabla: "Excel para Kronos", cambio: `${fmtNum(escenarioTot.universo)} ${unidad} × ${escenarioTot.idpesos} IdPesos, para subir a Kronos` }]
  }
  const tabla = ooh ? "RG_Individuos_Pesos_OOH" : "RG_Domicilios_Pesos"
  return [
    { paso: 1, tabla: `${tabla} (respaldo)`, cambio: `Copia de los pesos vigentes del período ${periodo}` },
    { paso: 2, tabla, cambio: `Upsert de ${fmtNum(escenarioTot.universo)} ${unidad} × ${escenarioTot.idpesos} IdPesos, período ${periodo}` },
  ]
}
