// JAA-1051 — macrocac types. Mirror the mock contract (JAA-1048,
// mock-server/routes/macrocac.js, docs/design/macrocac-api-contract.md) that
// the real backend (JAA-1052, ms-process-api) must implement.

// JAA-1093 — keep in sync with backend routes/macrocac.py, which mirrors the
// canonical engine's config/countries.json.
export const MACROCAC_COUNTRIES = [
  "AR", "BO", "BR", "CAM",
  "RD", "CL", "CO", "EC", "MX", "PE",
] as const
export type MacrocacCountry = (typeof MACROCAC_COUNTRIES)[number]

/**
 * Etiquetas para mostrar. El código sigue siendo el valor que viaja al backend
 * (`pais`) — esto es solo presentación, para que el usuario no tenga que
 * traducir "CAM" o "RD" de memoria.
 *
 * Los nombres los definimos nosotros: el `config/countries.json` canónico
 * (KWP-macrocac) solo trae server/database por código, sin nombre humano.
 * RD corre sobre la base de CAM, por eso va explícito y no como país aparte.
 * BR_MOSAICO y BR_TOTAL están en el config del motor pero no acá: sus entradas
 * son idénticas a la de BR, así que eran tres opciones que hacían lo mismo.
 */
export const MACROCAC_COUNTRY_LABELS: Record<MacrocacCountry, string> = {
  AR: "Argentina",
  BO: "Bolivia",
  BR: "Brasil",
  CAM: "Centroamérica",
  RD: "República Dominicana",
  CL: "Chile",
  CO: "Colombia",
  EC: "Ecuador",
  MX: "México",
  PE: "Perú",
}

/**
 * Tabla destino. Ya no es una lista fija en el código: sale de
 * `GET /macrocac/tablas`, que expande contra `sys.tables` los patrones que el
 * negocio declara en la planilla (backend `config/tablas.json`). Así una tabla
 * de pruebas recién creada queda disponible sin tocar el frontend.
 */
export interface MacrocacTabla {
  base: string
  esquema: string
  tabla: string
  /** El patrón de la planilla que la trajo. */
  patron: string
}

export interface MacrocacPatron {
  patron: string
  base: string | null
  descripcion: string
  coincidencias: number
}

export interface MacrocacTablaList {
  items: MacrocacTabla[]
  pais: string
  patrones: MacrocacPatron[]
}

export interface MacrocacTablasError {
  error: "patrones_no_configurados" | "tablas_no_disponibles" | "sql_not_configured" | "bad_request"
  message: string
}

/**
 * Prefijo de las copias de trabajo: lo único que distingue una tabla de pruebas
 * de una productiva mirando solo el nombre.
 *
 * Es la convención acordada con TI: `_test_<tabla>_<version>`, con nombres
 * FIJOS por base país que se reutilizan (los respaldos no viven más de 30 días)
 * y una columna con el período al que corresponden.
 *
 * La convención anterior (`_BKP_*`) ya no se ofrece: se sacó de los patrones
 * habilitados, así que esas tablas ni siquiera aparecen en el selector.
 *
 * Ojo con lo que NO dice: `J_AtosCompra_New_RD` no lleva prefijo y por lo tanto
 * cuenta como productiva, que es exactamente lo que pidió Jorge ("no es un
 * test, es oficial"). El sufijo `_RD` no la vuelve de prueba.
 */
/**
 * Copias de trabajo: `_test_<tabla>_<version>` es la convención acordada con TI,
 * pero se acepta también sin el guion bajo inicial. La copia que crearon en
 * Bolivia el 2026-08-31 se llama `Test_J_atoscompra_new_Pythoncac`, y con la
 * comparación anterior —prefijo `_test` estricto— quedaba clasificada como
 * PRODUCTIVA. Eso no solo mostraba la advertencia equivocada: la selección por
 * defecto elige la primera tabla que no sea productiva y, al no encontrar
 * ninguna, caía en `tablas[0]`, que en Bolivia es `j_atoscompra_new`. Es decir,
 * el destino por defecto pasaba a ser la tabla productiva.
 *
 * Se mantiene la propiedad importante: un nombre desconocido cuenta como
 * productivo. Ante la duda, se advierte de más y no de menos.
 */
