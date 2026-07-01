import { describe, it, expect } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useSearchParams } from "react-router-dom"
import { ProcessWorkspaceTabs } from "@/components/ProcessWorkspaceTabs"

const TABS = [
  { value: "uno", label: "Uno", content: <div>contenido uno</div> },
  { value: "dos", label: "Dos", content: <div>contenido dos</div> },
  { value: "tres", label: "Tres", content: <div>contenido tres</div> },
]

function ParamProbe() {
  const [params] = useSearchParams()
  return <div data-testid="param">{params.get("tab") ?? ""}</div>
}

function renderTabs(initialEntry = "/", paramKey?: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ProcessWorkspaceTabs tabs={TABS} paramKey={paramKey} />
      <ParamProbe />
    </MemoryRouter>,
  )
}

describe("ProcessWorkspaceTabs", () => {
  it("renders one trigger per tab and defaults to the first tab", () => {
    renderTabs()
    expect(screen.getByRole("tab", { name: "Uno" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Dos" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Tres" })).toBeInTheDocument()
    expect(screen.getByText("contenido uno")).toBeVisible()
  })

  it("activates the tab named in the URL search param (survives refresh / deep-link)", () => {
    renderTabs("/?tab=tres")
    expect(screen.getByText("contenido tres")).toBeVisible()
    expect(screen.getByRole("tab", { name: "Tres" })).toHaveAttribute("data-state", "active")
  })

  it("falls back to the first tab when the param value is unknown", () => {
    renderTabs("/?tab=bogus")
    expect(screen.getByText("contenido uno")).toBeVisible()
  })

  it("writes the active tab into the URL search param on click", async () => {
    const user = userEvent.setup()
    renderTabs()
    await user.click(screen.getByRole("tab", { name: "Dos" }))
    await waitFor(() => expect(screen.getByTestId("param")).toHaveTextContent("dos"))
    expect(screen.getByText("contenido dos")).toBeVisible()
  })

  it("respects a custom param key", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={["/?vista=dos"]}>
        <ProcessWorkspaceTabs tabs={TABS} paramKey="vista" />
      </MemoryRouter>,
    )
    expect(screen.getByText("contenido dos")).toBeVisible()
    await user.click(screen.getByRole("tab", { name: "Tres" }))
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Tres" })).toHaveAttribute("data-state", "active"),
    )
  })
})
