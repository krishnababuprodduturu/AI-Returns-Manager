import { scenarios } from '../data/mock'
import type { ConditionDefinition, InspectionResult, Product, ReturnDetail, ReturnImage, ReturnRecord, ScenarioKey } from '../types'
import { requireSupabase } from './supabase'

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
type Row = Record<string, any>

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}
function text(...values: unknown[]): string {
  const value = values.find(v => v !== null && v !== undefined && v !== '')
  return value == null ? '' : String(value)
}
function status(value: unknown): ReturnRecord['state'] {
  const normalized = String(value ?? '').toLowerCase().replace(/[ _-]/g, '')
  if (normalized === 'completed' || normalized === 'complete') return 'Completed'
  if (normalized === 'manualreview') return 'Manual Review'
  if (normalized === 'processing') return 'Processing'
  return 'Pending'
}
function asStatus(value: unknown): ReturnRecord['identity'] {
  return value === 'PASS' || value === 'FAIL' ? value : 'UNCERTAIN'
}
function asDisposition(value: unknown): ReturnRecord['disposition'] {
  return value === 'RESTOCK' || value === 'REFURBISH' || value === 'LIQUIDATE' || value === 'DISPOSE' ? value : 'UNCERTAIN'
}
function productKey(row: Row): string { return text(row.id, row.product_id, row.sku, row.product_sku) }
function makeReturn(row: Row, products: Row[], orders: Row[], latestInspection?: Row, latestAction?: Row): ReturnRecord {
  const order = orders.find(item => text(item.id, item.order_id) === text(row.order_id, row.orderId))
  const key = text(row.product_id, row.product_sku, row.sku, order?.product_id, order?.sku)
  const product = products.find(item => productKey(item) === key || text(item.sku, item.product_sku) === key)
  const stateValue = latestAction?.action === 'MANUAL_REVIEW' ? 'Manual Review' : row.state ?? row.status ?? (latestInspection ? 'Completed' : 'Pending')
  return {
    id: text(row.id), return_number: text(row.return_number, row.return_id),
    orderId: text(order?.order_number, order?.order_id, row.order_number, row.order_id, row.orderId),
    sku: text(product?.sku, product?.product_sku, row.sku, row.product_sku, order?.sku),
    product: text(product?.name, product?.product_name, row.product, row.product_name, 'Unknown product'),
    received: text(row.received_at, row.received, row.created_at), state: status(stateValue),
    identity: asStatus(latestInspection?.identity_status ?? row.identity_status ?? row.identity),
    completeness: asStatus(latestInspection?.completeness_status ?? row.completeness_status ?? row.completeness),
    condition: text(latestInspection?.condition_label, row.condition_label, row.condition, 'UNCERTAIN'),
    disposition: asDisposition(latestInspection?.disposition ?? row.disposition),
    confidence: Number(latestInspection?.overall_confidence ?? row.overall_confidence ?? row.confidence ?? 0)
  }
}

export async function getProducts(): Promise<Product[]> {
  const client = requireSupabase()
  const [{ data: products, error: productsError }, { data: components, error: componentsError }] = await Promise.all([
    client.from('products').select('*'), client.from('product_components').select('*')
  ])
  fail('Could not load products from Supabase', productsError)
  fail('Could not load product components from Supabase', componentsError)
  return (products ?? []).map((row: Row) => {
    const key = productKey(row)
    const required = (components ?? []).filter((component: Row) =>
      text(component.product_id, component.product_sku, component.sku) === key ||
      text(component.product_sku, component.sku) === text(row.sku, row.product_sku))
    return {
      sku: text(row.sku, row.product_sku), name: text(row.name, row.product_name),
      category: text(row.category, row.product_category, 'General'),
      components: required.map((component: Row) => text(component.component_name, component.name, component.component)).filter(Boolean)
    }
  })
}

export async function addProduct(product: Product): Promise<Product> {
  const client = requireSupabase()
  const { data, error } = await client.from('products').insert({ sku: product.sku, name: product.name, category: product.category }).select('*').single()
  fail('Could not save product', error)
  if (product.components.length) {
    const rows = product.components.map(component_name => ({ product_id: data.id, component_name }))
    const { error: componentError } = await client.from('product_components').insert(rows)
    fail('Product was created, but its components could not be saved', componentError)
  }
  return product
}

