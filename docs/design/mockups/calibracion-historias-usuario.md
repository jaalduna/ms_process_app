# Calibración — Revisión de targets: historias de usuario y mockup

**Mockup interactivo**: https://gentle-mud-097a5db03.7.azurestaticapps.net/calibracion/
**Fuente**: `docs/design/mockups/calibracion.html` (HTML autocontenido, sin dependencias)
**Fecha**: 2026-07-10 · **Estado**: propuesta de diseño para revisión con stakeholders (no implementado en la app)

## Contexto de dominio

- **Niveles**: L2 = categoría (producto) × región; L1 = categoría × región × canal; L3 = apertura
  por marca, **solo informativo** (no editable).
- **Targets**: en L1 se calibra volumen (V) y penetración (P); en L2 la penetración es el target
  principal y el **volumen es aditivo** (V de L2 = suma de los V de L1).
- **Rangos de factibilidad**: cada target propuesto por el modelo viene con un rango factible
  [min, max]; lo relevante para la revisión es si el target cae dentro o fuera, y con qué
  intensidad.
- **Prioridad**: urgencia alta vs baja por combinación L2.
- **Flujo de la calibradora (Erika)**: revisa a nivel L2 línea por línea — mira la curva
  histórica y decide si el target propuesto le hace sentido; baja a L1 solo cuando alcanza o
  cuando la desviación lo amerita.
- **Pregunta abierta**: cuando se cambia el volumen a nivel L2, el reparto hacia L1 debe
  respetar los rangos factibles ("siempre y cuando sea alcanzable") — la secuencia exacta del
  algoritmo de reparto aún no está definida con negocio; el mockup implementa una propuesta
  (reparto proporcional con clamp iterativo a los rangos).

## Historias de usuario y cómo las cubre el mockup

### 1. Visibilizar los targets de penetración y volumen propuestos
Tabla principal con una fila por combinación L2: penetración (último real → target, con delta
en pp), volumen L2 y sparkline de la serie.

- **1.1 Ver series de tiempo y target propuesto** — en el detalle (drawer): gráfico de la serie
  mensual de 24 meses con **banda de intervalo de confianza (IC 95%)**, banda del rango
  factible en el período target, y el target propuesto como punto coloreado según su estado.
  Hover con línea guía y tooltip (mes, valor, IC; sobre el target: valor, rango factible y
  propuesta original si hay override).
- **1.2 Ver los valores** — franja numérica bajo el gráfico con los últimos 8 meses + target.

### 2. Distinguir, ordenar y filtrar targets según rango e intensidad
Cada target se clasifica en **dentro / fuera·leve / fuera·severo** según la distancia al rango
relativa a su ancho (leve < 40 % del ancho, severo ≥ 40 %). La columna Desviación muestra una
barra de intensidad y el % fuera. Filtros por rango, urgencia y estado (pendiente / aprobado /
con override); búsqueda por categoría o región; orden por desviación (default), urgencia,
volumen o categoría. Las stat cards del encabezado actúan como filtro rápido.

### 3. Editar valores a nivel L1 y ver su impacto en tiempo real en L2
Tabla L1 (por canal) con inputs editables para P y V. Editar V recalcula el volumen L2 al
instante (aditivo) con feedback visual, tanto en el drawer como en la tabla principal. Los
valores fuera de su rango factible L1 se marcan en ámbar (leve) o rojo (severo).

### 4. Ver los atributos de L2 y L1
Sección "Atributos L2" (nivel, producto/categoría, región, período target) y columna de
atributos por fila L1 (producto · región · canal). El detalle L3 (por marca) se muestra
plegado, rotulado "solo informativo".

### 5. Override de los targets propuestos
Input de override de P con **motivo obligatorio**; queda registrado con autor. El gráfico
muestra la propuesta original atenuada y el override destacado; la clasificación de rango se
recalcula con el override. Se puede quitar o restablecer la propuesta completa.

### 6. Aprobación progresiva de targets
Botón "Aprobar" por fila y en el drawer; contador global "aprobados x/total". Si el target
sigue fuera·severo, se pide confirmación explícita y el drawer lo advierte. "Restablecer
propuesta" devuelve la línea a pendiente.

### 7. Cambiar volumen a nivel L2 con reparto automático hacia L1
Input de nuevo volumen L2 + "Aplicar algoritmo": reparte el delta proporcional al peso de cada
canal, respetando los rangos factibles de L1 (clamp iterativo del residuo entre canales
libres). Muestra el diff actual → propuesto por canal con marca "tope de rango"; si el total
pedido no es alcanzable, avisa y ofrece el máximo/mínimo factible. El usuario acepta o
descarta.

## Extra: asistente IA integrado (demo simulada)

Panel de chat (botón flotante) que simula un asistente conectado vía API a `claude-sonnet-5`
con tool-use, bajo el patrón **el chat propone → la UI muestra el diff → el usuario confirma**:

1. **Resumen/triage del ciclo** — prioriza la revisión (severos primero, con razones).
2. **Explicar desviación** — diagnóstico del target abierto contra su serie real (promedio 6m,
   tendencia, canal L1 que origina la distorsión) con overrides sugeridos aplicables.
3. **Motivos de override** — redacción automática del motivo con los números del target.
4. **Edición por lenguaje natural** — "sube el volumen de Lácteos a 2.500" ejecuta el algoritmo
   de reparto y muestra el diff con Aplicar/Descartar; nunca aplica solo.
5. **Aprobación en bloque** — solo los dentro de rango; los desviados quedan para revisión.

En el mockup las respuestas se generan localmente desde el estado de la página (rotulado "demo
simulada"). La versión real requiere un endpoint proxy en `ms-process-api` (la API key no puede
vivir en el frontend).

## Redeploy del mockup

Comparte el Static Web App `swa-weu-dev-nmr-wp-mockups` con el mockup PyCac; el deploy
reemplaza el sitio completo, así que siempre se despliega la carpeta con ambos (`index.html` =
pycac, `calibracion/index.html` = este). Procedimiento: envolver cada HTML con
doctype/head/body (los fuentes son fragmentos) y `swa deploy` con el token del recurso, desde
un directorio vacío como cwd.
