/**
 * PesajeParametrosTab — the 3-level parameter hierarchy for Pesaje, wired to the
 * real weighting-params API (JAA-581).
 *
 * Nivel 1 — De ejecución  (change every run; configured in the Ejecutar panel — reference only)
 * Nivel 2 — Insumos versionados (editable, validated + published against the API)
 * Nivel 3 — Estáticos / Avanzados (collapsed; set at run-launch — reference only)
 */

import { useState } from "react"
import { ChevronDown, ChevronRight, Info } from "lucide-react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SlidersHorizontal, Tags, Grid3x3 } from "lucide-react"

import { COUNTRIES, type CountryCode } from "../params/types"
import { IdPesoTab } from "../params/IdPesoTab"
import { VariablesTab } from "../params/VariablesTab"
import { UniversoTab } from "../params/UniversoTab"
import { DEFAULT_WEIGHTING_PARAMS } from "../weightingParams"

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function SectionHeader({ nivel, title, subtitle, muted }: { nivel: string; title: string; subtitle: string; muted?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          muted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
        }`}
      >
        {nivel}
      </div>
      <div>
        <h2 className="text-base font-semibold leading-none">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  )
}

function FieldRow({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <span className="w-40 truncate text-right font-mono text-sm text-muted-foreground">{value}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Nivel 1 — De ejecución (reference)                                  */
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
          Estos parámetros se especifican al lanzar cada corrida (panel Ejecutar). Aquí solo se
          listan como referencia.
        </div>
        <div className="divide-y">
          <FieldRow label="periodos" value="al lanzar" hint="Período de referencia de la corrida (YYYYMM)" />
          <FieldRow label="idpesos" value="al lanzar" hint="IDs de esquema de ponderación a ejecutar" />
          <FieldRow
            label="N_PERIODOS_OUTLIERS"
            value={DEFAULT_WEIGHTING_PARAMS.N_PERIODOS_OUTLIERS}
            hint="Ventana de períodos para detección de outliers (default)"
          />
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Nivel 2 — Insumos versionados (wired)                               */
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
          subtitle="Cambian cada cierto tiempo — edita, valida y publica una nueva versión"
        />
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">País</label>
          <Select value={code} onValueChange={(v) => setCode(v as CountryCode)}>
            <SelectTrigger className="w-44" data-testid="params-country-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
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
          <IdPesoTab pais={code} country={country} />
        </TabsContent>
        <TabsContent value="variables">
          <VariablesTab pais={code} country={country} />
        </TabsContent>
        <TabsContent value="universo">
          <UniversoTab pais={code} country={country} />
        </TabsContent>
      </Tabs>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Nivel 3 — Estáticos / Avanzados (collapsed, reference)              */
/* ------------------------------------------------------------------ */

function NivelAvanzados() {
  const [open, setOpen] = useState(false)
  const p = DEFAULT_WEIGHTING_PARAMS

  return (
    <section className="space-y-3">
      <CollapsiblePrimitive.Root open={open} onOpenChange={setOpen}>
        <CollapsiblePrimitive.Trigger asChild>
          <button
            type="button"
            data-testid="advanced-toggle"
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
                Rara vez cambian — bounds de outliers y parámetros de colapso (se fijan al lanzar)
              </p>
            </div>
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </CollapsiblePrimitive.Trigger>

        <CollapsiblePrimitive.Content className="overflow-hidden">
          <div className="mt-3 space-y-4 pl-9" data-testid="advanced-content">
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Estos valores son globales y se ajustan al lanzar la corrida. Aquí se muestran los
              defaults como referencia.
            </div>

            <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold">Bounds de outliers</h3>
              <div className="divide-y">
                <FieldRow label="METODO_BOUNDS" value={p.METODO_BOUNDS} hint="Método para calcular los bounds" />
                <FieldRow label="P_BOUNDS" value={p.P_BOUNDS} hint="Percentil inferior/superior" />
                <FieldRow label="F_BOUNDS" value={p.F_BOUNDS} hint="Factor multiplicador del IQR" />
                <FieldRow label="AGREGACAO_BOUNDS" value={p.AGREGACAO_BOUNDS} hint="Combinar bounds de múltiples períodos" />
                <FieldRow label="MAX_ERR_RATIO_BOUNDS" value={p.MAX_ERR_RATIO_BOUNDS} hint="Ratio máximo de outliers tolerable" />
              </div>
            </div>

            <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold">Parámetros de colapso</h3>
              <div className="divide-y">
                <FieldRow label="MAX_ROUNDS_COLAPSO" value={p.MAX_ROUNDS_COLAPSO} hint="Iteraciones máximas del algoritmo de colapso" />
                <FieldRow label="JERARQUIA_MIN_COLAPSO" value={p.JERARQUIA_MIN_COLAPSO ?? "—"} hint="Nivel mínimo de jerarquía para colapsar" />
                <FieldRow label="CORRECAO_BOUNDS" value={p.CORRECAO_BOUNDS ? "true" : "false"} hint="Aplicar corrección de bounds post-colapso" />
              </div>
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
      <p className="text-sm text-muted-foreground">
        Configuración de parámetros por proceso, organizada por frecuencia de cambio.
      </p>

      <NivelEjecucion />

      <div className="border-t" />

      <NivelInsumos />

      <div className="border-t" />

      <NivelAvanzados />
    </div>
  )
}
