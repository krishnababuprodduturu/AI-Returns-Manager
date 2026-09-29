import { useEffect, useState } from 'react'
import { createReturn, getProducts, getReturns } from '../services/api'
import type { Product, ReturnRecord } from '../types'
import { Card, ConfidenceBadge, Empty, StatusBadge } from '../components/ui'
export default function Returns() {
  const [rows, setRows] = useState<ReturnRecord[] | null>(null); const [q, setQ] = useState(''); const [state, setState] = useState('')
  const [products, setProducts] = useState<Product[]>([]); const [err, setErr] = useState(''); const [f2, setF2] = useState({ id: '', orderId: '', sku: '' })
  const load = () => getReturns().then(setRows).catch(e => { setErr((e as Error).message); setRows([]) })
  useEffect(() => { load(); getProducts().then(setProducts).catch(e => setErr((e as Error).message)) }, [])
  const add = async () => { try { await createReturn(f2); setF2({ id: '', orderId: '', sku: '' }); setErr(''); load() } catch (e) { setErr((e as Error).message) } }
  const f = (rows ?? []).filter(r => (!state || r.state === state) && [r.id, r.orderId, r.sku, r.product].join(' ').toLowerCase().includes(q.toLowerCase()))
  return <div className="space-y-4"><h1 className="text-xl font-semibold">Returns queue</h1>
    {err && <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</div>}
    <Card title="Add a return"><div className="flex flex-wrap gap-2 text-sm">
      <input aria-label="Return ID" placeholder="Return ID" value={f2.id} onChange={e => setF2({ ...f2, id: e.target.value })} className="rounded border border-line px-3 py-2" />
      <input aria-label="Order ID" placeholder="Order ID" value={f2.orderId} onChange={e => setF2({ ...f2, orderId: e.target.value })} className="rounded border border-line px-3 py-2" />
      <select aria-label="Product" value={f2.sku} onChange={e => setF2({ ...f2, sku: e.target.value })} className="rounded border border-line px-2"><option value="">Select product</option>{products.map(p => <option key={p.sku} value={p.sku}>{p.sku}</option>)}</select>
      <button disabled={!f2.id || !f2.orderId || !f2.sku} onClick={add} className="rounded bg-accent px-4 py-2 text-white disabled:opacity-40">Save return</button></div></Card>
    <div className="flex flex-wrap gap-2"><input aria-label="Search returns" value={q} onChange={e => setQ(e.target.value)} placeholder="Return ID, order, SKU, product" className="w-72 rounded border border-line bg-white px-3 py-2 text-sm" />
      <select aria-label="Status" value={state} onChange={e => setState(e.target.value)} className="rounded border border-line bg-white px-2 text-sm"><option value="">All statuses</option>{['Pending', 'Processing', 'Completed', 'Manual Review'].map(s => <option key={s}>{s}</option>)}</select></div>
    <div className="overflow-x-auto rounded-lg border border-line bg-white p-3">{!rows ? <div className="h-32 animate-pulse rounded bg-slate-100" /> : f.length === 0 ? <Empty text="No returns yet. Add one above or run a new inspection." /> :
      <table className="w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr>{['Return', 'Order', 'Product', 'Received', 'Status', 'Identity', 'Completeness', 'Condition', 'Disposition', 'Confidence'].map(h => <th key={h} className="py-2 pr-3">{h}</th>)}</tr></thead>
        <tbody>{f.map(r => <tr key={r.id} className="border-t border-line"><td className="py-2 pr-3">{r.id}</td><td className="pr-3">{r.orderId}</td><td className="pr-3">{r.product}</td><td className="pr-3">{new Date(r.received).toLocaleDateString()}</td><td className="pr-3"><StatusBadge value={r.state} /></td><td><StatusBadge value={r.identity} /></td><td><StatusBadge value={r.completeness} /></td><td className="pr-3">{r.condition === 'UNCERTAIN' ? <StatusBadge value="UNCERTAIN" /> : r.condition}</td><td className="pr-3">{r.disposition}</td><td><ConfidenceBadge value={r.confidence} /></td></tr>)}</tbody></table>}</div></div>
}
