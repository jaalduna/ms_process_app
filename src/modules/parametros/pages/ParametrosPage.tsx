import { useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { SlidersHorizontal, Tags, Grid3x3, FlaskConical } from "lucide-react"
import { COUNTRIES, type CountryCode } from "../mockData"
import { IdPesoTab } from "../components/IdPesoTab"
import { VariablesTab } from "../components/VariablesTab"
import { UniversoTab } from "../components/UniversoTab"

export function ParametrosPage() {
  const [code, setCode] = useState<CountryCode>("CL")
  const country = COUNTRIES.find(c => c.code === code)!.label

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Parámetros</h1>
            <Badge variant="outline" className="gap-1 text-amber-600">
              <FlaskConical className="h-3 w-3" />
              Mockup
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Edición asistida de los configs que antes se tocaban a mano en Excel. Cada cambio se
            valida y se previsualiza antes de publicar el parquet.
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">País</label>
          <Select value={code} onValueChange={v => setCode(v as CountryCode)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map(c => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                  <span className="ml-1 font-mono text-xs text-muted-foreground">({c.code})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* key prop forces fresh draft state when the country changes */}
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
          <UniversoTab country={country} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
