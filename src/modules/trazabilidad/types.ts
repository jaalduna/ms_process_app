export interface Tag {
  tag_id: string
  run_id: string
  country: string
  period: number
  stage: string
  triggered_by: string
  started_at: string
  completed_at: string
  status: "completed" | "failed"
  tables_count: number
  created_at: string
}

export interface TagDetail extends Tag {
  tables: TagTable[]
}

export interface TagTable {
  table_name: string
  full_name: string
  catalog: string
  schema_name: string
  row_count: number
  size_bytes?: number
}

export interface TagFilters {
  country?: string
  period?: number
  stage?: string
  date_from?: string
  date_to?: string
}

export interface TagListResponse {
  items: Tag[]
  total: number
  limit: number
  offset: number
}