const PATRON_SANDBOX = /^_?test/i

/** ¿Escribe sobre datos productivos? Todo lo que no sea una copia de trabajo. */
export function esProduccion(tabla: string): boolean {
  return !PATRON_SANDBOX.test(tabla.trim())
}

export function isSandboxTable(tabla: string): boolean {
  return !esProduccion(tabla)
}

/**
 * MotivoCambio.
 *
 * El motor lo lee por fila desde la columna `MotivoCambio` del Excel y, si esa
 * celda viene vacía, cae al parámetro general `--motivo-cambio`
 * (`obtener_motivo_cambio`, KWP-macrocac core.py:233). En ambos casos termina en
 * `SESSION_CONTEXT` para el trigger de auditoría, y además se escribe como
 * columna si la tabla destino la tiene (core.py:1925-1928).
 *
 * JAA-1110 — el motivo es POR FILA: un mismo archivo puede traer unas
 * correcciones por "Críticas" y otras por "Calibración". El del formulario dejó
 * de ser el motivo del lote y es solo el fallback de las filas con la celda
 * vacía; sigue siendo obligatorio si hay al menos una así, porque el motor
 * aborta con un MotivoCambio vacío (`establecer_contexto_auditoria`,
 * core.py:1684).
 *
 * Lo que la auditoría guarda es el `flg_motivo`, no el texto (confirmado con el
 * DBA). La traducción la hace el backend —normaliza la celda del Excel y el
 * parámetro del run al id— así que el frontend sigue moviendo `descricao`, que
 * es lo que el usuario lee.
 *
 * El vocabulario NO se define acá: sale de `dbo.A_FlgMotivo` en la base de cada
 * país, vía `GET /macrocac/motivos`. Estuvo hardcodeado y ya había divergido —
 * el código listaba 5 opciones inventadas contra las 9 reales de la tabla.
 */
export interface MacrocacMotivo {
  /** Id del catálogo. Es lo que la auditoría guarda en `J_AtosCompra_New_Audit_A.Flg_Motivo`. */
  flg_motivo: number
  /** Etiqueta de negocio ("Calibración", "SmartQuality"). */
  descricao: string
}

export interface MacrocacMotivoList {
  items: MacrocacMotivo[]
  pais: string
  /** True cuando el backend sirve una copia vencida porque SQL falló. */
  stale: boolean
  age_seconds: number
}

export interface MacrocacCatalogoError {
  error: "sql_not_configured" | "catalogo_no_disponible" | "bad_request"
  message: string
}

/** "5.- Calibración" — el número es el `Flg_Motivo` del catálogo, no una posición. */
export function motivoCambioLabel(motivo: MacrocacMotivo): string {
  return `${motivo.flg_motivo}.- ${motivo.descricao}`
}

/**
 * Campo del Excel de correcciones tal como lo entiende el motor.
 *
 * `aliases` son todos los encabezados que `get_valor_columna` acepta para ese
 * campo (KWP-macrocac core.py) — los replicamos para no marcar como "faltante"
 * una columna que el motor sí sabe leer con otro nombre. `key` es la ortografía
 * recomendada, la que trae la plantilla.
 */
export interface MacrocacField {
  key: string
  label: string
  aliases: string[]
}

/** Únicas dos que el backend exige (routes/macrocac.py) y sin las cuales el motor no arranca. */
export const MACROCAC_REQUIRED_FIELDS: MacrocacField[] = [
  { key: "IdAto", label: "Id del acto", aliases: ["IdAto"] },
  { key: "Flg", label: "Acción (M/E/X)", aliases: ["Flg", "FLG", "flg", "accion", "Accion", "ACCION", "Acción"] },
]

