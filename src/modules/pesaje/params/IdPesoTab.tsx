import { Loader2 } from "lucide-react"
import { useIdPesoConfig } from "./hooks"

/**
 * IdPeso_Config — READ-ONLY view of the per-country weighting schemes.
 *
 * JAA-670: the `idpeso-config` validate/publish endpoints of the real API
 * operate on the weighting HYPERPARAMETERS (a `{params}` dict — edited in the
 * niveles 1/3 of the Parametros tab), not on these rows; the rows GET is
 * parquet-backed and has no publish path. Until JAA-672 defines one, this
 * table is display-only.
 */
export function IdPesoTab({ pais, country }: { pais: string; country: string }) {
  const query = useIdPesoConfig(pais)

  if (query.isLoading)
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando IdPeso_Config…
      </div>
    )

  if (query.isError)
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        No se pudo cargar IdPeso_Config · {country}.
      </p>
    )

  const rows = query.data?.rows ?? []

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Esquemas de ponderación para <span className="font-medium">{country}</span> (solo
        lectura). Define la ventana móvil (<span className="font-mono">Periodos</span>) y el
        mínimo de períodos históricos (<span className="font-mono">Per_Min</span>) por esquema.
      </p>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">IdPeso</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3 w-28">Per_Min</th>
              <th className="px-4 py-3 w-28">Periodos</th>
              <th className="px-4 py-3">Obs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.idpeso} className="border-b last:border-0 hover:bg-accent/30">
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.idpeso}</td>
                <td className="px-4 py-2" data-testid={`idpeso-nombre-${r.idpeso}`}>{r.nombre}</td>
                <td className="px-4 py-2 font-mono" data-testid={`idpeso-permin-${r.idpeso}`}>{r.per_min}</td>
                <td className="px-4 py-2 font-mono" data-testid={`idpeso-periodos-${r.idpeso}`}>{r.periodos}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{r.obs ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
