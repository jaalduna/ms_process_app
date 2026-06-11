/** Brand mark: two offset nodes bridging an arc — nod to the SQL↔Databricks bridge. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-sidebar-primary" />
      <path
        d="M8 20.5c4-7 12-7 16-9"
        className="stroke-sidebar-primary-foreground"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="20.5" r="2.5" className="fill-sidebar-primary-foreground" />
      <circle cx="24" cy="11.5" r="2.5" className="fill-sidebar-primary-foreground" />
    </svg>
  )
}