/** Opcionales: celda vacía = no cambiar ese campo (`set_cambio`, core.py:162). */
export const MACROCAC_OPTIONAL_FIELDS: MacrocacField[] = [
  { key: "NewPreco", label: "Precio", aliases: ["NewPreco", "Preco", "Nuevo_Preco"] },
  { key: "NewQuantidade", label: "Cantidad", aliases: ["NewQuantidade", "Quantidade", "Nueva_Quantidade"] },
  { key: "NewPacksComprados", label: "Packs comprados", aliases: ["NewPacksComprados", "NewPacksComprado", "NewPack_Comprado", "Pack_comprado", "Pack_Comprado", "PacksComprados", "Nuevo_Pack_Comprado"] },
  { key: "NewUnidadesPack", label: "Unidades por pack", aliases: ["NewUnidadesPack", "NewUnidadesPacks", "NewUnidades_Packs", "Unidades_packs", "Unidades_Packs", "UnidadesPack", "Nuevo_Unidades_Packs"] },
  { key: "NewForma_Compra", label: "Forma de compra", aliases: ["NewForma_Compra", "NewFormaCompra", "NewIdFCompra", "FORMA_COMPRA", "FormaCompra", "Forma_Compra", "Nuevo_IdFCompra"] },
  { key: "NewIdCanal", label: "Canal", aliases: ["NewIdCanal", "IdCanal", "Nuevo_IdCanal"] },
  // QA 2026-09 (Jorge): faltaban en la plantilla. El motor ya los leía
  // (core.py, bloque de campos enteros); Acceso_Canal entra al IdVenue.
  { key: "NewAcceso_Canal", label: "Acceso del canal", aliases: ["NewAcceso_Canal", "NewIdAcceso", "Acceso_Canal", "Acceso_canal", "Nuevo_IdAcceso"] },
  { key: "NewForma_Pagto", label: "Forma de pago", aliases: ["NewForma_Pagto", "NewIdFPagto", "Forma_Pagto", "Forma_pagto", "Nuevo_IdFPagto"] },
  { key: "NewIdArtigo", label: "Artículo", aliases: ["NewIdArtigo", "IdArtigo", "Nuevo_IdArtigo"] },
  { key: "NewIdPromocao", label: "Promoción", aliases: ["NewIdPromocao", "NewidPromocao", "IdPromocao", "idPromocao", "Nuevo_IdPromocao"] },
  { key: "NewDataCompra", label: "Fecha de compra", aliases: ["NewDataCompra", "NewData_Compra", "Data_Compra", "Nueva_Data_Compra"] },
  { key: "IdIndividuo", label: "Individuo", aliases: ["IdIndividuo", "NewIdIndividuo", "Nuevo_IdIndividuo"] },
  { key: "NewIdDomicilio", label: "Hogar", aliases: ["NewIdDomicilio", "IdDomicilio", "Nuevo_IdDomicilio"] },
  { key: "NewValuePM", label: "Value PM", aliases: ["NewValuePM", "NewVALUE_PM", "VALUE_PM", "ValuePM", "Nuevo_VALUE_PM"] },
  { key: "NewSEQ", label: "Secuencia", aliases: ["NewSEQ", "SEQ", "Nuevo_SEQ"] },
  // `Flg_Motivo` y `Auxiliar` son los nombres que pidió Jorge para la plantilla
  // (2026-08-05) y coinciden con las llaves que el trigger lee del
  // SESSION_CONTEXT. Los viejos siguen como alias: hay archivos en circulación.
  { key: "Flg_Motivo", label: "Motivo del cambio", aliases: ["Flg_Motivo", "MotivoCambio", "Motivo_Cambio", "Motivo"] },
  { key: "Auxiliar", label: "Detalle adicional", aliases: ["Auxiliar", "Motivo_Otros", "MotivoOtros", "motivo_otros"] },
]

/** El encabezado del Excel, ya normalizado igual que lo hace el motor (`.strip()`). */
function normalizar(columnas: string[]): Set<string> {
  return new Set(columnas.map((c) => c.trim()))
}

export function tieneCampo(columnas: string[], field: MacrocacField): boolean {
  const presentes = normalizar(columnas)
  return field.aliases.some((a) => presentes.has(a))
}

