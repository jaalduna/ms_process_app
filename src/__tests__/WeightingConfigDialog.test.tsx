import { describe, it, expect, vi } from "vitest"
import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { WeightingConfigDialog } from "@/modules/pesaje/components/WeightingConfigDialog"
import {
  DEFAULT_WEIGHTING_PARAMS,
  WEIGHTING_PARAM_FIELDS,
  type WeightingParams,
} from "@/modules/pesaje/weightingParams"

describe("weightingParams defaults (param_configs.py)", () => {
  it("DEFAULT_WEIGHTING_PARAMS matches the documented param_configs.py values", () => {
    expect(DEFAULT_WEIGHTING_PARAMS).toEqual({
      N_PERIODOS_OUTLIERS: 12,
      MAX_ROUNDS_COLAPSO: 50,
      JERARQUIA_MIN_COLAPSO: 1,
      CORRECAO_BOUNDS: true,
      METODO_BOUNDS: "percentile",
      P_BOUNDS: 2,
      F_BOUNDS: 1.1,
      AGREGACAO_BOUNDS: "union",
      MAX_ERR_RATIO_BOUNDS: 2.0,
    })
  })

  it("does not expose the old placeholder params", () => {
    const keys = Object.keys(DEFAULT_WEIGHTING_PARAMS)
    for (const old of ["max_weight", "min_weight", "cv_threshold", "max_iterations", "trim_percentile"]) {
      expect(keys).not.toContain(old)
    }
  })

  it("every field descriptor key exists in the params type", () => {
    const keys = new Set(Object.keys(DEFAULT_WEIGHTING_PARAMS))
    for (const field of WEIGHTING_PARAM_FIELDS) {
      expect(keys.has(field.key)).toBe(true)
    }
  })
})

async function openDialog() {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: "Parametros de pesaje" }))
  return user
}

describe("WeightingConfigDialog", () => {
  it("renders the right control for each param: switch, selects, number inputs", async () => {
    render(<WeightingConfigDialog params={DEFAULT_WEIGHTING_PARAMS} onChange={vi.fn()} />)
    await openDialog()

    // bool -> switch
    expect(screen.getByRole("switch", { name: "Correccion de limites" })).toBeInTheDocument()

    // enums -> comboboxes
    expect(screen.getByRole("combobox", { name: "Metodo de limites" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Agregacion de limites" })).toBeInTheDocument()

    // numbers -> spinbuttons by label
    expect(screen.getByLabelText("Periodos para outliers")).toBeInTheDocument()
    expect(screen.getByLabelText("Maximo juntas marginales")).toBeInTheDocument()
    expect(screen.getByLabelText("Jerarquia minima de colapso")).toBeInTheDocument()
    expect(screen.getByLabelText("Percentil inferior de limites")).toBeInTheDocument()
    expect(screen.getByLabelText("Factor de margen de limites")).toBeInTheDocument()
    expect(screen.getByLabelText("Ratio max error correccion/IPF")).toBeInTheDocument()
  })

  it("editing a number field propagates the new value", async () => {
    const seen: WeightingParams[] = []
    function Harness() {
      const [params, setParams] = useState<WeightingParams>(DEFAULT_WEIGHTING_PARAMS)
      return (
        <WeightingConfigDialog
          params={params}
          onChange={(p) => {
            seen.push(p)
            setParams(p)
          }}
        />
      )
    }
    render(<Harness />)
    const user = await openDialog()

    const input = screen.getByLabelText("Maximo juntas marginales")
    await user.clear(input)
    await user.type(input, "80")

    expect(seen.at(-1)?.MAX_ROUNDS_COLAPSO).toBe(80)
  })

  it("'Restaurar valores por defecto' resets all params to defaults", async () => {
    const onChange = vi.fn()
    const mutated: WeightingParams = {
      ...DEFAULT_WEIGHTING_PARAMS,
      MAX_ROUNDS_COLAPSO: 99,
      METODO_BOUNDS: "iqr",
      CORRECAO_BOUNDS: false,
    }
    render(<WeightingConfigDialog params={mutated} onChange={onChange} />)
    const user = await openDialog()

    await user.click(screen.getByRole("button", { name: "Restaurar valores por defecto" }))
    expect(onChange).toHaveBeenCalledWith(DEFAULT_WEIGHTING_PARAMS)
  })
})
