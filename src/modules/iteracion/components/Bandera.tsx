import AR from "country-flag-icons/react/3x2/AR"
import BO from "country-flag-icons/react/3x2/BO"
import BR from "country-flag-icons/react/3x2/BR"
import CL from "country-flag-icons/react/3x2/CL"
import CO from "country-flag-icons/react/3x2/CO"
import EC from "country-flag-icons/react/3x2/EC"
import MX from "country-flag-icons/react/3x2/MX"
import PE from "country-flag-icons/react/3x2/PE"
import { Globe2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Banderas en SVG y no emoji: en Windows los emoji de bandera se ven como letras ("BR").
const BANDERAS: Record<string, typeof AR> = {
  argentina: AR, bolivia: BO, brasil: BR, chile: CL, colombia: CO, ecuador: EC, mexico: MX, peru: PE,
}

/** Bandera del país (los paneles OOH usan la del país base). Centroamérica no tiene una sola. */
export function Bandera({ pais, className }: { pais: string; className?: string }) {
  const Flag = BANDERAS[pais.replace(/_ooh$/, "")]
  if (!Flag) {
    return <Globe2 className={cn("h-3.5 w-[21px] shrink-0 text-muted-foreground", className)} aria-hidden />
  }
  return (
    <Flag
      className={cn("h-3.5 w-[21px] shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.12)]", className)}
      aria-hidden
    />
  )
}
