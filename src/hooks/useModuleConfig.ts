export interface ModuleConfig {
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
  const config = (window as any).__APP_CONFIG__?.modules
  return {
    sync: config?.sync ?? true,
    calibration: config?.calibration ?? true,
    elegibilidad: config?.elegibilidad ?? true,
    prices: config?.prices ?? false,
    weighting: config?.weighting ?? false,
    mtr: config?.mtr ?? false,
    traceability: config?.traceability ?? false,
  }
}
