export type Status = 'PASS' | 'FAIL' | 'UNCERTAIN'
export type Disposition = 'RESTOCK' | 'REFURBISH' | 'LIQUIDATE' | 'DISPOSE' | 'UNCERTAIN'
export type ReturnState = 'Pending' | 'Processing' | 'Completed' | 'Manual Review'
export type FindingType = 'identity' | 'completeness' | 'condition' | 'disposition'
export interface Evidence {
  text: string; imageId: string; source: string; findingType?: FindingType; finding?: string; evidenceText?: string; confidence?: number
}
export interface InspectionEvidence { findingType: FindingType; finding: string; evidenceText: string; imageId: string; confidence: number }
export interface Product { sku: string; name: string; category: string; components: string[] }
export interface ConditionDefinition { label: string; description: string }
export interface InspectionResult {
  identity: { status: Status; expected: string; detected: string; confidence: number; reason: string; evidence: Evidence[] }
  completeness: { status: Status; missing: string[]; confidence: number; reason: string; evidence: Evidence[] }
  condition: { label: string; confidence: number; reason: string; evidence: Evidence[] }
  disposition: { recommendation: Disposition; confidence: number; reason: string }
  timestamp: string
  overallConfidence?: number
  evidence?: InspectionEvidence[]
}
export interface ReturnRecord {
  id: string; return_number: string; orderId: string; sku: string; product: string; received: string; state: ReturnState;
  identity: Status; completeness: Status; condition: string; disposition: Disposition; confidence: number
}
export interface ReturnImage { id: string; returnId: string; imageUrl: string; imageCategory: string; fileName: string }
export interface ReturnDetail extends ReturnRecord {
  images: (ReturnImage & { signedUrl: string })[]
  inspection: (Record<string, unknown> & { missingComponents: Record<string, unknown>[]; evidence: Record<string, unknown>[] }) | null
}
export type ScenarioKey = 'correct' | 'wrong' | 'missing' | 'damaged' | 'uncertain'
