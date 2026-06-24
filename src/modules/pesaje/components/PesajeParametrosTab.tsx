/**
 * PesajeParametrosTab — mockup of the 3-level parameter hierarchy for Pesaje.
 *
 * Nivel 1 — De ejecución  (cambian en cada corrida, read-only here)
 * Nivel 2 — Insumos versionados (editable, with ReviewPublishDialog flow)
 * Nivel 3 — Estáticos / Avanzados (collapsible, almost never change)
 *
 * MOCKUP only: no API calls, no real writes. All state is in-memory.
 */

import { useRef, useState } from "react"
import { toast } from "sonner"
import { FlaskConical, ChevronDown, ChevronRight, Upload, Info } from "lucide-react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { SlidersHorizontal, Tags, Grid3x3 } from "lucide-react"

import { COUNTRIES, type CountryCode } from "@/modules/parametros/mockData"
import { IdPesoTab } from "@/modules/parametros/components/IdPesoTab"
import { VariablesTab } from "@/modules/parametros/components/VariablesTab"
import { UniversoTab } from "@/modules/parametros/components/UniversoTab"

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function SectionHeader({
  nivel,
  title,
  subtitle,
}: {
  nivel: string
  title: string
  subtitle: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
        {nivel}
      </div>
      <div>
        <h2 className="text-base font-semibold leading-none">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  )
}

