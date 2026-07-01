export interface ModuleConfig {
  overview: boolean
  sync: boolean
  calibration: boolean
  elegibilidad: boolean
  prices: boolean
  weighting: boolean
  mtr: boolean
  formato4: boolean
  qmstr: boolean
  macrocac: boolean
  traceability: boolean
  admin: boolean
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
    formato4: config?.formato4 ?? false,
    qmstr: config?.qmstr ?? false,
    macrocac: config?.macrocac ?? false,
    traceability: config?.traceability ?? false,
    // Enabled by default: the module is additionally gated by the admin role.
    admin: config?.admin ?? true,
    // Parameters editor (mockup) — gated by the admin role like admin.
    parametros: config?.parametros ?? true,
    // Eligibility parameters editor (JAA-547) — gated by the admin role.
    "parametros-elegibilidad": config?.["parametros-elegibilidad"] ?? true,
  }
}
