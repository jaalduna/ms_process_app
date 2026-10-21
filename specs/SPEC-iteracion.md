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
Cada definición trae `grupo` (nombre); los grupos van en el orden de las definiciones y tienen
5 parámetros como máximo. La app los muestra en acordeón, una fila por parámetro, con la ayuda
(`ayuda`, clave, rango y valor del país) a demanda.
Elegibilidad (los 13 de `Code_Parametros` del país): «Llenado de celdas» `f_ok`, `f_fill_strict`,
`f_fill_flex`, `f_ok_flex` · «Donantes» `n_rep_strict`, `n_rep_flex`, `repeat_f`, `ascend2` ·
«Hogares bajos» `actos_bajo`, `viajes_bajo` · «Orden y celdas OK» `ascend` (`"tipo": "opcion"`,
con `"opciones": [{ "valor": 1, "etiqueta": "…" }]`), `no_tocar_ok`, `no_tocar_ok_flex`.

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
`JERARQUIA_MIN_COLAPSO` (entero 1–4), `CORRECAO_BOUNDS` (booleano), `IPF_TOL_ERR` (rango, err).
Pesaje en grupos: «Límites de peso», «Corrección de límites», «Juntas», «Convergencia del IPF».
Los que se agregaron de `modules/param_configs.py`: `N_PERIODOS_OUTLIERS` (entero 3–12: la
preparación trae 12 meses), `METODO_BOUNDS` y `AGREGACAO_BOUNDS` (opciones de texto),
`MAX_ERR_RATIO_BOUNDS` (rango), `MAX_CELL_ERR_RATIO_BOUNDS`, `IPF_IT_MAX`, `IPF_STAGNATION_PAT`
(entero) e `IPF_IMPROVEMENT_TOL` (opción numérica 1e-10…1e-6). Las opciones pueden ser números o
texto; la API exige el mismo tipo.

Pesaje con el proceso real también trae `estructura`: el Universo del período preparado, con la
misma forma de bloques → regiones → celdas más `"columna": "P202610" | "Q4-26"`. La «región» es
la ruta de ancestros (`"país › región"` en México y CAM); las hojas sin ancestro van en una fila
`id: "#<bloque>"` que no se cruza. Cada celda trae `clave` (ruta + su expresión) para cruzarla con
una región de otro bloque (NORTE es hoja en «Split Regiones» de Brasil). Una preparación anterior
no la trae (`null`): hay que volver a preparar.

Con el proceso real también trae `config_pais`: la configuración permanente del país y qué versión
publicada usa el cálculo (`version: null` = lo que trae el código del proceso).
```json
{ "codigo": "BR",
  "tablas": [ { "tabla": "Imputacion_ExCateg", "etiqueta": "Productos que no se imputan",
    "version": "3", "publicado_en": "2026-10-20T15:00:00Z", "publicado_por": "ana@…" } ] }
```
`codigo` es el país de los endpoints de configuración (Elegibilidad `/params/{tabla}/{codigo}`,
Pesaje `/weighting/params/{codigo}`). La app la muestra bajo los parámetros de la vuelta
(«Configuración del país»), una fila por grupo de tablas con su editor en un panel lateral:
Elegibilidad — Productos excluidos, Criterios y Valores del país (`Code_Parametros`); Pesaje —
Valores del país (`idpeso-config`) y Variables. Solo aparecen las que están en `tablas`. Fuera por
ahora: `Parametros_Region` (el contrato no trae `actos_bajo`/`viajes_bajo`), el Universo (se
publica por Excel) e IdPesos (del código). Los editores leen lo vigente con
`GET /iteracion/{proceso}/{pais}/{periodo}/config/{tabla}` → `{ origen: "codigo" | "publicado",
version, publicado_en, publicado_por, contenido }`. Lo publicado vale para todos los cierres del país; las versiones entran en la
clave del cálculo, así que publicar deja el resultado pendiente de volver a calcular.

«Productos excluidos» edita `Criterios_Elegibilidad_ExCateg` (no cuentan para la elegibilidad en las
reglas con ExCateg «A») e `Imputacion_ExCateg` (no se imputan) como una sola lista por producto, con
su nombre de `GET /iteracion/elegibilidad/{pais}/{periodo}/productos` (de `dbo.A_Produto`) → `[{ "id": 343, "nombre": "…" }]`. Al
publicar escribe las dos tablas como antes. Si un país usa más de un grupo de excepción, se edita en
«Todas las tablas».

### `POST /iteracion/{proceso}/{pais}/{periodo}/simulacion` → `Simulacion`

Cuerpo: `{ "parametros": {…}, "ajustes": {…} }`.
Ajustes de Elegibilidad: `{ "regiones_cerradas": ["NE"], "muestra_ideal": { "2": 81 } }`.
`muestra_ideal` lleva solo los targets que cambian (Secuencia del segmento → entero ≥ 0); la API
recalcula los totales y responde 422 si una región no suma lo mismo en todos los bloques.
Ajustes de Pesaje: `{ "idpesos": ["1","3","7"], "juntas_vetadas": ["j2"], "universo": { "2": 74483 } }`.
`universo` lleva solo las hojas que cambian; 422 si los bloques no suman el mismo total o si una
subpoblación que aparece en varios bloques (prefijos de ruta y celdas con `clave`) no suma igual.
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
