import { Router } from "express"

const router = Router()

// ---------------------------------------------------------------------------
// Users store
// ---------------------------------------------------------------------------

const users = new Map([
  ["admin@example.com", { email: "admin@example.com", name: "Admin User", roles: ["admin"], countries: ["*"] }],
  ["ana.lista@example.com", { email: "ana.lista@example.com", name: "Ana Lista", roles: ["analyst"], countries: ["chile", "mexico"] }],
  ["pre.cios@example.com", { email: "pre.cios@example.com", name: "Pre Cios", roles: ["prices_specialist"], countries: ["brasil"] }],
  ["ele.gibilidad@example.com", { email: "ele.gibilidad@example.com", name: "Ele Gibilidad", roles: ["eligibility_specialist"], countries: ["chile", "peru"] }],
])

// ---------------------------------------------------------------------------
// Jobs store
// ---------------------------------------------------------------------------

let jobsDefaults = {
  catalog: "001-calibration-3-0-dev",
  results_volume_template: "/Volumes/{catalog}/gold_{country}/results/{tag}.zip",
}

let jobsMap = {
  calibracion: { brasil: 203536122848629, chile: 745892100332415 },
  precios: { brasil: 118822334455667 },
  pesaje: { chile: 99887766554433 },
}

// ---------------------------------------------------------------------------
// Stages store
// ---------------------------------------------------------------------------

const stagesSeed = [
  { code: "inicio", name: "Inicio", position: 0 },
  { code: "precios", name: "Precios", position: 1 },
  { code: "elegibilidad", name: "Elegibilidad", position: 2 },
  { code: "pesaje", name: "Pesaje", position: 3 },
  { code: "calibracion", name: "Calibracion", position: 4 },
  { code: "mtr", name: "MTR", position: 5 },
]

const stages = new Map(stagesSeed.map((s) => [s.code, { ...s }]))

function sortedStages() {
  return [...stages.values()].sort((a, b) => a.position - b.position).map(({ code, name }) => ({ code, name }))
}

// ---------------------------------------------------------------------------
// User routes
// ---------------------------------------------------------------------------

router.get("/admin/users", (_req, res) => {
  res.json({ users: [...users.values()] })
})

router.get("/admin/users/:email", (req, res) => {
  const key = req.params.email.toLowerCase()
  const user = users.get(key)
  if (!user) return res.status(404).json({ error: "not_found", message: `User ${key} not found` })
  res.json(user)
})

router.put("/admin/users/:email", (req, res) => {
  const key = req.params.email.toLowerCase()
  const existing = users.get(key) ?? {}
  const { name = existing.name ?? "", roles = existing.roles ?? ["analyst"], countries = existing.countries ?? [] } = req.body
  const updated = { email: key, name, roles, countries }
  users.set(key, updated)
  res.json(updated)
})

router.delete("/admin/users/:email", (req, res) => {
  const key = req.params.email.toLowerCase()
  if (!users.has(key)) return res.status(404).json({ error: "not_found", message: `User ${key} not found` })
  users.delete(key)
  res.json({ deleted: true, email: key })
})

// ---------------------------------------------------------------------------
// Jobs routes
// ---------------------------------------------------------------------------

router.get("/admin/jobs", (_req, res) => {
  res.json({ defaults: jobsDefaults, jobs: jobsMap })
})

router.put("/admin/jobs/defaults", (req, res) => {
  const { catalog, results_volume_template } = req.body
  if (catalog !== undefined) jobsDefaults.catalog = catalog
  if (results_volume_template !== undefined) jobsDefaults.results_volume_template = results_volume_template
  res.json(jobsDefaults)
})

router.put("/admin/jobs", (req, res) => {
  const { jobs: newJobs, defaults: newDefaults } = req.body
  if (newJobs !== undefined) jobsMap = newJobs
  if (newDefaults !== undefined) {
    if (newDefaults.catalog !== undefined) jobsDefaults.catalog = newDefaults.catalog
    if (newDefaults.results_volume_template !== undefined) jobsDefaults.results_volume_template = newDefaults.results_volume_template
  }
  res.json({ defaults: jobsDefaults, jobs: jobsMap })
})

router.put("/admin/jobs/:process/:country", (req, res) => {
  const { process, country } = req.params
  const { job_id } = req.body
  if (!jobsMap[process]) jobsMap[process] = {}
  jobsMap[process][country] = job_id
  res.json({ process, country, job_id })
})

router.delete("/admin/jobs/:process/:country", (req, res) => {
  const { process, country } = req.params
  if (!jobsMap[process] || jobsMap[process][country] === undefined) {
    return res.status(404).json({ error: "not_found", message: `Job ${process}/${country} not found` })
  }
  delete jobsMap[process][country]
  if (Object.keys(jobsMap[process]).length === 0) delete jobsMap[process]
  res.json({ deleted: true, process, country })
})

// ---------------------------------------------------------------------------
// Stages routes
// ---------------------------------------------------------------------------

router.get("/admin/stages", (_req, res) => {
  res.json({ stages: sortedStages() })
})

router.put("/admin/stages", (req, res) => {
  const { stages: incoming } = req.body
  stages.clear()
  incoming.forEach((s, idx) => {
    stages.set(s.code, { code: s.code, name: s.name, position: s.position ?? idx })
  })
  res.json({ stages: sortedStages() })
})

router.put("/admin/stages/:code", (req, res) => {
  const { code } = req.params
  const existing = stages.get(code)
  const { name, position } = req.body
  const nextPosition = position ?? existing?.position ?? stages.size
  stages.set(code, { code, name, position: nextPosition })
  res.json({ code, name })
})

router.delete("/admin/stages/:code", (req, res) => {
  if (!stages.has(req.params.code)) {
    return res.status(404).json({ error: "not_found", message: `Stage ${req.params.code} not found` })
  }
  stages.delete(req.params.code)
  res.json({ deleted: true, code: req.params.code })
})

// ---------------------------------------------------------------------------
// Cache reload
// ---------------------------------------------------------------------------

router.post("/admin/reload", (_req, res) => {
  res.json({ reloaded: true })
})

export default router