export const MACROCAC_MOTIVO_FIELD: MacrocacField = MACROCAC_OPTIONAL_FIELDS.find(
  (f) => f.key === "Flg_Motivo",
)!

export interface MacrocacFormatoCheck {
  faltantesObligatorias: MacrocacField[]
  faltantesOpcionales: MacrocacField[]
  reconocidas: string[]
  /** Columnas del archivo que el motor ignora por completo. */
  noReconocidas: string[]
  /**
   * JAA-1110 — el archivo trae la columna `MotivoCambio` pero con celdas
   * vacías: esas filas caen al motivo del formulario, que ahí deja de ser
   * opcional. Vale la pena decirlo, porque un archivo "con motivos" a medias se
   * lee como si los trajera todos.
   */
  motivoParcial: boolean
  ok: boolean
}

/**
 * Contrasta el encabezado real del archivo (`upload.columnas`, que el backend ya
 * leyó con openpyxl) contra lo que entiende el motor.
 *
 * Deliberadamente NO reimplementa las reglas de negocio de KWP-macrocac: solo
 * mira nombres de columnas — el contenido lo lee el backend al parsear el
 * workbook y llega en `filasSinMotivo`, que es lo único de las celdas que este
 * chequeo mira. Las validaciones de negocio las hace el motor, y son las que
 * mandan.
 */
export function verificarFormato(
  columnas: string[],
  filasSinMotivo = 0,
): MacrocacFormatoCheck {
  const todos = [...MACROCAC_REQUIRED_FIELDS, ...MACROCAC_OPTIONAL_FIELDS]
  const conocidos = new Set(todos.flatMap((f) => f.aliases))

  const reconocidas: string[] = []
  const noReconocidas: string[] = []
  for (const c of columnas.map((c) => c.trim())) {
    ;(conocidos.has(c) ? reconocidas : noReconocidas).push(c)
  }

  const faltantesObligatorias = MACROCAC_REQUIRED_FIELDS.filter((f) => !tieneCampo(columnas, f))
  const faltantesOpcionales = MACROCAC_OPTIONAL_FIELDS.filter((f) => !tieneCampo(columnas, f))

  return {
    faltantesObligatorias,
    faltantesOpcionales,
    reconocidas,
    noReconocidas,
    motivoParcial: tieneCampo(columnas, MACROCAC_MOTIVO_FIELD) && filasSinMotivo > 0,
    ok: faltantesObligatorias.length === 0,
  }
}

/** JAA-1110 — cuántas filas del archivo se auditan con cada motivo. */
export interface MacrocacMotivoResumen {
  /**
   * El id de `A_FlgMotivo`, que es lo que la auditoría guarda: el backend
   * normaliza la celda del Excel a este valor, escriba el usuario el número o
   * la descripción. Viene resuelto, así que la etiqueta no depende de tener el
   * catálogo a mano.
   */
  flg_motivo: number
  motivo: string
  filas: number
  /** True cuando esas filas traían la celda vacía y toman el motivo del formulario. */
  desde_formulario: boolean
}

export interface MacrocacUpload {
  upload_id: string
  filename: string
  pais: string
  tabla: string
  /**
   * MotivoCambio de formulario. Desde JAA-1110 es el fallback de las filas sin
   * motivo propio, no el motivo del lote: `null` cuando el archivo trae motivo
   * en todas sus filas y el usuario no eligió ninguno.
   */
  motivo: string | null
  /** El mismo motivo como id de catálogo: es lo que la auditoría guarda. */
  flg_motivo: number | null
  /** Motivo_Otros: detalle libre opcional (ticket Jira, contexto). */
  auxiliar: string | null
  filas: number
  columnas: string[]
  /** Desglose por motivo, de más a menos filas. */
  motivos_resumen: MacrocacMotivoResumen[]
  /** Filas con la celda `MotivoCambio` vacía: las que usan el fallback. */
  filas_sin_motivo: number
  /** Filas que traen su propio `Motivo_Otros` (el detalle del formulario no las toca). */
  filas_con_auxiliar: number
}

