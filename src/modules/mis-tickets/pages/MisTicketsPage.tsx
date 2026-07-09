import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useMyTickets } from "../useMyTickets"
import type { FeedbackStatus, FeedbackTicket } from "@/types/api"

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  todo: "Por hacer",
  progreso: "En progreso",
  review: "En revisión",
  resuelto: "Resuelto",
  cerrado: "Cerrado",
}

const STATUS_VARIANTS: Record<FeedbackStatus, "default" | "secondary" | "destructive" | "outline"> = {
  todo: "outline",
  progreso: "secondary",
  review: "secondary",
  resuelto: "default",
  cerrado: "outline",
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function sortByCreatedAtDesc(tickets: FeedbackTicket[]): FeedbackTicket[] {
  return [...tickets].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

export default function MisTicketsPage() {
  const { data, isLoading, error } = useMyTickets()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mis tickets</h1>
        <p className="text-sm text-muted-foreground">
          Feedback que enviaste y su estado actual.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Error loading tickets: {(error as Error).message}
        </div>
      )}

      {data && data.length === 0 && (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
          <p className="text-sm text-muted-foreground">
            Todavía no enviaste ningún feedback.
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Mensaje</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortByCreatedAtDesc(data).map((ticket) => (
              <TableRow key={ticket.ticket_number}>
                <TableCell className="font-mono text-xs">{ticket.ticket_number}</TableCell>
                <TableCell className="max-w-[420px] truncate text-sm" title={ticket.message}>
                  {ticket.message}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANTS[ticket.status]}>
                    {STATUS_LABELS[ticket.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(ticket.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
