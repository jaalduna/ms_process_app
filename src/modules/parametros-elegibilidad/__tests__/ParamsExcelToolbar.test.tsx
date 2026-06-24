import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ParamsExcelToolbar } from "../components/ParamsExcelToolbar"
import type { ImportResult } from "../types"

// Mock sonner toast
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  }),
}))

// Mock the module API client
const downloadParamsExcel = vi.fn<(c: string, t: boolean) => Promise<void>>()
const importParamsExcel = vi.fn<(c: string, f: File) => Promise<ImportResult>>()
const publishParams = vi.fn<(t: string, c: string, rows: unknown) => Promise<unknown>>()
vi.mock("../api", () => ({
  downloadParamsExcel: (...a: [string, boolean]) => downloadParamsExcel(...a),
  importParamsExcel: (...a: [string, File]) => importParamsExcel(...a),
  publishParams: (...a: [string, string, unknown]) => publishParams(...a),
}))

const cleanResult: ImportResult = {
  country: "CL",
  valid: true,
  tables: [
    {
      table: "Code_Parametros",
      rows: [{ Variable: "umbral_excel", Valor: 7, "Observación": "via excel" }],
      diff: {
        row_count_before: 0,
        row_count_after: 1,
        added: [{ Variable: "umbral_excel", Valor: 7 }],
        removed: [],
        added_count: 1,
        removed_count: 0,
      },
      errors: [],
      warnings: [],
    },
  ],
}

const errorResult: ImportResult = {
  country: "CL",
  valid: false,
  tables: [
    {
      table: "Code_Parametros",
      rows: [],
      diff: { row_count_before: 0, row_count_after: 1, added: [{ Variable: "x", Valor: "abc" }], removed: [], added_count: 1, removed_count: 0 },
      errors: ["row 0: 'Valor' = \"abc\" is not a valid integer"],
      warnings: [],
    },
  ],
}

function pickFile() {
  const input = screen.getByTestId("import-excel-input") as HTMLInputElement
  const file = new File(["xlsxbytes"], "params_CL.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  return { input, file }
}

describe("ParamsExcelToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("downloads current values by default and the empty template after toggling", async () => {
    const user = userEvent.setup()
    render(<ParamsExcelToolbar country="CL" />)

    await user.click(screen.getByTestId("download-excel-btn"))
    expect(downloadParamsExcel).toHaveBeenLastCalledWith("CL", false)

    await user.click(screen.getByTestId("download-template-toggle"))
    expect(screen.getByTestId("download-mode-label")).toHaveTextContent(/template vacío/i)
    await user.click(screen.getByTestId("download-excel-btn"))
    expect(downloadParamsExcel).toHaveBeenLastCalledWith("CL", true)
  })

  it("imports a file, opens the review dialog and renders the diff (publish enabled when clean)", async () => {
    importParamsExcel.mockResolvedValue(cleanResult)
    const user = userEvent.setup()
    render(<ParamsExcelToolbar country="CL" />)

    const { input, file } = pickFile()
    await user.upload(input, file)

    expect(importParamsExcel).toHaveBeenCalledWith("CL", file)
    expect(await screen.findByTestId("review-dialog")).toBeVisible()
    expect(screen.getByTestId("diff-table")).toBeVisible()
    expect(screen.getByTestId("confirm-publish")).toBeEnabled()

    // publishing reuses the per-table publish endpoint for the changed table
    await user.click(screen.getByTestId("confirm-publish"))
    await waitFor(() => expect(publishParams).toHaveBeenCalledWith("Code_Parametros", "CL", cleanResult.tables[0].rows))
    expect(toastSuccess).toHaveBeenCalled()
  })

  it("shows backend errors and BLOCKS publish when the import is invalid", async () => {
    importParamsExcel.mockResolvedValue(errorResult)
    const user = userEvent.setup()
    render(<ParamsExcelToolbar country="CL" />)

    const { input, file } = pickFile()
    await user.upload(input, file)

    expect(await screen.findByTestId("dialog-error-badge")).toBeVisible()
    expect(screen.getByTestId("confirm-publish")).toBeDisabled()
    expect(publishParams).not.toHaveBeenCalled()
  })
})