/**
 * Vista previa del lote (`GET /macrocac/uploads/{id}/vista-previa`): cómo están
 * HOY en la tabla destino los actos que el Excel va a tocar, junto al valor
 * pedido. Solo lectura; los recálculos (COEF, VALUE_PM, Semana…) los hace el
 * motor al aplicar y quedan en el reporte.
 */
export interface MacrocacVistaPreviaItem {
  IdAto: number
  /** M / E / X, tal como viene en el Excel. */
  flg: string
  /** False: el IdAto no existe en la tabla destino (el motor lo rechazará). */
  encontrado: boolean
  /** Columna de la tabla → valor actual. `null` si no se encontró. */
  actual: Record<string, string | number | null> | null
  /** Columna de la tabla → valor pedido por el Excel (solo celdas no vacías). */
  cambios: Record<string, string | number | null>
}

export interface MacrocacVistaPrevia {
  upload_id: string
  pais: string
  tabla: string
  total: number
  /** El backend consulta como máximo los primeros N actos del lote. */
  mostrados: number
  no_encontrados: number
  items: MacrocacVistaPreviaItem[]
}

export interface MacrocacVistaPreviaError {
  error: "not_found" | "sql_not_configured" | "vista_previa_no_disponible" | "bad_request"
  message: string
}

/** Estados terminales del run: dejan de pollear y habilitan (o no) la descarga. */
export const MACROCAC_TERMINAL_STATUSES = ["succeeded", "failed"] as const

export function isTerminal(status: string | undefined): boolean {
  return status === "succeeded" || status === "failed"
}

export interface MacrocacRun {
  run_id: string
  status: string
  dry_run: boolean
  pais: string
  tabla: string
  upload_id: string
  /** JAA-1094 — ventana YYYYMM opcional (--per-ini/--per-fin del motor canónico). */
  per_ini: string | null
  per_fin: string | null
  created_at: string
  completed_at: string | null
  resultado_lote: MacrocacResultRow[] | null
  /** Presente cuando `status === "failed"`. */
  error_message?: string | null
}

/** Una fila del `resultado_lote`. Solo estos cuatro campos están garantizados. */
export interface MacrocacResultRow {
  IdAto: number
  ok: boolean
  mensaje: string
  accion: string
}

export interface MacrocacMissingColumnsError {
  error: "missing_columns"
  missing_columns: string[]
}

export interface MacrocacBadRequestError {
  error: "bad_request"
  message: string
}

/**
 * JAA-1110 — alguna fila trae un `MotivoCambio` que no está en `A_FlgMotivo`.
 * Se rechaza el archivo entero: un lote a medias sobre la tabla productiva es
 * peor que uno que no corre.
 */
export interface MacrocacMotivoInvalidoError {
  error: "motivo_invalido"
  message: string
  invalidos: { motivo: string; filas: number[] }[]
}

/** JAA-1110 — hay filas con la celda vacía y no se eligió motivo por defecto. */
export interface MacrocacMotivoRequeridoError {
  error: "motivo_requerido"
  message: string
  filas: number[]
}

export type MacrocacUploadError =
  | MacrocacMissingColumnsError
  | MacrocacMotivoInvalidoError
  | MacrocacMotivoRequeridoError
  | MacrocacBadRequestError

export interface MacrocacRunConflictError {
  error: "run_in_progress"
  message: string
  run_id: string
}

export interface MacrocacRunNotFoundError {
  error: "not_found"
  message: string
}

export type MacrocacRunError = MacrocacRunConflictError | MacrocacRunNotFoundError

/**
 * The shared `api` axios instance's response interceptor (src/lib/api.ts)
 * collapses every error body into `{error, message}`, dropping fields like
 * `missing_columns`/`run_id` that the macrocac contract needs. api.ts avoids
 * that by requesting with `validateStatus: () => true` and throwing this
 * error instead, carrying the raw backend body through untouched.
 */
export class MacrocacApiError<T> extends Error {
  status: number
  body: T

  constructor(status: number, body: T) {
    super(`macrocac request failed with status ${status}`)
    this.name = "MacrocacApiError"
    this.status = status
    this.body = body
  }
}
