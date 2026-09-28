import { useEffect, useRef, useState } from 'react'
import { Trash2, UploadCloud, Check, ChevronDown, Loader2 } from 'lucide-react'
import { getConditionDefinitions, getProducts, inspectReturn, submitInspection } from '../services/api'
import { scenarios } from '../data/mock'
import type { ConditionDefinition, Evidence, InspectionResult, Product, ScenarioKey } from '../types'
import { Card, ConfidenceBadge, StatusBadge, pct } from '../components/ui'
const steps = ['Return information', 'Upload photos', 'AI inspection', 'Review & disposition']
const cats = ['Front','Back','Side','Accessories','Packaging','Serial Number','Other']
const stages = ['Reading product information','Comparing product appearance','Detecting accessories','Assessing condition','Generating disposition']
const dispositions = ['RESTOCK','REFURBISH','LIQUIDATE','DISPOSE','UNCERTAIN']
interface Img { id: string; file: File; url: string; cat: string }
function EvidenceList({ items, onPick }: { items: Evidence[]; onPick: (e: Evidence) => void }) {
  const [open, setOpen] = useState(false)
  return <div><button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1 text-xs text-accent"><ChevronDown size={14}/>Evidence ({items.length})</button>
    {open && <ul className="mt-1 space-y-1 text-sm">{items.length === 0 && <li className="text-slate-500">No supporting evidence available.</li>}{items.map((e, i) => <li key={i}><button onClick={() => onPick(e)} className="text-left underline decoration-dotted">{e.text}</button> <span className="text-xs text-slate-500">({e.source})</span></li>)}</ul>}</div>
}
export default function NewInspection() {
  const [step, setStep] = useState(0); const [products, setProducts] = useState<Product[]>([]); const [defs, setDefs] = useState<ConditionDefinition[]>([])
  const [sel, setSel] = useState(''); const [ret, setRet] = useState('RET-2001'); const [order, setOrder] = useState('ORD-9001')
  const [imgs, setImgs] = useState<Img[]>([]); const [err, setErr] = useState(''); const [stage, setStage] = useState(0)
  const [res, setRes] = useState<InspectionResult | null>(null)
  const [focus, setFocus] = useState<Evidence | null>(null); const [decision, setDecision] = useState(''); const [ovr, setOvr] = useState({ d: 'RESTOCK', r: '', n: '' })
  const [audit, setAudit] = useState(''); const input = useRef<HTMLInputElement>(null)
  useEffect(() => { getProducts().then(setProducts); getConditionDefinitions().then(setDefs) }, [])
  const product = products.find(p => p.sku === sel)
  const add = (files: FileList | null) => { if (!files) return; const list = Array.from(files); const bad = list.filter(f => !['image/jpeg','image/png','image/webp'].includes(f.type))
    setErr(bad.length ? `${bad.map(f => f.name).join(', ')} is not supported. Upload JPG, PNG or WEBP files.` : '')
    setImgs(p => [...p, ...list.filter(f => !bad.includes(f)).map((f, k) => ({ id: `image-${p.length + k + 1}`, file: f, url: URL.createObjectURL(f), cat: 'Front' }))]) }
  const run = async (s: ScenarioKey = 'missing') => { setStep(2); setRes(null); setErr(''); setStage(0); setDecision('')
    const t = setInterval(() => setStage(x => Math.min(x + 1, stages.length - 1)), 400)
    try { setRes(await inspectReturn(ret, imgs.map(i => i.file), s)); setStep(3) } catch (e) { setErr('Inspection failed: ' + (e as Error).message + '. Try again.'); setStep(1) } finally { clearInterval(t) } }
  const demo = (k: ScenarioKey) => { if (products[0]) setSel(products[0].sku); setRet('RET-DEMO'); setOrder('ORD-DEMO'); run(k) }
  const decide = async (a: 'APPROVE' | 'OVERRIDE' | 'MANUAL_REVIEW') => {
    if (a === 'OVERRIDE' && !ovr.r.trim()) { setErr('Enter a reason to override the recommendation.'); return }
    try { const r = await submitInspection({ returnId: ret, sku: sel, result: res ?? undefined, action: a, disposition: a === 'OVERRIDE' ? ovr.d : res?.disposition.recommendation, reason: ovr.r, notes: ovr.n })
    setErr(''); setDecision(a); setAudit(`${r.operator}, ${new Date(r.reviewedAt).toLocaleString()}`) } catch (e) { setErr((e as Error).message) } }
  const lowConf = res && Math.min(res.identity.confidence, res.completeness.confidence, res.condition.confidence, res.disposition.confidence) < 0.6
  const validCond = res && (res.condition.label === 'UNCERTAIN' || defs.length === 0 || defs.some(d => d.label === res.condition.label))
  return <div className="mx-auto max-w-5xl space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-semibold">New inspection</h1>
    <label className="text-sm">Demo mode <select aria-label="Load example inspection" value="" onChange={e => e.target.value && demo(e.target.value as ScenarioKey)} className="ml-1 rounded border border-line bg-white px-2 py-1"><option value="">Load example inspection</option>{(Object.keys(scenarios) as ScenarioKey[]).map(k => <option key={k} value={k}>{scenarios[k].label}</option>)}</select></label></div>
    <ol className="flex flex-wrap gap-2 text-sm">{steps.map((s, i) => <li key={s} className={`flex items-center gap-1 rounded border px-3 py-1 ${i === step ? 'border-accent bg-accent text-white' : i < step ? 'border-accent text-accent' : 'border-line bg-white text-slate-500'}`}>{i < step && <Check size={14}/>}{i + 1}. {s}</li>)}</ol>
    {err && <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</div>}
    {step === 0 && <Card title="Return information"><div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Return ID<input value={ret} onChange={e => setRet(e.target.value)} className="mt-1 w-full rounded border border-line px-3 py-2"/></label>
      <label className="text-sm">Order ID<input value={order} onChange={e => setOrder(e.target.value)} className="mt-1 w-full rounded border border-line px-3 py-2"/></label>
      <label className="text-sm sm:col-span-2">Product from catalogue<select value={sel} onChange={e => setSel(e.target.value)} className="mt-1 w-full rounded border border-line px-3 py-2"><option value="">Select a product</option>{products.map(p => <option key={p.sku} value={p.sku}>{p.name} ({p.sku})</option>)}</select></label></div>
      {product && <p className="mt-3 text-sm">Expected components: {product.components.join(', ')}</p>}
      {!order && <p className="mt-2 text-sm text-amber-800">Order information is missing. Enter an order ID to continue.</p>}
      <button disabled={!product || !order || !ret} onClick={() => setStep(1)} className="mt-4 rounded bg-accent px-4 py-2 text-sm text-white disabled:opacity-40">Continue to photos</button></Card>}
    {step === 1 && <Card title="Upload photos"><div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); add(e.dataTransfer.files) }} onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && input.current?.click()}
      className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line p-10 text-center hover:border-accent"><UploadCloud/><p className="font-medium">Upload returned-item photographs</p><p className="text-xs text-slate-500">JPG, PNG or WEBP. Multiple images allowed.</p>
      <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={e => add(e.target.files)}/></div>
      <p className="mt-2 text-xs text-slate-600">AI decisions are based only on visible evidence and provided order/catalogue information.</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{imgs.map(i => <figure key={i.id} className="rounded border border-line p-2 text-xs"><img src={i.url} alt={i.file.name} className="h-24 w-full rounded object-cover"/><figcaption className="mt-1 truncate">{i.file.name}</figcaption>
        <div className="mt-1 flex gap-1"><select aria-label="Image category" value={i.cat} onChange={e => setImgs(imgs.map(x => x.id === i.id ? { ...x, cat: e.target.value } : x))} className="min-w-0 flex-1 rounded border border-line">{cats.map(c => <option key={c}>{c}</option>)}</select>
        <button aria-label={`Delete ${i.file.name}`} onClick={() => setImgs(imgs.filter(x => x.id !== i.id))}><Trash2 size={14}/></button></div></figure>)}</div>
      <div className="mt-4 flex gap-2"><button onClick={() => setStep(0)} className="rounded border border-line px-4 py-2 text-sm">Back</button>
        <button onClick={() => imgs.length ? run() : setErr('No images uploaded. Add at least one photograph to run the inspection.')} className="rounded bg-accent px-4 py-2 text-sm text-white">Run AI inspection</button></div></Card>}
    {step === 2 && <Card title="Analyzing returned item..."><ul className="space-y-2 text-sm">{stages.map((s, i) => <li key={s} className="flex items-center gap-2">{i < stage ? <Check size={16} className="text-green-700"/> : i === stage ? <Loader2 size={16} className="animate-spin"/> : <span className="w-4 text-center">○</span>}{s}</li>)}</ul></Card>}
    {step === 3 && res && <>
      <div className="rounded border border-line bg-white p-3 text-sm">This is an AI recommendation. It is not accepted until an operator reviews it. Generated {new Date(res.timestamp).toLocaleString()}.</div>
      {lowConf && <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Human review recommended. One or more findings have low confidence.</div>}
      {!validCond && <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">Condition label "{res.condition.label}" is not in the configured definitions.</div>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Product identity" right={<StatusBadge value={res.identity.status}/>}><p className="text-sm">{res.identity.reason}</p><p className="mt-2 text-sm">Expected: {res.identity.expected}<br/>Detected: {res.identity.detected}<br/>Confidence: <ConfidenceBadge value={res.identity.confidence}/></p><EvidenceList items={res.identity.evidence} onPick={setFocus}/></Card>
        <Card title="Completeness" right={<StatusBadge value={res.completeness.status}/>}><p className="text-sm">{res.completeness.reason}</p>
          {product && <ul className="mt-2 text-sm">{product.components.map(c => <li key={c}>{res.completeness.missing.includes(c) ? '✗' : res.completeness.status === 'UNCERTAIN' ? '?' : '✓'} {c}</li>)}</ul>}
          {res.completeness.missing.length > 0 && <p className="mt-1 text-sm font-medium">Missing: {res.completeness.missing.join(', ')}</p>}<p className="mt-1 text-sm">Confidence: <ConfidenceBadge value={res.completeness.confidence}/></p><EvidenceList items={res.completeness.evidence} onPick={setFocus}/></Card>
        <Card title="Condition" right={res.condition.label === 'UNCERTAIN' ? <StatusBadge value="UNCERTAIN"/> : <span className="text-sm font-medium">{res.condition.label}</span>}><p className="text-sm">{res.condition.reason}</p><p className="mt-2 text-sm">Confidence: <ConfidenceBadge value={res.condition.confidence}/></p><EvidenceList items={res.condition.evidence} onPick={setFocus}/></Card>
        <Card title="Recommended disposition" right={<span className="font-semibold">{res.disposition.recommendation}</span>}><p className="text-sm">{res.disposition.reason}</p><p className="mt-2 text-sm">Confidence: <ConfidenceBadge value={res.disposition.confidence}/></p></Card></div>
      <Card title="Overall confidence"><p className="text-sm">{pct((res.identity.confidence + res.completeness.confidence + res.condition.confidence + res.disposition.confidence) / 4)} average. Identity {pct(res.identity.confidence)}, completeness {pct(res.completeness.confidence)}, condition {pct(res.condition.confidence)}, disposition {pct(res.disposition.confidence)}.</p></Card>
      <Card title="Evidence panel"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="py-1">Finding</th><th>Evidence</th><th>Source</th></tr></thead><tbody>
        {([['Identity', res.identity.evidence], ['Completeness', res.completeness.evidence], ['Condition', res.condition.evidence]] as [string, Evidence[]][]).flatMap(([n, l]) => l.map((e, i) => <tr key={`${n}${i}`} className={`cursor-pointer border-t border-line ${focus === e ? 'bg-amber-50' : ''}`} onClick={() => setFocus(e)}><td className="py-1 pr-3">{n}</td><td className="pr-3">{e.text}</td><td>{e.source}</td></tr>))}</tbody></table></div>
        {focus && <p className="mt-2 text-sm">Selected: {focus.source} ({focus.imageId}).</p>}</Card>
      <Card title="Operator review">{decision ? <p className="text-sm" role="status">Decision recorded: {decision.replace('_', ' ').toLowerCase()}. Reviewed by {audit}.</p> : <div className="space-y-3">
        <div className="flex flex-wrap gap-2"><button onClick={() => decide('APPROVE')} className="rounded bg-accent px-3 py-2 text-sm text-white">Approve recommendation</button><button onClick={() => decide('MANUAL_REVIEW')} className="rounded border border-line px-3 py-2 text-sm">Request manual review</button></div>
        <fieldset className="grid gap-2 rounded border border-line p-3 text-sm sm:grid-cols-2"><legend className="px-1">Override decision</legend>
          <label>New disposition<select value={ovr.d} onChange={e => setOvr({ ...ovr, d: e.target.value })} className="mt-1 w-full rounded border border-line px-2 py-1">{dispositions.map(d => <option key={d}>{d}</option>)}</select></label>
          <label>Reason (required)<input value={ovr.r} onChange={e => setOvr({ ...ovr, r: e.target.value })} className="mt-1 w-full rounded border border-line px-2 py-1"/></label>
          <label className="sm:col-span-2">Notes (optional)<input value={ovr.n} onChange={e => setOvr({ ...ovr, n: e.target.value })} className="mt-1 w-full rounded border border-line px-2 py-1"/></label>
          <button onClick={() => decide('OVERRIDE')} className="w-fit rounded border border-line px-3 py-2">Override decision</button></fieldset></div>}</Card></>}
  </div>
}