export async function getReturns(): Promise<ReturnRecord[]> {
  const client = requireSupabase()
  const [returnsResult, productsResult, ordersResult, inspectionsResult, auditResult] = await Promise.all([
    client.from('returns').select('*'), client.from('products').select('*'), client.from('orders').select('*'),
    client.from('inspections').select('*'), client.from('inspection_audit_log').select('*')
  ])
  fail('Could not load returns from Supabase', returnsResult.error)
  fail('Could not load products for returns', productsResult.error)
  fail('Could not load orders for returns', ordersResult.error)
  fail('Could not load inspection history', inspectionsResult.error)
  fail('Could not load inspection review history', auditResult.error)
  const inspections = inspectionsResult.data ?? []
  const audits = auditResult.data ?? []
  return (returnsResult.data ?? []).map((row: Row) => {
    const returnUuid = text(row.id)
    const latestInspection = inspections.filter((item: Row) => text(item.return_id) === returnUuid)
      .sort((a: Row, b: Row) => text(b.created_at).localeCompare(text(a.created_at)))[0]
    const latestAction = audits.filter((item: Row) => text(item.inspection_id) === text(latestInspection?.id, latestInspection?.inspection_id))
      .sort((a: Row, b: Row) => text(b.created_at).localeCompare(text(a.created_at)))[0]
    return makeReturn(row, productsResult.data ?? [], ordersResult.data ?? [], latestInspection, latestAction)
  }).sort((a: ReturnRecord, b: ReturnRecord) => b.received.localeCompare(a.received))
}

export async function getReturnById(identifier: string): Promise<ReturnDetail> {
  const client = requireSupabase()
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier)
  const returnQuery = client.from('returns').select('*')
  const { data: row, error } = await (isUuid ? returnQuery.eq('id', identifier) : returnQuery.eq('return_number', identifier)).maybeSingle()
  fail('Could not load return', error)
  if (!row) throw new Error(`Return ${identifier} was not found.`)
  const returnUuid = text(row.id)
  const [productsResult, ordersResult, imagesResult, inspectionsResult] = await Promise.all([
    client.from('products').select('*'), client.from('orders').select('*'),
    client.from('return_images').select('*').eq('return_id', returnUuid),
    client.from('inspections').select('*').eq('return_id', returnUuid)
  ])
  fail('Could not load return product', productsResult.error)
  fail('Could not load return order', ordersResult.error)
  fail('Could not load return images', imagesResult.error)
  fail('Could not load return inspections', inspectionsResult.error)
  const inspections: Row[] = inspectionsResult.data ?? []
  const latestInspection = inspections.sort((a, b) => text(b.created_at).localeCompare(text(a.created_at)))[0]
  const productId = text(row.product_id, ordersResult.data?.find((o: Row) => text(o.id, o.order_id) === text(row.order_id))?.product_id)
  const product = (productsResult.data ?? []).find((p: Row) => productKey(p) === productId || text(p.sku, p.product_sku) === productId)
  const images = await Promise.all((imagesResult.data ?? []).map(async (image: Row) => {
    const path = text(image.image_url)
    const { data, error: signedError } = await client.storage.from('return-images').createSignedUrl(path, 3600)
    fail(`Could not create a signed URL for ${text(image.file_name, 'return image')}`, signedError)
    if (!data) throw new Error(`Could not create a signed URL for ${text(image.file_name, 'return image')}.`)
    return { id: text(image.id), returnId: returnUuid, imageUrl: path, imageCategory: text(image.image_category), fileName: text(image.file_name), signedUrl: data.signedUrl }
  }))
  let inspection: ReturnDetail['inspection'] = null
  if (latestInspection) {
    const inspectionId = text(latestInspection.id, latestInspection.inspection_id)
    const [missingResult, evidenceResult] = await Promise.all([
      client.from('inspection_missing_components').select('*').eq('inspection_id', inspectionId),
      client.from('inspection_evidence').select('*').eq('inspection_id', inspectionId)
    ])
    fail('Could not load missing components', missingResult.error)
    fail('Could not load inspection evidence', evidenceResult.error)
    inspection = { ...latestInspection, missingComponents: missingResult.data ?? [], evidence: evidenceResult.data ?? [] }
  }
  return { ...makeReturn(row, productsResult.data ?? [], ordersResult.data ?? [], latestInspection), product: text(product?.name, product?.product_name, row.product_name, 'Unknown product'), images, inspection }
}

