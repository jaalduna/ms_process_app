import { useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Separator } from "@/components/ui/separator"
import { Download, Loader2, PackageOpen } from "lucide-react"
import { downloadTagTableCSV, downloadTagZip } from "@/lib/api"
import { useTagDetail } from "../hooks/useTagDetail"
import type { TagTable as TagTableType } from "../types"

interface TagDetailModalProps {
  tagId: string | null
  open: boolean
  onClose: () => void
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString()
}

function statusVariant(status: string): "default" | "destructive" {
  return status === "failed" ? "destructive" : "default"
}

export function TagDetailModal({ tagId, open, onClose }: TagDetailModalProps) {
  const { data: tag, isLoading } = useTagDetail(open ? tagId : null)
  const [downloadingTable, setDownloadingTable] = useState<string | null>(null)
  const [downloadingZip, setDownloadingZip] = useState(false)
  const [zipDisabled, setZipDisabled] = useState(false)

  async function handleDownloadCSV(table: TagTableType) {
    if (!tag) return
    setDownloadingTable(table.table_name)
    try {
      await downloadTagTableCSV(tag.tag_id, table.table_name)
      toast.success(`Downloaded ${table.table_name}`)
    } catch {
      toast.error(`Failed to download ${table.table_name}`)
    } finally {
      setDownloadingTable(null)
    }
  }

  async function handleDownloadZip() {
    if (!tag) return
    setDownloadingZip(true)
    try {
      await downloadTagZip(tag.tag_id)
      toast.success("ZIP downloaded")
    } catch (err: unknown) {
      // Check for 501 Not Implemented
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 501) {
        setZipDisabled(true)
        toast.error("ZIP download not supported by backend")
      } else {
        toast.error("Failed to download ZIP")
      }
    } finally {
      setDownloadingZip(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {tag && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {tag.country.charAt(0).toUpperCase() + tag.country.slice(1)} / {tag.stage} / {tag.period}
                <Badge
                  variant={statusVariant(tag.status)}
                  className={tag.status === "completed" ? "bg-green-600 hover:bg-green-600/80" : ""}
                >
                  {tag.status}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                Tag detail with associated tables and download options.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Triggered by</span>
                  <p className="font-medium">{tag.triggered_by}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p className="font-medium">{tag.status}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Started</span>
                  <p className="font-medium">{formatDateTime(tag.started_at)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Completed</span>
                  <p className="font-medium">{formatDateTime(tag.completed_at)}</p>
                </div>
              </div>

              <Separator />

              {/* Tables */}
              <div>
                <span className="text-muted-foreground">Tables ({tag.tables.length})</span>
                {tag.tables.length === 0 ? (
                  <div className="mt-2 flex items-center justify-center rounded-lg border border-dashed p-6">
                    <p className="text-sm text-muted-foreground">No tables produced</p>
                  </div>
                ) : (
                  <Table className="mt-2">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Table Name</TableHead>
                        <TableHead className="text-right">Rows</TableHead>
                        <TableHead className="w-[60px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tag.tables.map((t) => (
                        <TableRow key={t.table_name}>
                          <TableCell className="font-mono text-xs">{t.full_name}</TableCell>
                          <TableCell className="text-right">{t.row_count.toLocaleString()}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={downloadingTable === t.table_name}
                              onClick={() => handleDownloadCSV(t)}
                            >
                              {downloadingTable === t.table_name ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                              <span className="ml-1">CSV</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <Separator />

              {/* Download All as ZIP */}
              <Button
                variant="outline"
                className="w-full"
                disabled={downloadingZip || zipDisabled || tag.tables.length === 0}
                onClick={handleDownloadZip}
                title={zipDisabled ? "ZIP download not supported by backend" : undefined}
              >
                {downloadingZip ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PackageOpen className="mr-2 h-4 w-4" />
                )}
                {zipDisabled ? "ZIP not supported" : downloadingZip ? "Downloading..." : "Download All as ZIP"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
