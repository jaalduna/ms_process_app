# Flujo automático QMS-TR v1.1 — especificación y contrato API (JAA-1435)

Extiende el flujo ya implementado en `ms-process-api` (`src/ms_process_api/qmstr_flujo/`, ver AGENTS.md
"Flujo automático de liberación de QMS-TR"). Todo en español chileno (tú, no vos).

## 0. Modelo actual (no romper)
Tanda = (país, período, número). Estados:
`detectada → corriendo → enviando → en_dq → verificando → hito10 → cerrada`, más `revision_manual`, `sin_bases`.
Store SQLite `qmstr_flujo_tandas` (DDL propia autoreparable como `macrocac_runs`: columnas nuevas vía diff
contra `PRAGMA table_info`, nunca destructivo).

## 1. Cambios de dominio

### 1.1 Tipo, origen y modo de la tanda
Columnas nuevas en `qmstr_flujo_tandas`:
- `tipo TEXT NOT NULL DEFAULT 'liberacion'` ∈ `liberacion | manual | reversion`
- `modo TEXT NOT NULL DEFAULT 'completo'` ∈ `completo | solo_correr`
  - `solo_correr`: corrida Databricks y nada más; al completar la corrida va a `cerrada` (sin ticket, sin
    avisos, sin hito 10). Sirve para probar.
- `creada_por TEXT` (email del usuario o `qmstr_flujo`)
- `tanda_origen TEXT` (id de la tanda que se revierte, sólo `reversion`)
- `envio` (JSON de llaves booleanas) gana `observadores` (MTR agregado como observador del ticket) y
  `aviso_mtr` (comentario con @mención publicado al validar o revertir la tanda)

### 1.2 Re-liberación automática (fix de `procesadas`)
Hoy `TandaStore.procesadas` = {(periodo, categoria)} ⇒ una base que ya pasó nunca vuelve a dispararse.
Nuevo criterio: una fila de hito 4 vigente (no anulada) con `DtCierreReal` **posterior** al `h4_hasta` de la
última tanda (de tipo liberacion o manual, no revertida… ver abajo) que contiene esa base ⇒ es una
re-liberación y genera tanda nueva. Implementarlo guardando por tanda el `h4_hasta` y comparando por base:
`pendiente(periodo, cat) ⇔ existe fila h4 vigente con closed_at > ultimo_h4_procesado(periodo, cat)`.
Caso típico: DC anula el hito 4 (DtAnulacion) y lo vuelve a registrar ⇒ fila nueva vigente con hora mayor.

### 1.3 Override manual
`POST /qmstr_flujo/tandas` (admin) crea tanda `tipo=manual` con país, período, productos y modo. Valida:
- país ∈ `QMSTR_FLUJO_PAISES` configurados (o al menos en `NOMBRE_PAIS`), período AAAAMM válido,
- productos no vacíos, todos con hito 4 vigente en ese país/período/panel 1, salvo `forzar=true` (anotado
  en la bitácora) — la UI muestra la advertencia,
- productos fuera de alcance (`exclusiones` config) ⇒ 422,
- no hay otra tanda activa (estado en ACTIVOS) del mismo país+período que contenga alguno de esos productos ⇒ 409.
`h4_desde/h4_hasta` = rango de hito 4 de esas bases (o `ahora` si `forzar` y no tienen hito 4); la corrida
usa el snapshot de J posterior a `h4_hasta` como hoy. Entra a `detectada` y sigue la misma máquina.

### 1.4 Reversión por base
`POST /qmstr_flujo/tandas/{tid}/revertir` (admin) body `{productos:[int], motivo:str}`.
Precondición: la tanda origen está `cerrada` (o `hito10`/`verificando`) y los productos estaban en el zip
(no bypass), y no fueron ya revertidos. Crea tanda `tipo=reversion`, `tanda_origen=tid`, que recorre:
`detectada → (armando) → enviando → en_dq → verificando → hito10 → cerrada` donde:
- **armando** (estado nuevo `armando_reversion`, reemplaza a corriendo): construye el zip inverso con la
  misma estructura de hojas que el zip de QMS-TR (Instrucciones, Imputaciones, Cantidad envasados,
  Factores, Exclusiones + manifest.json con `"tipo":"reversion"`, `tanda_origen`, `productos`):
  - Factores: por cada IdAto de las hojas Factores/Exclusiones del zip original (de esos productos) ⇒
    `FACTOR_RW1_New` = FACTOR_RW1 en el snapshot J **pre** de la corrida original (version guardada en
    `rec.data.snapshot.j`); Auxiliar `QMS-TR reversión <periodo> · factor`.
  - Cantidad envasados: `Quantidade_New` = Quantidade pre.
  - Imputaciones: vacía. Los clones creados por DQ (buscarlos con la misma lógica de
    `qms_tr/validacion.py`, índice de J) van a **Exclusiones** con `FACTOR_RW1_New = 0`
    (FACTOR_RW1=0 equivale a baja) y Auxiliar `QMS-TR reversión <periodo> · baja de imputación`.
  - El zip se guarda localmente (directorio de datos de la API, p.ej. `QMSTR_FLUJO_DATA_DIR`) y se descarga
    con el patrón de URL firmada existente.
