import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataFile = path.join(__dirname, 'data', 'fallback-data.json')

const hasDatabase = Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME)
let pool

function getPool() {
  if (!hasDatabase) return null
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
    })
  }
  return pool
}

async function readFallback() {
  const text = await fs.readFile(dataFile, 'utf8')
  return JSON.parse(text)
}

async function writeFallback(data) {
  await fs.writeFile(dataFile, `${JSON.stringify(data, null, 2)}\n`)
}

export async function ensureSchema() {
  const db = getPool()
  if (!db) return { mode: 'local-json' }

  await db.query(`
    CREATE TABLE IF NOT EXISTS firms (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      port VARCHAR(10) NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS sales_history (
      id VARCHAR(64) PRIMARY KEY,
      firm VARCHAR(255) NOT NULL,
      date DATE NULL,
      debtor VARCHAR(255) DEFAULT '',
      invoice_no VARCHAR(255) DEFAULT '',
      item VARCHAR(255) DEFAULT '',
      part_no VARCHAR(255) DEFAULT '',
      qty DECIMAL(14, 3) DEFAULT 0,
      rate DECIMAL(14, 3) DEFAULT 0,
      amount DECIMAL(14, 2) DEFAULT 0,
      source VARCHAR(50) DEFAULT 'tally',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await removePresetData(db)

  const [rows] = await db.query('SELECT COUNT(*) AS count FROM firms')
  if (Number(rows[0].count) === 0) {
    const fallback = await readFallback()
    await saveFirms(fallback.firms)
  }

  return { mode: 'mysql' }
}

async function removePresetData(db) {
  await db.query("DELETE FROM sales_history WHERE source = 'sample' OR id LIKE 'sample-%'")
  await db.query(`
    UPDATE firms
    SET name = '', port = ''
    WHERE (id = 'firm-1' AND name = 'Firm 1' AND port = '9000')
      OR (id = 'firm-2' AND name = 'Firm 2' AND port = '9001')
      OR (id = 'firm-3' AND name = 'Firm 3' AND port = '9002')
      OR (id = 'firm-4' AND name = 'Firm 4' AND port = '9003')
  `)
}

export async function getFirms() {
  const db = getPool()
  if (!db) {
    const data = await readFallback()
    return data.firms
  }

  const [rows] = await db.query('SELECT id, name, port FROM firms ORDER BY id')
  return rows
}

export async function saveFirms(firms) {
  const normalized = firms.slice(0, 4).map((firm, index) => ({
    id: firm.id || `firm-${index + 1}`,
    name: String(firm.name || '').trim(),
    port: String(firm.port || '').trim(),
  }))

  const db = getPool()
  if (!db) {
    const data = await readFallback()
    data.firms = normalized
    await writeFallback(data)
    return normalized
  }

  await db.query('DELETE FROM firms')
  for (const firm of normalized) {
    await db.query('INSERT INTO firms (id, name, port) VALUES (?, ?, ?)', [
      firm.id,
      firm.name,
      firm.port,
    ])
  }
  return normalized
}

export async function getSalesHistory() {
  const db = getPool()
  if (!db) {
    const data = await readFallback()
    return data.salesHistory
  }

  const [rows] = await db.query(`
    SELECT
      id,
      firm,
      DATE_FORMAT(date, '%Y-%m-%d') AS date,
      debtor,
      invoice_no AS invoiceNo,
      item,
      part_no AS partNo,
      qty,
      rate,
      amount,
      source
    FROM sales_history
    ORDER BY date DESC, invoice_no DESC
  `)
  return rows
}

export async function appendSalesHistory(records) {
  if (!records.length) return []

  const db = getPool()
  if (!db) {
    const data = await readFallback()
    data.salesHistory = [...records, ...data.salesHistory]
    await writeFallback(data)
    return records
  }

  for (const row of records) {
    await db.query(
      `INSERT INTO sales_history
        (id, firm, date, debtor, invoice_no, item, part_no, qty, rate, amount, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        firm = VALUES(firm),
        date = VALUES(date),
        debtor = VALUES(debtor),
        item = VALUES(item),
        part_no = VALUES(part_no),
        qty = VALUES(qty),
        rate = VALUES(rate),
        amount = VALUES(amount),
        source = VALUES(source)`,
      [
        row.id,
        row.firm,
        row.date || null,
        row.debtor,
        row.invoiceNo,
        row.item,
        row.partNo,
        row.qty,
        row.rate,
        row.amount,
        row.source || 'tally',
      ],
    )
  }

  return records
}
