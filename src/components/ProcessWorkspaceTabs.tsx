import type { ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export interface ProcessWorkspaceTab {
  /** URL value for this tab (e.g. "ejecutar"). Reflected in the search param. */
  value: string
  label: string
  content: ReactNode
}

interface ProcessWorkspaceTabsProps {
  tabs: ProcessWorkspaceTab[]
  /** Search param key that holds the active tab. Defaults to "tab". */
  paramKey?: string
}

/**
 * Reusable per-process sub-navigation. Renders a shadcn `<Tabs>` whose active
 * tab is persisted in the URL search param (default `?tab=`), so it survives
 * refresh and is shareable/back-button friendly. The first tab is the default
 * when the param is missing or unknown.
 */
export function ProcessWorkspaceTabs({ tabs, paramKey = "tab" }: ProcessWorkspaceTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams()

  const values = tabs.map((t) => t.value)
  const fromUrl = searchParams.get(paramKey)
  const active = fromUrl && values.includes(fromUrl) ? fromUrl : tabs[0]?.value

  const handleChange = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set(paramKey, value)
        return next
      },
      { replace: false },
    )
  }

  return (
    <Tabs value={active} onValueChange={handleChange}>
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