export async function createReturn(input: { returnNumber: string; orderId: string; sku: string }): Promise<ReturnRecord> {
  const client = requireSupabase()
  const { data: existing, error: existingError } = await client.from('returns').select('*').eq('return_number', input.returnNumber).maybeSingle()
  fail('Could not check for an existing return', existingError)
  if (existing) {
    return { ...makeReturn(existing, [], []), orderId: input.orderId, sku: input.sku }
  }
  const [productsResult, ordersResult] = await Promise.all([client.from('products').select('*'), client.from('orders').select('*')])
  fail('Could not look up product catalogue', productsResult.error)
  fail('Could not look up orders', ordersResult.error)
  const product = (productsResult.data ?? []).find((item: Row) => text(item.sku, item.product_sku) === input.sku)
  if (!product) throw new Error(`Product ${input.sku} was not found in the Supabase catalogue.`)
  const order = (ordersResult.data ?? []).find((item: Row) => [item.order_number, item.order_id, item.id].some(value => text(value) === input.orderId))
  if (!order) throw new Error(`Order ${input.orderId} was not found in Supabase.`)
  const orderProductId = text(order.product_id, order.product_sku, order.sku)
  if (orderProductId && orderProductId !== productKey(product) && orderProductId !== input.sku) {
    throw new Error(`Product ${input.sku} does not match order ${input.orderId}.`)
  }
  const { data, error } = await client.from('returns').insert({ return_number: input.returnNumber, order_id: text(order.id) }).select('*').single()
  fail('Could not create return in Supabase', error)
  return makeReturn(data, productsResult.data ?? [], ordersResult.data ?? [])
}

export async function getInspectionHistory(): Promise<ReturnRecord[]> {
  return (await getReturns()).filter(record => record.state === 'Completed' || record.state === 'Manual Review')
}

export async function getConditionDefinitions(): Promise<ConditionDefinition[]> {
  const { data, error } = await requireSupabase().from('condition_definitions').select('*')
  fail('Could not load condition definitions from Supabase', error)
  return (data ?? []).map((row: Row) => ({ label: text(row.label, row.condition_label, row.name), description: text(row.description, row.details) }))
    .filter((item: ConditionDefinition) => item.label)
}

export interface UploadedReturnImage extends ReturnImage { signedUrl: string; localId?: string }
export async function uploadReturnImage(returnUuid: string, file: File, category = 'Other'): Promise<UploadedReturnImage> {
  const client = requireSupabase()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'image'
  const path = `returns/${returnUuid}/${crypto.randomUUID()}-${safeName}`
  const { error: uploadError } = await client.storage.from('return-images').upload(path, file, { contentType: file.type, upsert: false })
  fail(`Image upload failed for ${file.name}`, uploadError)
  const { data: image, error: insertError } = await client.from('return_images').insert({
    return_id: returnUuid, image_url: path, image_category: category, file_name: file.name
  }).select('*').single()
  if (insertError) {
    await client.storage.from('return-images').remove([path])
    throw new Error(`Image uploaded, but its database record could not be saved: ${insertError.message}`)
  }
  const { data: signed, error: signedError } = await client.storage.from('return-images').createSignedUrl(path, 3600)
  fail(`Storage signed URL failed for ${file.name}`, signedError)
  if (!signed) throw new Error(`Storage did not return a signed URL for ${file.name}.`)
  return { id: text(image.id), returnId: returnUuid, imageUrl: path, imageCategory: category, fileName: file.name, signedUrl: signed.signedUrl }
}

