import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useEffect, useState } from 'react'
import { trend } from '../data/mock'
import { getReturns } from '../services/api'
import type { ReturnRecord } from '../types'
import { Card, ConfidenceBadge, StatusBadge } from '../components/ui'
export default function Dashboard() {
  const [returns, setReturns] = useState<ReturnRecord[]>([])
  const [err, setErr] = useState('')
  useEffect(() => { getReturns().then(setReturns).catch(e => setErr((e as Error).message)) }, [])
  const count = (d: string) => returns.filter(r => r.disposition === d).length
  const cards: [string, number][] = [['Total Returns', returns.length], ['Pending Inspection', returns.filter(r => r.state === 'Pending').length],
  ['Restock', count('RESTOCK')], ['Refurbish', count('REFURBISH')], ['Liquidate', count('LIQUIDATE')], ['Dispose', count('DISPOSE')], ['Uncertain', count('UNCERTAIN')]]
  const dist = ['RESTOCK', 'REFURBISH', 'LIQUIDATE', 'DISPOSE', 'UNCERTAIN'].map(d => ({ name: d, value: count(d) }))
  return <div className="space-y-4"><h1 className="text-xl font-semibold">Dashboard</h1>
    {err && <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">Could not load dashboard data: {err}</div>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{cards.map(([l, v]) => <div key={l} className="rounded-lg border border-line bg-white p-3"><div className="text-2xl font-semibold">{v}</div><div className="text-xs text-slate-600">{l}</div></div>)}</div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Inspections over time"><div className="h-56"><ResponsiveContainer><LineChart data={trend}><CartesianGrid stroke="#dfe5e8" /><XAxis dataKey="day" /><YAxis /><Tooltip /><Line dataKey="inspections" stroke="#0f6b66" strokeWidth={2} /></LineChart></ResponsiveContainer></div></Card>
      <Card title="Disposition distribution"><div className="h-56"><ResponsiveContainer><BarChart data={dist}><CartesianGrid stroke="#dfe5e8" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="#0f6b66" /></BarChart></ResponsiveContainer></div></Card></div>
    <Card title="Recent inspections"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr>{['Return ID', 'Product', 'Identity', 'Completeness', 'Condition', 'Disposition', 'Confidence'].map(h => <th key={h} className="py-2 pr-3">{h}</th>)}</tr></thead>
      <tbody>{returns.slice(0, 6).map(r => <tr key={r.id} className="border-t border-line"><td className="py-2 pr-3">{r.return_number}</td><td className="pr-3">{r.product}</td><td><StatusBadge value={r.identity} /></td><td><StatusBadge value={r.completeness} /></td><td className="pr-3">{r.condition}</td><td className="pr-3">{r.disposition}</td><td><ConfidenceBadge value={r.confidence} /></td></tr>)}</tbody></table></div></Card></div>
}
