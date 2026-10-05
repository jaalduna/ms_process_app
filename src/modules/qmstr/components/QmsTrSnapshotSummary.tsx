import { AlertTriangle, Clock, Database } from "lucide-react"
import type { QmsTrSnapshot } from "../types"
import { formatChile } from "../time"

/** Snapshot de J resuelto para un instante: lo que se va a fijar, o por qué la corrida esperará. */
export function QmsTrSnapshotSummary({ snapshot }: { snapshot: QmsTrSnapshot }) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-2.5 text-sm" data-testid="qmstr-snapshot">
      {snapshot.status === "ready" && snapshot.j ? (
        <p className="flex items-start gap-2">
          <Database className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Se usará el snapshot de J de las <strong>{formatChile(snapshot.j.timestamp)}</strong>{" "}
            <span className="font-mono text-xs text-muted-foreground">(versión {snapshot.j.version})</span>
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2" data-testid="qmstr-snapshot-waiting">
          <Clock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            El snapshot de J de las{" "}
            <strong>{snapshot.expected_j_at ? formatChile(snapshot.expected_j_at) : "—"}</strong> todavía no
            ocurre. La corrida quedará en espera y partirá sola cuando exista.
          </span>
        </p>
      )}
      {snapshot.warnings.map((w) => (
        <p key={w} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {w}
        </p>
      ))}
      {snapshot.tables.length > 1 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">
            Versiones de las {snapshot.tables.length} tablas que se fijan
          </summary>
          <table className="mt-1.5 w-full font-mono">
            <tbody>
              {snapshot.tables.map((t) => (
                <tr key={t.table}>
                  <td className="py-0.5 pr-3">{t.table}</td>
                  <td className="py-0.5 pr-3 text-right">v{t.version}</td>
                  <td className="py-0.5">{formatChile(t.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  )
}
