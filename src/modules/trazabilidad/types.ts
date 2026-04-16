export interface Tag {
  table_name: string
  version: number
  tag: string
  description: string | null
  created_by: string
  created_at: string
  job_id: string
}

export interface TagFilters {
  table_name?: string
  tag?: string
  exclude_sincronizacion?: boolean
}

export interface TagListResponse {
  items: Tag[]
  total: number
  limit: number
  offset: number
}
