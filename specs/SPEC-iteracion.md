# SPEC — Flujo iterativo de Elegibilidad y Pesaje

Estado: v1 (oct-2026). Reemplaza la pantalla de ejecución de `/elegibilidad` y la pestaña
«Ejecutar» de `/pesaje`. El editor `/parametros-elegibilidad` y la pestaña «Parámetros» de
Pesaje (IdPeso, Universo, Variables) se mantienen.

## Por qué

Los equipos trabajan así: preparan los datos del cierre una vez, iteran muchas veces
cambiando parámetros, comparan, y recién al final publican en las tablas productivas del SQL.
La pantalla anterior solo lanzaba un job y entregaba un zip; los parámetros que mostraba no
llegaban al cálculo y «aprobar» no escribía nada.

## Flujo (igual para los dos procesos)

1. **Preparar** — país + período. Extrae y limpia una vez (silver). Muestra tablas de entrada,
   validaciones y dependencias (Pesaje requiere Elegibilidad publicada).
2. **Iterar** — parámetros → simulación sobre el silver, en segundos. Resultados al lado.
   Elegibilidad: cumplimiento por región vs muestra ideal, cerrar regiones, revisión antes de
   imputar, tendencia, uso de donantes. Pesaje: error/outliers por IdPeso, histograma de pesos
   vs período anterior, juntas de marginales propuestas con veto.
3. **Comparar** — escenarios guardados (parámetros + ajustes + resumen) lado a lado; se elige uno.
4. **Aprobar y publicar** — el analista envía, el responsable aprueba o devuelve con
   comentario. Muestra el plan de escritura en SQL y una bitácora.

## Motor

Cada respuesta de preparación, simulación y publicación lleva `engine`:

- `"simulated"` — resultados ilustrativos generados por la API (y por el mock-server) a partir
  de los parámetros. **No lee ni escribe SQL.** La UI muestra un aviso permanente.
- `"databricks"` — motor real (pendiente). Cambiarlo no debe requerir cambios de UI.

La API elige el motor con `ITERACION_ENGINE` (`simulated` por defecto hasta que exista el real).

## Contrato HTTP

Prefijo `/api/v1/iteracion`. `{proceso}` ∈ `elegibilidad | pesaje`. `{pais}` = id en minúscula
de `GET /iteracion/{proceso}/paises`. `{periodo}` = `YYYYMM`. Errores:
`{"error": "<codigo>", "message": "<texto>"}`.

Roles:

| proceso | leer / preparar / simular / escenarios / enviar | aprobar / devolver |
|---|---|---|
| elegibilidad | `admin`, `eligibility_specialist` | `admin`, `eligibility_approver` |
| pesaje | `admin`, `weighting_specialist`, `pesaje_specialist` | `admin`, `weighting_approver` |

Quien envía no puede aprobar su propio envío, salvo `admin`.

### `GET /iteracion/{proceso}/paises`

```json
{ "paises": [ { "id": "brasil", "label": "Brasil", "panel": "hogares" } ] }
```
Elegibilidad: argentina, bolivia, brasil, cam, chile, colombia, ecuador, mexico, peru (panel
`hogares`). Pesaje: los mismos + `brasil_ooh` («Brasil OOH») y `mexico_ooh` («México OOH»),
panel `ooh` (la unidad es el individuo).

### `GET /iteracion/{proceso}/{pais}/{periodo}/preparacion` → `Preparacion`
### `POST /iteracion/{proceso}/{pais}/{periodo}/preparacion` → 202 `Preparacion`

```json
{
  "proceso": "elegibilidad", "pais": "brasil", "periodo": "202610", "engine": "simulated",
  "estado": "sin_preparar | preparando | lista | error",
  "preparado_en": "2026-10-19T10:42:00Z", "version_silver": "v3",
  "fuente": "Snapshot bronze prd · 03-oct 08:12",
  "tablas": [ { "nombre": "J_AtosCompra_New", "filas": 3412880, "estado": "lista | pendiente | error" } ],
  "validaciones": [ { "id": "variables", "titulo": "Variables completas", "detalle": "…", "nivel": "ok | aviso | error" } ],
  "dependencias": [ { "proceso": "elegibilidad", "estado": "publicada | pendiente", "detalle": "…" } ]
}
```
El POST pasa a `preparando`; el GET la devuelve `lista` cuando termina (simulado: unos segundos,
configurable). Pesaje con Elegibilidad no publicada para ese país/período: la dependencia sale
`pendiente` y el POST responde 409 `dependencia_pendiente` (los paneles OOH no dependen de
Elegibilidad).

