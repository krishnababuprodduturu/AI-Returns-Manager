import { useState } from 'react'
import { Mail } from 'lucide-react'
import { sendSupport } from '../services/api'
import { Card } from '../components/ui'
const FALLBACK = 'support@yourcompany.com'
export default function Support() {
  const [f, setF] = useState({ name: '', email: '', subject: '', message: '' }); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const [to, setTo] = useState(FALLBACK)
  const mailto = `mailto:${to}?subject=${encodeURIComponent(f.subject)}&body=${encodeURIComponent(f.message + '\n\n' + f.name)}`
  const send = async () => { setBusy(true); setErr(''); setMsg('')
    try { const r = await sendSupport(f); if (r.supportTo) setTo(r.supportTo)
      setMsg(r.emailed ? 'Message sent. Our team will reply by email.' : 'Message saved, but email delivery is not configured on the server. Use "Open in my email app" to send it directly.')
      if (r.emailed) setF({ name: '', email: '', subject: '', message: '' })
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) } }
  const inp = 'mt-1 w-full rounded border border-line px-3 py-2'
  return <div className="mx-auto max-w-2xl space-y-4"><h1 className="text-xl font-semibold">Support</h1>
    <Card title="Contact support" right={<Mail size={18}/>}><div className="grid gap-3 text-sm">
      <label>Your name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inp}/></label>
      <label>Your email<input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className={inp}/></label>
      <label>Subject<input value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} className={inp}/></label>
      <label>Message<textarea rows={5} value={f.message} onChange={e => setF({ ...f, message: e.target.value })} className={inp}/></label>
      {err && <p role="alert" className="text-red-800">{err}</p>}{msg && <p role="status" className="text-green-800">{msg}</p>}
      <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={send} className="rounded bg-accent px-4 py-2 text-white disabled:opacity-40">{busy ? 'Sending...' : 'Send message'}</button>
        <a href={mailto} className="rounded border border-line px-4 py-2">Open in my email app</a></div></div></Card></div>
}
