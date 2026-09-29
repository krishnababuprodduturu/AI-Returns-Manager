import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'fs'
import Database from 'better-sqlite3'
import nodemailer from 'nodemailer'
import { handleAIInspection } from './ai-inspection.js'

fs.mkdirSync('server/data', { recursive: true })
const db = new Database('server/data/returns.db') // permanent: stored on disk, survives restarts
db.exec(`
create table if not exists products(sku text primary key, name text, category text, components text);
create table if not exists returns(id text primary key, orderId text, sku text, product text, received text, state text,
  identity text, completeness text, "condition" text, disposition text, confidence real);
create table if not exists inspections(id integer primary key autoincrement, returnId text, action text, disposition text,
  reason text, notes text, operator text, reviewedAt text, result text);
create table if not exists tickets(id integer primary key autoincrement, name text, email text, subject text, message text,
  createdAt text, emailed integer);`)

if (db.prepare('select count(*) c from products').get().c === 0) {
  const ins = db.prepare('insert into products values (?,?,?,?)')
  ins.run('WH-1000XM5', 'Sony WH-1000XM5 Wireless Headphones', 'Audio', JSON.stringify(['Headphones', 'Carrying Case', 'USB Cable', 'Audio Cable', 'User Manual']))
  ins.run('WH-1000XM4', 'Sony WH-1000XM4 Wireless Headphones', 'Audio', JSON.stringify(['Headphones', 'Carrying Case', 'USB Cable', 'Audio Cable', 'User Manual']))
  ins.run('KB-MX-KEYS', 'Logitech MX Keys Keyboard', 'Peripherals', JSON.stringify(['Keyboard', 'USB Receiver', 'USB Cable', 'User Manual']))
}
const upsertReturn = db.prepare(`insert into returns values (@id,@orderId,@sku,@product,@received,@state,@identity,@completeness,@condition,@disposition,@confidence)
  on conflict(id) do update set state=@state, identity=@identity, completeness=@completeness, "condition"=@condition, disposition=@disposition, confidence=@confidence`)

const app = express()
const allowedOrigins = new Set(['https://ai-returns-manager.vercel.app', 'http://localhost:5173'])
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true)
    return callback(new Error('This origin is not allowed by the API CORS policy.'))
  }
}))
app.use(express.json({ limit: '15mb' }))
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg })

app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.post('/api/inspect', handleAIInspection)

app.get('/api/products', (_q, res) => res.json(db.prepare('select * from products').all().map(p => ({ ...p, components: JSON.parse(p.components) }))))
app.post('/api/products', (req, res) => {
  const { sku, name, category, components } = req.body ?? {}
  if (!sku || !name || !Array.isArray(components)) return bad(res, 'sku, name and components are required.')
  try { db.prepare('insert into products values (?,?,?,?)').run(sku, name, category || 'General', JSON.stringify(components)) }
  catch { return bad(res, `SKU ${sku} already exists.`, 409) }
  res.status(201).json({ sku, name, category, components })
})
app.get('/api/returns', (_q, res) => res.json(db.prepare('select * from returns order by received desc').all()))
app.get('/api/returns/:id', (req, res) => { const r = db.prepare('select * from returns where id=?').get(req.params.id); r ? res.json(r) : bad(res, 'Return not found.', 404) })
app.post('/api/returns', (req, res) => {
  const { id, orderId, sku } = req.body ?? {}
  if (!id || !orderId || !sku) return bad(res, 'id, orderId and sku are required.')
  const p = db.prepare('select name from products where sku=?').get(sku)
  if (!p) return bad(res, `SKU ${sku} is not in the catalogue.`)
  if (db.prepare('select 1 from returns where id=?').get(id)) return bad(res, `Return ${id} already exists.`, 409)
  const row = { id, orderId, sku, product: p.name, received: new Date().toISOString(), state: 'Pending', identity: 'UNCERTAIN', completeness: 'UNCERTAIN', condition: 'UNCERTAIN', disposition: 'UNCERTAIN', confidence: 0 }
  upsertReturn.run(row); res.status(201).json(row)
})
app.post('/api/inspections', (req, res) => {
  const { returnId, sku, action, disposition, reason, notes, result } = req.body ?? {}
  if (!returnId || !action) return bad(res, 'returnId and action are required.')
  const operator = 'Current User', reviewedAt = new Date().toISOString()
  db.prepare('insert into inspections(returnId,action,disposition,reason,notes,operator,reviewedAt,result) values (?,?,?,?,?,?,?,?)')
    .run(returnId, action, disposition ?? null, reason ?? null, notes ?? null, operator, reviewedAt, result ? JSON.stringify(result) : null)
  const prev = db.prepare('select * from returns where id=?').get(returnId)
  const p = db.prepare('select name from products where sku=?').get(sku ?? prev?.sku)
  if (result) {
    const c = result
    upsertReturn.run({
      id: returnId, orderId: prev?.orderId ?? 'N/A', sku: sku ?? prev?.sku ?? 'N/A', product: p?.name ?? prev?.product ?? 'Unknown', received: prev?.received ?? reviewedAt,
      state: action === 'MANUAL_REVIEW' ? 'Manual Review' : 'Completed', identity: c.identity.status, completeness: c.completeness.status, condition: c.condition.label,
      disposition: disposition ?? c.disposition.recommendation,
      confidence: (c.identity.confidence + c.completeness.confidence + c.condition.confidence + c.disposition.confidence) / 4
    })
  }
  res.status(201).json({ returnId, action, disposition, operator, reviewedAt })
})
app.get('/api/inspections', (_q, res) => res.json(db.prepare('select id,returnId,action,disposition,reason,notes,operator,reviewedAt from inspections order by id desc').all()))

app.post('/api/support', async (req, res) => {
  const { name, email, subject, message } = req.body ?? {}
  if (!name || !/^\S+@\S+\.\S+$/.test(email ?? '') || !subject || !message) return bad(res, 'Name, a valid email, subject and message are required.')
  const createdAt = new Date().toISOString(); let emailed = 0
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SUPPORT_TO } = process.env
  if (SMTP_HOST && SUPPORT_TO) {
    try {
      await nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT || 587), auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined })
        .sendMail({ from: SMTP_USER || SUPPORT_TO, to: SUPPORT_TO, replyTo: email, subject: `[AI Returns Manager] ${subject}`, text: `From: ${name} <${email}>\n\n${message}` })
      emailed = 1
    } catch (e) { console.error('Mail failed:', e.message) }
  }
  db.prepare('insert into tickets(name,email,subject,message,createdAt,emailed) values (?,?,?,?,?,?)').run(name, email, subject, message, createdAt, emailed)
  res.status(201).json({ saved: true, emailed: !!emailed, supportTo: SUPPORT_TO || null })
})
app.listen(process.env.PORT || 3001, () => console.log('API running on http://localhost:' + (process.env.PORT || 3001)))
