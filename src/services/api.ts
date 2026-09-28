// Talks to the Express + SQLite backend (proxied at /api by Vite). Data is permanent.
import { conditionDefinitions, scenarios } from '../data/mock'
import type { ConditionDefinition, InspectionResult, Product, ReturnRecord, ScenarioKey } from '../types'
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
async function http<T>(url: string, body?: unknown): Promise<T> {
  let r: Response
  try { r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined) }
  catch { throw new Error('Cannot reach the server. Start it with npm run dev.') }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${r.status})`)
  return data as T
}
export const getProducts = () => http<Product[]>('/api/products')
export const addProduct = (p: Product) => http<Product>('/api/products', p)
export const getReturns = () => http<ReturnRecord[]>('/api/returns')
export const getReturnById = (id: string) => http<ReturnRecord>(`/api/returns/${id}`)
export const addReturn = (r: { id: string; orderId: string; sku: string }) => http<ReturnRecord>('/api/returns', r)
export const getInspectionHistory = async () => (await getReturns()).filter(r => r.state === 'Completed')
export async function getConditionDefinitions(): Promise<ConditionDefinition[]> { await wait(100); return conditionDefinitions }
// Still mocked: replace with the real AI/ML endpoint when it exists.
export async function inspectReturn(_returnId: string, _images: File[], scenario: ScenarioKey = 'missing'): Promise<InspectionResult> {
  await wait(500); return { ...scenarios[scenario].result, timestamp: new Date().toISOString() } }
export const submitInspection = (p: { returnId: string; sku?: string; result?: InspectionResult; action: 'APPROVE' | 'OVERRIDE' | 'MANUAL_REVIEW'; disposition?: string; reason?: string; notes?: string }) =>
  http<{ operator: string; reviewedAt: string }>('/api/inspections', p)
export const sendSupport = (m: { name: string; email: string; subject: string; message: string }) =>
  http<{ saved: boolean; emailed: boolean; supportTo: string | null }>('/api/support', m)
