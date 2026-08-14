import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

dotenv.config({ path: path.join(rootDir, '.env') })

let pool

function getPool() {
  const missing = ['DB_HOST', 'DB_USER', 'DB_NAME'].filter((key) => !process.env[key])
  if (missing.length) {
    throw new Error(`Missing MySQL configuration: ${missing.join(', ')}`)
  }

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

export async function ensureSchema() {
  const db = getPool()

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

  await createVoucherTable(db, 'receipts_history')
  await createVoucherTable(db, 'credit_notes_history')

  await removePresetData(db)

  return { mode: 'mysql' }
}

async function createVoucherTable(db, tableName) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id VARCHAR(128) PRIMARY KEY,
      firm VARCHAR(255) NOT NULL,
      date DATE NULL,
      party VARCHAR(255) DEFAULT '',
      voucher_no VARCHAR(255) DEFAULT '',
      voucher_type VARCHAR(100) DEFAULT '',
      amount DECIMAL(14, 2) DEFAULT 0,
      narration TEXT NULL,
      source VARCHAR(50) DEFAULT 'tally',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)
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

  const [rows] = await db.query('SELECT id, name, port FROM firms ORDER BY id')
  return rows
}

export async function createFirm(firm) {
  const db = getPool()
  const normalized = normalizeFirm({
    ...firm,
    id: `firm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  })

  await db.query('INSERT INTO firms (id, name, port) VALUES (?, ?, ?)', [
    normalized.id,
    normalized.name,
    normalized.port,
  ])
  return normalized
}

export async function updateFirm(id, firm) {
  const db = getPool()
  const normalized = normalizeFirm({ ...firm, id })

  const [result] = await db.query('UPDATE firms SET name = ?, port = ? WHERE id = ?', [
    normalized.name,
    normalized.port,
    normalized.id,
  ])
  if (result.affectedRows === 0) {
    throw new Error('Firm not found.')
  }
  return normalized
}

export async function deleteFirm(id) {
  const db = getPool()
  const [result] = await db.query('DELETE FROM firms WHERE id = ?', [id])
  if (result.affectedRows === 0) {
    throw new Error('Firm not found.')
  }
  return { id }
}

function normalizeFirm(firm) {
  return {
    id: String(firm.id || '').trim(),
    name: String(firm.name || '').trim(),
    port: String(firm.port || '').trim(),
  }
}

export async function getSalesHistory() {
  const db = getPool()

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

export async function getReceiptHistory() {
  return getVoucherHistory('receipts_history')
}

export async function getCreditNoteHistory() {
  return getVoucherHistory('credit_notes_history')
}

async function getVoucherHistory(tableName) {
  const db = getPool()

  const [rows] = await db.query(`
    SELECT
      id,
      firm,
      DATE_FORMAT(date, '%Y-%m-%d') AS date,
      party,
      voucher_no AS voucherNo,
      voucher_type AS voucherType,
      amount,
      narration,
      source
    FROM ${tableName}
    ORDER BY date DESC, voucher_no DESC
  `)
  return rows
}

export async function appendSalesHistory(records) {
  if (!records.length) return []

  const db = getPool()

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

export async function appendReceiptHistory(records) {
  return appendVoucherHistory('receipts_history', records)
}

export async function appendCreditNoteHistory(records) {
  return appendVoucherHistory('credit_notes_history', records)
}

async function appendVoucherHistory(tableName, records) {
  if (!records.length) return []

  const db = getPool()

  for (const row of records) {
    await db.query(
      `INSERT INTO ${tableName}
        (id, firm, date, party, voucher_no, voucher_type, amount, narration, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        firm = VALUES(firm),
        date = VALUES(date),
        party = VALUES(party),
        voucher_no = VALUES(voucher_no),
        voucher_type = VALUES(voucher_type),
        amount = VALUES(amount),
        narration = VALUES(narration),
        source = VALUES(source)`,
      [
        row.id,
        row.firm,
        row.date || null,
        row.party,
        row.voucherNo,
        row.voucherType,
        row.amount,
        row.narration,
        row.source || 'tally',
      ],
    )
  }

  return records
}