- **verificando** en reversión: compara J actual vs valores pre (muestra `muestra_validacion`).
- **hito10** en reversión: **anula** el hito 10 de esas bases (`UPDATE ... SET DtAnulacion = GETDATE()
  WHERE Ano, Mes, IdHito=10, IdPainel=1, IdProduto IN (...) AND DtAnulacion IS NULL`). No escribe hito 10.
- Ticket y avisos en reversión con textos propios ("Reversión QMS-TR …").
Estado por base derivado (ver 2.4): `aplicada → revertida → (re-liberada) aplicada`.
Una base revertida vuelve a correr por re-liberación automática (1.2) o por override manual (1.3).

### 1.5 Avisos en Jira (el flujo ya no envía correos)
Los avisos van por el ticket de DQ (`Jira.agregar_observador` / `Jira.comentar` con @mención). Alejandro Peña
(MTR) es el destinatario (`account_id` de Jira). Tres avisos por tanda `completo`:
1. **observadores** — al crear el ticket (paso `enviando`): MTR queda como observador (watcher).
   `envio.observadores = true`, idempotente.
2. **pase_mtr** — tras el hito 10: comentario con @mención "QMS-TR quedó aplicado y validado en las bases …
   Pueden seguir con MTR." `envio.aviso_mtr = true`.
3. **reversion_aplicada** — en una tanda de reversión, mismo momento que el pase: "La reversión de QMS-TR
   quedó aplicada en las bases …".
Cada aviso se registra (`qmstr_flujo_avisos`) con `publicado` (false en simulación: nada se escribe en Jira,
el ticket es `SIM-n`) y `modo`.

### 1.6 Modo de ejecución (seguridad)
Setting `QMSTR_FLUJO_MODO` ∈ `simulacion | real` (default `simulacion`). En `simulacion`:
- Databricks: **real** (las corridas sí se ejecutan).
- Jira: `JiraSimulado` — no crea tickets; registra lo que haría y genera key `SIM-<n>`; su estado avanza a
  "resuelto" cuando un admin lo marca desde la UI (`POST /qmstr_flujo/tandas/{tid}/simular_cierre_ticket`)
  o tras `QMSTR_FLUJO_SIM_TICKET_SEGUNDOS` si está configurado.
- Avisos: se registran con `publicado: false`; no se agrega observador ni se comenta en Jira.
- Hitos: lectura **real**; escritura/anulación del hito 10 **no se ejecuta**, se registra lo que se habría
  escrito (evento + bitácora).
- Verificación en J: real (sólo lectura). En simulación, como DQ no aplicó nada, la verificación dará
  "no aplicado"; en simulación el resultado se anota y la tanda sigue a hito10 (no va a revisión manual).
`GET /qmstr_flujo/estado` devuelve `modo`.

### 1.7 Progreso de jobs Databricks
El job `qms_tr_run` tiene tareas `silver_builder, panelistas, prep, hay_grandes, hay_normales,
motor_grandes (for_each), motor_normales (for_each), entrega`. `GET /qmstr_flujo/tandas/{tid}/progreso`
usa `jobs/runs/get` del run de la corrida y devuelve por tarea: estado, inicio/fin, y para for_each
`stats.task_run_stats` (total/completadas/fallidas/activas). Agregado: `productos_total`,
`productos_listos`, `porcentaje`, `run_page_url`. En el `AutoFakeDatabricksClient` sintetizar un progreso
plausible para la UI.

## 2. Contrato HTTP (prefijo `/api/v1/qmstr_flujo`; lectura con país visible, escritura admin)

### 2.1 `GET /estado`
```json
{"enabled": true, "modo": "simulacion", "paises": ["EC","BO"], "intervalo_segundos": 300,
 "ultima_vuelta": "2026-10-08T15:00:00Z", "resultado": {"EC": "ok"}, "error_config": null}
```
(conserva las llaves actuales de `loop.ESTADO`.)

### 2.2 `GET /paises` — países configurados para el selector
`[{"codigo":"EC","nombre":"ecuador","etiqueta":"Ecuador"}, ...]`

### 2.3 `GET /periodos?pais=EC` — períodos productivos con hitos (últimos 6, más reciente primero)
`[{"periodo":"202609","h3":103,"h4":103,"h10":0,"tandas":2}, ...]`