### `GET /iteracion/{proceso}/{pais}/{periodo}/parametros`

```json
{
  "definiciones": [
    { "clave": "f_ok", "etiqueta": "Llenado mínimo para región OK", "ayuda": "…",
      "tipo": "rango | entero | booleano", "min": 0.8, "max": 1, "paso": 0.01,
      "formato": "pct | num | percentil" }
  ],
  "valores": { "f_ok": 0.9 },
  "referencia": { "etiqueta": "Mes pasado (202609)", "valores": { "f_ok": 0.9 } }
}
```
Elegibilidad: los 13 de `Code_Parametros` del país. De uso diario: `f_ok`, `f_fill_strict`,
`f_fill_flex` (rango, pct), `n_rep_strict`, `n_rep_flex`, `actos_bajo` (entero). Con
`"grupo": "avanzado"` (van plegados): `f_ok_flex` (rango, pct), `viajes_bajo`, `repeat_f`
(entero), `ascend` (`"tipo": "opcion"`, con `"opciones": [{ "valor": 1, "etiqueta": "…" }]`),
`ascend2`, `no_tocar_ok`, `no_tocar_ok_flex` (booleano).

Elegibilidad con el proceso real agrega `estructura` (null en el simulado): los targets por
segmento del país, de su `Estructura.parquet`.
```json
{ "bloques": [ { "secuencia": 0, "nombre": "NSE", "variable": "NSE_LOC", "total": 11298,
    "categorias": ["AB1", "B2"],
    "regiones": [ { "secuencia": 1, "id": "16", "nombre": "NORTE", "total": 300,
      "celdas": [ { "secuencia": 2, "categoria": "AB1", "ideal": 61 } ] } ] } ] }
```
`id` de región = el `R` del proceso (el menor valor de su expresión), el mismo de
`resultado.regiones`; el nombre puede venir escrito distinto en cada bloque. Pesaje: `P_BOUNDS` (rango 0.01–0.05,
percentil), `F_BOUNDS` (rango 0–0.3, pct), `MAX_ROUNDS_COLAPSO` (entero 0–30),
`JERARQUIA_MIN_COLAPSO` (entero 1–4), `CORRECAO_BOUNDS` (booleano).

### `POST /iteracion/{proceso}/{pais}/{periodo}/simulacion` → `Simulacion`

Cuerpo: `{ "parametros": {…}, "ajustes": {…} }`.
Ajustes de Elegibilidad: `{ "regiones_cerradas": ["NE"], "muestra_ideal": { "2": 81 } }`.
`muestra_ideal` lleva solo los targets que cambian (Secuencia del segmento → entero ≥ 0); la API
recalcula los totales y responde 422 si una región no suma lo mismo en todos los bloques.
Ajustes de Pesaje: `{ "idpesos": ["1","3","7"], "juntas_vetadas": ["j2"] }`.
409 `sin_preparar` si la preparación no está `lista`. 422 si un parámetro está fuera de rango.

```json
{
  "engine": "simulated", "duracion_ms": 2100, "generado_en": "…",
  "kpis": [ { "id": "imputados", "etiqueta": "Hogares imputados", "valor": 1180,
              "formato": "num | pct | err | seg", "nota": "+42 vs mes pasado",
              "estado": "ok | aviso | error | neutro" } ],
  "resultado": { "tipo": "elegibilidad", … } 
}
```

