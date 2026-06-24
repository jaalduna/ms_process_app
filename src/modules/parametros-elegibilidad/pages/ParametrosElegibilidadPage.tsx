import { useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { KeyRound, ListChecks, Tags, LayoutGrid } from "lucide-react"
import { ELEG_COUNTRIES, type ElegCountry } from "../types"
import { CodeParametrosTab } from "../components/CodeParametrosTab"
import { CriteriosTab } from "../components/CriteriosTab"
import { VariablesTab } from "../components/VariablesTab"
import { EstructuraTab } from "../components/EstructuraTab"
import { EXTRA_TABS } from "../components/extraTabs"

export function ParametrosElegibilidadPage() {
  const [country, setCountry] = useState<ElegCountry>("CL")

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Parámetros de elegibilidad</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Edición asistida de los configs de elegibilidad por país. Cada cambio se valida en vivo y se
            previsualiza (diff antes→después) antes de publicar el parquet.
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">País</label>
          <Select value={country} onValueChange={(v) => setCountry(v as ElegCountry)}>
            <SelectTrigger className="w-48" data-testid="country-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ELEG_COUNTRIES.map((c) => (
                <SelectItem key={c} value={c}>
                  <span className="font-mono">{c}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* key forces fresh draft state per country */}
      <Tabs defaultValue="code" key={country}>
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="code">
            <KeyRound className="h-3.5 w-3.5" />
            Code_Parametros
          </TabsTrigger>
          <TabsTrigger value="criterios">
            <ListChecks className="h-3.5 w-3.5" />
            Criterios_Elegibilidad
          </TabsTrigger>
          <TabsTrigger value="variables">
            <Tags className="h-3.5 w-3.5" />
            Q/M_Variables
          </TabsTrigger>
          <TabsTrigger value="estructura">
            <LayoutGrid className="h-3.5 w-3.5" />
            Estructura
          </TabsTrigger>
          {EXTRA_TABS.map((t) => {
            const Icon = t.icon
            return (
              <TabsTrigger key={t.value} value={t.value}>
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </TabsTrigger>
            )
          })}
        </TabsList>
        <TabsContent value="code">
          <CodeParametrosTab country={country} />
        </TabsContent>
        <TabsContent value="criterios">
          <CriteriosTab country={country} />
        </TabsContent>
        <TabsContent value="variables">
          <VariablesTab country={country} />
        </TabsContent>
        <TabsContent value="estructura">
          <EstructuraTab country={country} />
        </TabsContent>
        {EXTRA_TABS.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {t.render(country)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