### 2.4 `GET /bases?pais=EC&periodo=202609` — tablero por base
```json
[{"producto":50,"nombre":"Aceite","h3":"2026-09-24T10:00:00-03:00","h4":"2026-10-02T09:34:00-03:00",
  "h4_anulado":false,"h10":null,"fuera_de_alcance":false,
  "estado":"aplicada",  // sin_hito4 | retenida | pendiente | en_proceso | aplicada | revertida | bypass | fuera_de_alcance
  "tanda_id":"…","tanda_numero":1,"tanda_estado":"cerrada","jira_key":"LAT-1","historial":[{"at":"…","tanda_id":"…","tipo":"liberacion","evento":"…"}]}]
```

### 2.5 Tandas
- `GET /tandas?pais=&periodo=&tipo=&estado=` → `Tanda[]` (todas las columnas, incluidas `tipo, modo,
  creada_por, tanda_origen`; `envio` incluye `observadores` y `aviso_mtr`).
- `GET /tandas/{tid}` → `Tanda`.
- `POST /tandas` body `{"pais":"EC","periodo":"202609","productos":[50,51],"modo":"completo","forzar":false,
  "nota":"…"}` → 201 `Tanda`; 409 conflicto, 422 validación (`{"error":"…","message":"…"}`).
- `POST /tandas/{tid}/revertir` body `{"productos":[50],"motivo":"Pedido de DC por correo 08/10"}` → 201 `Tanda`.
- `POST /tandas/{tid}/pausar|reanudar|reintentar` (existentes).
- `POST /tandas/{tid}/simular_cierre_ticket` (sólo en simulación) → `Tanda`.
- `GET /tandas/{tid}/progreso` → ver 1.7:
```json
{"run_id":123,"estado":"RUNNING","run_page_url":"https://…","inicio":"…","fin":null,
 "productos_total":103,"productos_listos":37,"porcentaje":36,
 "tareas":[{"clave":"motor_normales","estado":"RUNNING","inicio":"…","fin":null,
            "for_each":{"total":95,"completadas":30,"fallidas":0,"activas":8}}]}
```
- `GET /tandas/{tid}/zip` → URL firmada de descarga (patrón JAA-757) del zip (corrida o reversión).
- `GET /avisos?pais=&periodo=` → avisos en Jira (publicados o simulados): `[{"id","tanda_id","pais","periodo",
  "tipo":"observadores|pase_mtr|reversion_aplicada","jira_key":"LAT-1|SIM-1","texto",
  "destinatarios":[{"account_id","nombre"}],"publicado":bool,"modo":"simulacion|real","at"}]`.
- `POST /vuelta` (existente).

## 3. Frontend (`ms_process_app`, módulo `src/modules/qmstr/`)
Nueva vista "Flujo QMS-TR" (ruta propia dentro del módulo QMS-TR, entrada en sidebar), además de la página
de lanzamiento existente:
1. **Cabecera**: selector de **país** y **período productivo** (de `/paises` y `/periodos`), chip de modo
   (Simulación ámbar / Real), estado del loop (última vuelta, intervalo), botón "Forzar vuelta" (admin).
2. **Tablero de hitos**: KPIs (bases con hito 4, en proceso, aplicadas, revertidas, retenidas) + barra de
   progreso por etapa; grilla/lista de bases con estado (badge), hitos 3/4/10 con hora, tanda.
3. **Tandas**: tarjetas con stepper de estados (detectada → … → cerrada), tipo (liberación/manual/
   reversión), ticket, progreso Databricks en vivo (polling 10 s mientras `corriendo`: barra % +
   for_each por tarea + link al run), bitácora (timeline), acciones admin (pausar, reanudar, reintentar,
   revertir bases, simular cierre de ticket, descargar zip).
4. **Override manual**: diálogo "Lanzar QMS-TR" — país + período + selección múltiple de bases (con búsqueda,
   "seleccionar liberadas", advertencia si una base no tiene hito 4 ⇒ requiere `forzar`), modo completo /
   solo correr, nota. Confirmación clara antes de enviar.
5. **Revertir**: diálogo desde una tanda cerrada: elegir bases + motivo, confirmación.
6. **Avisos**: lista cronológica por tanda de lo dejado en el ticket de Jira (observador agregado, pase a MTR,
   reversión aplicada): key enlazable (`SIM-n` sin link), texto del comentario, destinatarios con @ y estado
   "Publicado en Jira" / "Simulado, no se publicó". La tarjeta de tanda muestra "Aviso a MTR en Jira" como último paso.
Diseño: moderno, atractivo y amigable (que den ganas de usarlo), identidad Worldpanel (CLAUDE.md global:
light `--primary` Deep Teal #004A52, dark Worldpanel Blue #00A8B8; estados semánticos propios, NO verde/
amarillo de marca), modo oscuro, responsive, estados vacíos/cargando/error cuidados, micro-animaciones
sobrias. Reusar componentes/estilos existentes de la app (Tailwind v4 + shadcn si es lo que usa).
Contrato en `mock-server/` + `specs/openapi.yaml` del frontend con datos realistas (Ecuador 202609, 103
bases, tandas en distintos estados, una corriendo con progreso que avanza).