`resultado` de Elegibilidad:
```json
{
  "tipo": "elegibilidad", "f_ok": 0.9,
  "regiones": [ { "id": "NE", "nombre": "Nordeste", "ideal": 2480, "natural": 2188,
                  "imputados": 260, "final": 2448, "cumplimiento": 0.987,
                  "estado": "ok | justo | deficit | cerrada" } ],
  "revision": { "hogares_imputar": 1180, "regiones_con_imputacion": 7 },
  "tendencia": [ { "periodo": "202510", "pct_imputado": 0.061, "actual": false } ],
  "comparaciones": [ { "etiqueta": "vs mes pasado", "delta_pp": 0.3 } ],
  "donantes": [ { "usos": 1, "hogares": 708 } ],
  "celdas": [ { "secuencia": "2", "natural": 11, "imputados": 15 } ]
}
```
`celdas` (solo proceso real): lo logrado por cada segmento de la Estructura.
`resultado` de Pesaje:
```json
{
  "tipo": "pesaje", "unidad": "hogar | individuo", "meta_error": 0.00001,
  "idpesos": [ { "id": "1", "nombre": "Mensual", "pesados": 11174, "error_inicial": 0.022,
                 "error_final": 0.000007, "outliers": 0, "juntas": 6, "diferencia_actual": 14 } ],
  "histograma": { "periodo_anterior": "202609", "anterior": [3, 8, …], "actual": [2, 8, …],
                  "fuera": [false, …] },
  "juntas": [ { "id": "j1", "region": "Nordeste", "detalle": "NSE D/E con C2", "vetada": false } ]
}
```
Los errores (`error_inicial`, `error_final`, `meta_error`) van como fracción: la meta del IPF es
0,001% → `meta_error = 0.00001`; un error final típico simulado ronda 0.000004–0.00002.
`pct_imputado` y `cumplimiento` también.

### Escenarios

- `GET …/escenarios` → `{ "escenarios": [Escenario], "elegido_id": "e1" | null }`
- `POST …/escenarios` cuerpo `{ "nombre", "parametros", "ajustes" }` → 201 `Escenario`. La API
  re-simula y guarda el resumen; el cliente no lo manda.
- `POST …/escenarios/{id}/elegir` → `{ "elegido_id": "e2" }`. Elegir otro escenario con un
  envío pendiente devuelve la publicación a `borrador`.

```json
{ "id": "e1", "nombre": "Mes pasado", "es_referencia": true, "creado_por": "…", "creado_en": "…",
  "parametros": {…}, "ajustes": {…}, "resumen": [Kpi] }
```
Cada país/período nace con un escenario de referencia (`es_referencia: true`) con los
parámetros de referencia, elegido por defecto.

### Publicación

- `GET …/publicacion` → `Publicacion`
- `POST …/publicacion/enviar` cuerpo `{ "escenario_id", "destino"? }` (`destino` solo Pesaje:
  `sql | kronos`) → `Publicacion` en `pendiente`
- `POST …/publicacion/aprobar` → `Publicacion` en `publicada`
- `POST …/publicacion/devolver` cuerpo `{ "comentario" }` (obligatorio) → `borrador`

```json
{
  "estado": "borrador | pendiente | publicada", "engine": "simulated",
  "escenario_id": "e2", "destino": "sql | kronos | null",
  "plan": [ { "paso": 1, "tabla": "J_AtosCompra_New", "cambio": "+48.380 actos imputados (Flg_Scanner = 8)" } ],
  "chequeos": [ { "texto": "Prueba sin escribir contra SQL: sin errores", "nivel": "ok | aviso | error | pendiente" } ],
  "enviado_por": null, "aprobado_por": null,
  "puede_enviar": true, "puede_aprobar": false,
  "bitacora": [ { "en": "…", "usuario": "…", "texto": "Escenario «X» enviado a aprobación" } ]
}
```
Con `engine = simulated`, aprobar deja la bitácora con «(simulado) no se escribió en SQL».
Transición inválida → 409 `estado_invalido`; sin rol → 403.

Plan de escritura (texto) — Elegibilidad: `BKP_Actos_Eliminados`, `J_AtosCompra_New`,
`EPT_MorDom / EPT_Actos_*`, `MorDom` (SP + conciliación), `RG_Domicilios_Pesos` (Flg_Elg).
Pesaje hogares: `RG_Domicilios_Pesos` (destino sql) o «Excel para Kronos» (destino kronos);
OOH: `RG_Individuos_Pesos_OOH`.
