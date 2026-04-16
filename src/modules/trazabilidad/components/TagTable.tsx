import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { Tag, TagListResponse } from "../types"

interface TagTableProps {
  data: TagListResponse | undefined
  page: number
  onPageChange: (page: number) => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function shortTableName(fullName: string): string {
  // Extract just the table name from backtick-quoted catalog.schema.table
  const parts = fullName.replace(/`/g, "").split(".")
  return parts[parts.length - 1] ?? fullName
}

export function TagTable({ data, page, onPageChange }: TagTableProps) {
  if (!data) return null

  const { items, total, limit } = data
  const totalPages = Math.max(1, Math.ceil(total / limit))

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed p-12">
        <p className="text-sm text-muted-foreground">No tags found matching your filters</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tag</TableHead>
            <TableHead>Table</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Created By</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((tag: Tag, idx: number) => (
            <TableRow key={`${tag.tag}-${tag.table_name}-${idx}`}>
              <TableCell className="font-mono text-xs">{tag.tag}</TableCell>
              <TableCell
                className="max-w-[260px] truncate font-mono text-xs"
                title={tag.table_name}
              >
                {shortTableName(tag.table_name)}
              </TableCell>
              <TableCell className="font-mono text-xs">{tag.version}</TableCell>
              <TableCell className="text-xs">{tag.created_by}</TableCell>
              <TableCell className="text-xs">{formatDate(tag.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString()} tag{total !== 1 ? "s" : ""} total
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
