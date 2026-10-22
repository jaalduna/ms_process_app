import { useMemo, useState } from "react"
import { BookOpen, LifeBuoy, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import guia from "./guia_casos.json"

interface Caso {
  id: string
  titulo: string
  sintoma: string
  que_hacer: string[]
  /** null: el caso se resuelve sin escalar */
  escalar: string | null
}

const CASOS: Caso[] = guia.casos

/** Sin tildes ni mayúsculas: «revertir» encuentra «Revertir» y «distribucion» encuentra «distribución». */
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/**
 * «¿Qué hago si…?»: los casos del manual de usuario (síntoma, qué hacer y cuándo escalar), con búsqueda.
 * La fuente es `guia_casos.json`, el mismo contenido del manual (mtr docs/flujo/guia_casos_qmstr.json).
 */
export function GuiaCasos() {
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState("")
  const [caso, setCaso] = useState<string | null>(null)
  const casos = useMemo(() => {
    const t = plano(q.trim())
    if (!t) return CASOS
    return CASOS.filter((c) => plano([c.titulo, c.sintoma, ...c.que_hacer].join(" ")).includes(t))
  }, [q])
  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)} data-testid="qf-guia">
        <LifeBuoy /> ¿Qué hago si…?
      </Button>
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent className="w-full gap-0 sm:max-w-xl" data-testid="qf-guia-panel">
          <SheetHeader className="border-b">
            <SheetTitle>¿Qué hago si…?</SheetTitle>
            <SheetDescription>
              Los casos del manual de usuario: qué ves, qué hacer y cuándo escalar.
            </SheetDescription>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca por lo que ves: hito 3, revertir, permiso…"
                className="pl-8" aria-label="Buscar un caso" data-testid="qf-guia-buscar" />
            </div>
          </SheetHeader>
          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {casos.length === 0 && (
              <p className="text-sm text-muted-foreground" data-testid="qf-guia-vacio">
                Ningún caso calza con «{q}». Si es un problema con una tanda, avísale a {guia.contacto_escalamiento}.
              </p>
            )}
            {casos.map((c) => {
              const abiertoCaso = caso === c.id || (q.trim() !== "" && casos.length === 1)
              return (
                <article key={c.id} className="rounded-lg border" data-testid={`qf-guia-caso-${c.id}`}>
                  <button type="button" className="w-full px-3 py-2.5 text-left text-sm font-semibold"
                    aria-expanded={abiertoCaso} onClick={() => setCaso(abiertoCaso ? null : c.id)}>
                    {c.titulo}
                  </button>
                  {abiertoCaso && (
                    <div className="space-y-2 border-t px-3 py-2.5 text-sm">
                      <p><span className="font-medium">Qué ves: </span><span className="text-muted-foreground">{c.sintoma}</span></p>
                      <div>
                        <p className="font-medium">Qué hacer</p>
                        <ol className="mt-1 list-decimal space-y-1 pl-5">
                          {c.que_hacer.map((paso) => <li key={paso}>{paso}</li>)}
                        </ol>
                      </div>
                      {c.escalar && (
                        <p><span className="font-medium">Escala si: </span><span className="text-muted-foreground">{c.escalar}</span></p>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
          <footer className="flex items-start gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
            <BookOpen className="mt-0.5 size-3.5 shrink-0" />
            <span>Para escalar: {guia.contacto_escalamiento}.</span>
          </footer>
        </SheetContent>
      </Sheet>
    </>
  )
}