export async function runAIInspection(_returnId: string, _images: UploadedReturnImage[]): Promise<InspectionResult> {
  if (!API_URL) throw new Error('VITE_API_URL is not configured for the Render backend.')
  throw new Error(`Render at ${API_URL} has no AI image-inspection endpoint in the current server/index.js. No request was sent; implement an image-analysis route before enabling live AI inspections.`)
}

export function getDemoInspectionResult(scenario: ScenarioKey): InspectionResult {
  return { ...scenarios[scenario].result, timestamp: new Date().toISOString() }
}

export async function saveInspection(returnUuid: string, result: InspectionResult): Promise<string> {
  const client = requireSupabase()
  const overallConfidence = (result.identity.confidence + result.completeness.confidence + result.condition.confidence + result.disposition.confidence) / 4
  const { data: inspection, error } = await client.from('inspections').insert({
    return_id: returnUuid, identity_status: result.identity.status, identity_confidence: result.identity.confidence,
    completeness_status: result.completeness.status, completeness_confidence: result.completeness.confidence,
    condition_label: result.condition.label, condition_confidence: result.condition.confidence,
    disposition: result.disposition.recommendation, disposition_confidence: result.disposition.confidence,
    overall_confidence: overallConfidence
  }).select('*').single()
  fail('Could not save inspection result to Supabase', error)
  const inspectionId = text(inspection.id, inspection.inspection_id)
  if (!inspectionId) throw new Error('Inspection was saved, but Supabase did not return its ID.')
  if (result.completeness.missing.length) {
    const rows = result.completeness.missing.map(component_name => ({ inspection_id: inspectionId, component_name }))
    const { error: missingError } = await client.from('inspection_missing_components').insert(rows)
    fail('Could not save missing inspection components', missingError)
  }
  return inspectionId
}

export async function saveEvidence(inspectionId: string, result: InspectionResult, images: UploadedReturnImage[]): Promise<void> {
  const client = requireSupabase()
  const evidenceRows = (['identity', 'completeness', 'condition'] as const).flatMap(findingType =>
    result[findingType].evidence.map(item => {
      const image = images.find(candidate => candidate.localId === item.imageId || candidate.id === item.imageId)
      return {
        inspection_id: inspectionId, finding_type: findingType, finding: result[findingType].reason,
        evidence_text: item.text, image_id: image?.id || null, confidence: result[findingType].confidence
      }
    }))
  if (evidenceRows.length) {
    const { error: evidenceError } = await client.from('inspection_evidence').insert(evidenceRows)
    fail('Could not save inspection evidence', evidenceError)
  }
}

export async function submitInspection(p: { returnId: string; inspectionId: string; action: 'APPROVE' | 'OVERRIDE' | 'MANUAL_REVIEW'; disposition?: string; reason?: string; notes?: string }): Promise<{ operator: string; reviewedAt: string }> {
  const client = requireSupabase()
  const operator = 'Current User'
  const reviewedAt = new Date().toISOString()
  const { error: auditError } = await client.from('inspection_audit_log').insert({
    inspection_id: p.inspectionId, action: p.action,
    details: { disposition: p.disposition ?? null, reason: p.reason ?? null, notes: p.notes ?? null },
    operator_name: operator, created_at: reviewedAt
  })
  fail('Could not save operator review to Supabase', auditError)
  const update: Row = { reviewed_by: operator, reviewed_at: reviewedAt }
  if (p.action === 'OVERRIDE' && p.disposition) update.disposition = p.disposition
  const { error: updateError } = await client.from('inspections').update(update).eq('id', p.inspectionId)
  fail('Review was logged, but the inspection could not be updated', updateError)
  return { operator, reviewedAt }
}

async function http<T>(url: string, body: unknown): Promise<T> {
  if (!API_URL) throw new Error('VITE_API_URL is not configured. Render backend requests are disabled.')
  let response: Response
  try { response = await fetch(`${API_URL}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
  catch { throw new Error('Cannot reach the Render backend. Check VITE_API_URL and the backend service.') }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((data as { error?: string }).error ?? `Render request failed (${response.status})`)
  return data as T
}
export const sendSupport = (message: { name: string; email: string; subject: string; message: string }) =>
  http<{ saved: boolean; emailed: boolean; supportTo: string | null }>('/api/support', message)
