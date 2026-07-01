import { Component, type ErrorInfo, type ReactNode } from "react"
import { captureError } from "@/lib/telemetry"

interface Props {
  children: ReactNode
  /** Optional custom fallback; defaults to the built-in error screen. */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

/**
 * App-level React error boundary (JAA-429). Catches render/lifecycle errors,
 * reports them to telemetry (`kind: "react"`), and shows a recoverable fallback.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureError({
      message: error.message,
      stack: error.stack ?? info.componentStack ?? undefined,
      kind: "react",
    })
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback

    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
      >
        <h1 className="text-2xl font-semibold">Algo salió mal</h1>
        <p className="max-w-md text-muted-foreground">
          Ocurrió un error inesperado y se reportó automáticamente. Puedes recargar la aplicación
          para continuar.
        </p>
        <button
          type="button"
          data-telemetry="error-boundary-reload"
          onClick={this.handleReload}
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Recargar
        </button>
      </div>
    )
  }
}
