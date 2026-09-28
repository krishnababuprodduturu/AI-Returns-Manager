import type { ReactNode } from 'react'
import { CheckCircle2, XCircle, HelpCircle, AlertTriangle } from 'lucide-react'
export function StatusBadge({ value }: { value: string }) {
  const map: Record<string, [string, ReactNode]> = {
    PASS: ['bg-green-50 text-green-800 border-green-200', <CheckCircle2 size={14}/>],
    FAIL: ['bg-red-50 text-red-800 border-red-200', <XCircle size={14}/>],
    UNCERTAIN: ['bg-amber-50 text-amber-900 border-amber-300', <HelpCircle size={14}/>],
    'Manual Review': ['bg-orange-50 text-orange-800 border-orange-200', <AlertTriangle size={14}/>] }
  const [cls, icon] = map[value] ?? ['bg-slate-50 text-slate-700 border-line', null]
  return <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>{icon}{value}</span>
}
export const pct = (n: number) => `${Math.round(n * 100)}%`
export function ConfidenceBadge({ value }: { value: number }) {
  const low = value > 0 && value < 0.6
  return <span className={`text-xs font-medium ${low ? 'text-amber-800' : 'text-ink'}`}>{value ? pct(value) : '–'}{low ? ' · Human review recommended' : ''}</span>
}
export function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return <section className="rounded-lg border border-line bg-white p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{title}</h2>{right}</div>{children}</section>
}
export function Empty({ text }: { text: string }) { return <p className="py-8 text-center text-sm text-slate-500">{text}</p> }
