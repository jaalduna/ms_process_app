import { useState } from "react"
import { useLocation } from "react-router-dom"
import { toast } from "sonner"
import { MessageSquarePlus, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/useAuth"
import { submitFeedback } from "@/lib/api"
import { getTelemetrySessionId } from "@/lib/telemetry"
import { cn } from "@/lib/utils"
import type { ApiError, FeedbackCategory } from "@/types/api"

interface FeedbackDialogProps {
  /** Resolved app version (package.json or Tauri runtime) from the layout. */
  appVersion: string
  /** Sidebar collapsed → render an icon-only trigger. */
  collapsed?: boolean
}

/** Derive the current module name from the route path (basename-relative). */
function moduleFromPath(path: string): string {
  return path.split("/").filter(Boolean)[0] ?? "root"
}

export function FeedbackDialog({ appVersion, collapsed = false }: FeedbackDialogProps) {
  const location = useLocation()
  const { user } = useAuth()

  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [category, setCategory] = useState<FeedbackCategory>("bug")
  const [contact, setContact] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const resetForm = () => {
    setMessage("")
    setCategory("bug")
    setContact("")
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    // Keep the text while a submit error is showing; only clear on a fresh open.
    if (next) resetForm()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() === "") {
      setError("El mensaje es obligatorio.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const response = await submitFeedback({
        message: message.trim(),
        category,
        contact: contact.trim() || undefined,
        context: {
          module: moduleFromPath(location.pathname),
          path: location.pathname,
          appVersion,
          user: user?.email ?? user?.name ?? undefined,
          sessionId: getTelemetrySessionId(),
        },
      })
      toast.success(`¡Gracias! Tu ticket es ${response.ticket_number}.`)
      setOpen(false)
      resetForm()
    } catch (err) {
      const apiError = err as ApiError
      setError(apiError?.message ?? "No se pudo enviar el feedback. Intenta de nuevo.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <button
                className="inline-flex items-center justify-center rounded-md p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                aria-label="Enviar feedback"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">Enviar feedback</TooltipContent>
        </Tooltip>
      ) : (
        <DialogTrigger asChild>
          <button className="inline-flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <MessageSquarePlus className="h-4 w-4" />
            Enviar feedback
          </button>
        </DialogTrigger>
      )}

      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Enviar feedback</DialogTitle>
            <DialogDescription>
              Cuéntanos qué funciona, qué no, o qué te gustaría ver. Adjuntamos
              automáticamente la sección actual y la versión de la app.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-1.5">
              <label htmlFor="feedback-message" className="text-sm font-medium">
                Mensaje
              </label>
              <Textarea
                id="feedback-message"
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value)
                  if (error) setError(null)
                }}
                placeholder="Describe tu feedback…"
                rows={5}
                aria-invalid={error != null}
                aria-describedby={error ? "feedback-error" : undefined}
              />
              {error && (
                <p id="feedback-error" className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="feedback-category" className="text-sm font-medium">
                Categoría
              </label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as FeedbackCategory)}
              >
                <SelectTrigger id="feedback-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug / problema</SelectItem>
                  <SelectItem value="idea">Idea / sugerencia</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="feedback-contact" className="text-sm font-medium">
                Contacto <span className="text-muted-foreground">(opcional)</span>
              </label>
              <Input
                id="feedback-contact"
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="email o nombre para responderte"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className={cn("h-4 w-4 animate-spin")} />}
              {submitting ? "Enviando…" : "Enviar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
