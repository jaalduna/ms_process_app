import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { Tag, TagListResponse } from "../types"

interface TagTableProps {
  data: TagListResponse | undefined
  page: number
  onPageChange: (page: number) => void
  onRowClick: (tagId: string) => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function statusVariant(status: string): "default" | "destructive" {
  return status === "failed" ? "destructive" : "default"
}

function statusLabel(status: string): string {
  return status === "completed" ? "OK" : "Failed"
}

export function TagTable({ data, page, onPageChange, onRowClick }: TagTableProps) {
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
            <TableHead>Country</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Tables</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((tag: Tag) => (
            <TableRow
              key={tag.tag_id}
              className="cursor-pointer"
              onClick={() => onRowClick(tag.tag_id)}
            >
              <TableCell className="font-medium">
                {tag.country.charAt(0).toUpperCase() + tag.country.slice(1)}
              </TableCell>
              <TableCell>{tag.stage}</TableCell>
              <TableCell className="font-mono text-xs">{tag.period}</TableCell>
              <TableCell>{formatDate(tag.completed_at)}</TableCell>
              <TableCell>{tag.tables_count.toLocaleString()}</TableCell>
              <TableCell>
                <Badge
                  variant={statusVariant(tag.status)}
                  className={tag.status === "completed" ? "bg-green-600 hover:bg-green-600/80" : ""}
                >
                  {statusLabel(tag.status)}
                </Badge>
              </TableCell>
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