function FieldRow({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Input
        value={value}
        readOnly
        disabled
        className="w-40 text-right font-mono text-sm opacity-60"
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Nivel 1 — De ejecución                                              */
/* ------------------------------------------------------------------ */

function NivelEjecucion() {
  return (
    <section className="space-y-3">
      <SectionHeader
        nivel="1"
        title="De ejecución"
        subtitle="Cambian en cada corrida — se configuran al lanzar en el panel Ejecutar"
      />
      <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Estos parámetros se especifican al lanzar cada corrida. Aquí se muestra la última
          ejecución como referencia.
        </div>
        <div className="divide-y">
          <FieldRow
            label="periodos"
            value="202505"
            hint="Período de referencia de la corrida (YYYYMM)"
          />
          <FieldRow
            label="idpesos"
            value="1,2,3,5,6"
            hint="IDs de esquema de ponderación a ejecutar"
          />
          <FieldRow
            label="N_PERIODOS_OUTLIERS"
            value={6}
            hint="Ventana de períodos para detección de outliers"
          />
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Nivel 2 — Insumos versionados                                       */
/* ------------------------------------------------------------------ */

function NivelInsumos() {
  const [code, setCode] = useState<CountryCode>("CL")
  const country = COUNTRIES.find((c) => c.code === code)!.label

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader
          nivel="2"
          title="Insumos versionados"
          subtitle="Cambian cada cierto tiempo — edita, valida y publica el parquet"
        />
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">País</label>
          <Select value={code} onValueChange={(v) => setCode(v as CountryCode)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                  <span className="ml-1 font-mono text-xs text-muted-foreground">({c.code})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* key prop resets draft state on country change */}
      <Tabs defaultValue="idpeso" key={code}>
        <TabsList>
          <TabsTrigger value="idpeso">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            IdPeso_Config
          </TabsTrigger>
          <TabsTrigger value="variables">
            <Tags className="h-3.5 w-3.5" />
            Variables Q/M
          </TabsTrigger>
          <TabsTrigger value="universo">
            <Grid3x3 className="h-3.5 w-3.5" />
            Universo
          </TabsTrigger>
        </TabsList>
        <TabsContent value="idpeso">
          <IdPesoTab country={country} />
        </TabsContent>
        <TabsContent value="variables">
          <VariablesTab country={country} code={code} />
        </TabsContent>
        <TabsContent value="universo">
          <UniversoTabWithExcel country={country} />
        </TabsContent>
      </Tabs>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Universo with Excel upload affordance                               */
/* ------------------------------------------------------------------ */

type ExcelStep = "idle" | "uploading" | "validating" | "preview" | "done"

function UniversoTabWithExcel({ country }: { country: string }) {
  const [step, setStep] = useState<ExcelStep>("idle")
  const [fileName, setFileName] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setStep("uploading")

    // Simulate async steps with timeouts (pure mock, no real parsing)
    setTimeout(() => setStep("validating"), 800)
    setTimeout(() => setStep("preview"), 1800)
  }

  const handlePublish = () => {
    setStep("done")
    toast.success("Publicado (mockup — sin escritura real)", {
      description: `Universo · ${country} — actualizado desde ${fileName}`,
    })
    // Reset after a brief moment so the user can try again
    setTimeout(() => {
      setStep("idle")
      setFileName("")
      if (fileInputRef.current) fileInputRef.current.value = ""
    }, 2500)
  }

  const handleReset = () => {
    setStep("idle")
    setFileName("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="space-y-4">
      {/* Excel upload section above the standard editor */}
      <div className="rounded-xl border border-dashed bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-medium">Actualizar vía Excel</h3>
          <Badge variant="outline" className="gap-1 text-xs text-amber-600">
            <FlaskConical className="h-3 w-3" />
            Mockup
          </Badge>
        </div>

        {step === "idle" && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 px-6 py-8 text-center transition hover:border-primary/50 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Upload className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Arrastra un Excel o{" "}
              <span className="font-medium text-primary underline underline-offset-2">
                haz click para seleccionar
              </span>
            </p>
            <p className="text-xs text-muted-foreground/70">
              .xlsx · máx. 5 MB · columnas: Categoría, Q3-25, Q4-25, Q1-26, Q2-26
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={handleFileChange}
            />
          </div>
        )}

        {step === "uploading" && (
          <ExcelStepView
            steps={["Subir", "Validar", "Previsualizar", "Publicar"]}
            activeIndex={0}
            description={`Subiendo ${fileName}…`}
          />
        )}

        {step === "validating" && (
          <ExcelStepView
            steps={["Subir", "Validar", "Previsualizar", "Publicar"]}
            activeIndex={1}
            description="Validando estructura y tipos…"
          />
        )}

        {step === "preview" && (
          <div className="space-y-3">
            <ExcelStepView
              steps={["Subir", "Validar", "Previsualizar", "Publicar"]}
              activeIndex={2}
              description={
                <span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Válido
                  </span>{" "}
                  · 0 errores · 6 filas procesadas
                </span>
              }
            />
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <p className="mb-2 font-medium text-sm">Diff de filas (mockup):</p>
              <div className="flex gap-4 font-mono text-xs">
                <span className="text-emerald-600 dark:text-emerald-400">+3 filas nuevas</span>
                <span className="text-destructive">−1 fila eliminada</span>
                <span className="text-amber-600">Δ2 filas modificadas</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handlePublish}>
                <Upload className="h-4 w-4" />
                Publicar
              </Button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            Publicado. Reiniciando…
          </div>
        )}
      </div>

      {/* Standard editor below */}
      <UniversoTab country={country} />
    </div>
  )
}

/** Mini stepper to show progress through upload flow */
function ExcelStepView({
  steps,
  activeIndex,
  description,
}: {
  steps: string[]
  activeIndex: number
  description: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                i < activeIndex
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                  : i === activeIndex
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {s}
            </span>
            {i < steps.length - 1 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
            )}
          </span>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Nivel 3 — Estáticos / Avanzados                                     */
/* ------------------------------------------------------------------ */

type MetodoBounds = "percentile" | "iqr" | "log"
type AgregacaoBounds = "union" | "intersection"

function NivelAvanzados() {
  const [open, setOpen] = useState(false)

  // Bounds params
  const [metodoBounds, setMetodoBounds] = useState<MetodoBounds>("percentile")
  const [pBounds, setPBounds] = useState("0.05")
  const [fBounds, setFBounds] = useState("3.0")
  const [agregacaoBounds, setAgregacaoBounds] = useState<AgregacaoBounds>("union")
  const [maxErrRatioBounds, setMaxErrRatioBounds] = useState("0.02")

  // Colapso params
  const [maxRoundsColapso, setMaxRoundsColapso] = useState("10")
  const [jerarquiaMinColapso, setJerarquiaMinColapso] = useState("1")
  const [correcaoBounds, setCorrecaoBounds] = useState(false)

  return (
    <section className="space-y-3">
      <CollapsiblePrimitive.Root open={open} onOpenChange={setOpen}>
        <CollapsiblePrimitive.Trigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
              3
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold">Estáticos / Avanzados</span>
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {open ? "ocultar" : "mostrar"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Rara vez cambian — bounds de outliers y parámetros de colapso
              </p>
            </div>
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </CollapsiblePrimitive.Trigger>

        <CollapsiblePrimitive.Content className="overflow-hidden data-[state=open]:animate-none">
          <div className="mt-3 space-y-4 pl-9">
            {/* Bounds card */}
            <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold">Bounds de outliers</h3>
              <div className="divide-y">
                <div className="flex items-center justify-between gap-4 py-1.5">
                  <div>
                    <p className="font-mono text-sm font-medium">METODO_BOUNDS</p>
                    <p className="text-xs text-muted-foreground">
                      Método para calcular los bounds de cada variable
                    </p>
                  </div>
                  <Select
                    value={metodoBounds}
                    onValueChange={(v) => setMetodoBounds(v as MetodoBounds)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentile">percentile</SelectItem>
                      <SelectItem value="iqr">iqr</SelectItem>
                      <SelectItem value="log">log</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-4 py-1.5">
                  <div>
                    <p className="font-mono text-sm font-medium">P_BOUNDS</p>
                    <p className="text-xs text-muted-foreground">Percentil inferior/superior</p>
                  </div>
                  <Input
                    value={pBounds}
                    onChange={(e) => setPBounds(e.target.value)}
                    className="w-40 text-right font-mono text-sm"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 py-1.5">
                  <div>
                    <p className="font-mono text-sm font-medium">F_BOUNDS</p>
                    <p className="text-xs text-muted-foreground">Factor multiplicador del IQR</p>
                  </div>
                  <Input
                    value={fBounds}
                    onChange={(e) => setFBounds(e.target.value)}
                    className="w-40 text-right font-mono text-sm"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 py-1.5">
                  <div>
                    <p className="font-mono text-sm font-medium">AGREGACAO_BOUNDS</p>
                    <p className="text-xs text-muted-foreground">
                      Combinar bounds de múltiples períodos
                    </p>
                  </div>
                  <Select
                    value={agregacaoBounds}
                    onValueChange={(v) => setAgregacaoBounds(v as AgregacaoBounds)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="union">union</SelectItem>
                      <SelectItem value="intersection">intersection</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-4 py-1.5">
                  <div>
                    <p className="font-mono text-sm font-medium">MAX_ERR_RATIO_BOUNDS</p>
                    <p className="text-xs text-muted-foreground">
                      Ratio máximo de outliers tolerable (0–1)
                    </p>
                  </div>
                  <Input
                    value={maxErrRatioBounds}
                    onChange={(e) => setMaxErrRatioBounds(e.target.value)}
                    className="w-40 text-right font-mono text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Colapso card */}
            <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold">Parámetros de colapso</h3>
              <div className="divide-y">
                <div className="flex items-center justify-between gap-4 py-1.5">
                  <div>
                    <p className="font-mono text-sm font-medium">MAX_ROUNDS_COLAPSO</p>
                    <p className="text-xs text-muted-foreground">
                      Iteraciones máximas del algoritmo de colapso
                    </p>
                  </div>
                  <Input
                    value={maxRoundsColapso}
                    onChange={(e) => setMaxRoundsColapso(e.target.value)}
                    className="w-40 text-right font-mono text-sm"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 py-1.5">
                  <div>
                    <p className="font-mono text-sm font-medium">JERARQUIA_MIN_COLAPSO</p>
                    <p className="text-xs text-muted-foreground">
                      Nivel mínimo de jerarquía para colapsar
                    </p>
                  </div>
                  <Input
                    value={jerarquiaMinColapso}
                    onChange={(e) => setJerarquiaMinColapso(e.target.value)}
                    className="w-40 text-right font-mono text-sm"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 py-1.5">
                  <div>
                    <p className="font-mono text-sm font-medium">CORRECAO_BOUNDS</p>
                    <p className="text-xs text-muted-foreground">
                      Aplicar corrección de bounds post-colapso
                    </p>
                  </div>
                  <Switch
                    checked={correcaoBounds}
                    onCheckedChange={setCorrecaoBounds}
                    aria-label="CORRECAO_BOUNDS"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() =>
                  toast.success("Configuración avanzada guardada (mockup — sin escritura real)")
                }
              >
                Guardar configuración avanzada
              </Button>
            </div>
          </div>
        </CollapsiblePrimitive.Content>
      </CollapsiblePrimitive.Root>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Main export                                                          */
/* ------------------------------------------------------------------ */

export function PesajeParametrosTab() {
  return (
    <div className="space-y-8">
      {/* Mockup badge header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configuración de parámetros por proceso, organizada por frecuencia de cambio.
        </p>
        <Badge variant="outline" className="gap-1 text-amber-600">
          <FlaskConical className="h-3 w-3" />
          Mockup
        </Badge>
      </div>

      <NivelEjecucion />

      <div className="border-t" />

      <NivelInsumos />

      <div className="border-t" />

      <NivelAvanzados />
    </div>
  )
}
