export interface ModuleConfig {
  overview: boolean
  sync: boolean
  calibration: boolean
  elegibilidad: boolean
  prices: boolean
  weighting: boolean
  mtr: boolean
  traceability: boolean
  [key: string]: boolean
}

export function useModuleConfig(): ModuleConfig {
  const config = (window as unknown as { __APP_CONFIG__?: { modules?: Partial<ModuleConfig> } }).__APP_CONFIG__?.modules
  return {
    overview: config?.overview ?? false,
    sync: config?.sync ?? false,
    calibration: config?.calibration ?? true,
    elegibilidad: config?.elegibilidad ?? true,
    prices: config?.prices ?? false,
    weighting: config?.weighting ?? false,
    mtr: config?.mtr ?? false,
    traceability: config?.traceability ?? false,
  }
}
