// Public surface of State Law Brain ingestion (sub-project F, phase 0):
// official-source adapters, the pure diff planner, and the DB executor.
// Imported by packages/jobs (weekly refresh) and scripts/ingest-state-statutes.ts.

export * from './sources'
export * from './plan'
export * from './sync'
