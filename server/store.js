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

  await db.query(`
    CREATE TABLE IF NOT EXISTS customer_targets (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      customer_key VARCHAR(255) NOT NULL,
      customer_name VARCHAR(255) NOT NULL,
      financial_year VARCHAR(7) NOT NULL,
      fiscal_month TINYINT UNSIGNED NOT NULL,
      amount DECIMAL(16, 2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_customer_target (customer_key, financial_year, fiscal_month)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS sales_person_targets (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      firm VARCHAR(255) NOT NULL,
      sales_person VARCHAR(255) NOT NULL,
      financial_year VARCHAR(7) NOT NULL,
      fiscal_month TINYINT UNSIGNED NOT NULL,
      amount DECIMAL(16, 2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_sales_person_target (firm, sales_person, financial_year, fiscal_month)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS weekly_sales_targets (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      firm VARCHAR(255) NOT NULL,
      sales_person VARCHAR(255) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      amount DECIMAL(16, 2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_weekly_sales_target (firm, sales_person, start_date, end_date)
    )
  `)

  await db.query(`CREATE TABLE IF NOT EXISTS outstanding_snapshots (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, firm VARCHAR(255) NOT NULL, snapshot_date DATE NOT NULL,
    party_key VARCHAR(255) NOT NULL, party_name VARCHAR(255) NOT NULL, bill_reference VARCHAR(255) NOT NULL,
    bill_date DATE NULL, due_date DATE NULL, original_amount DECIMAL(16,2) DEFAULT 0,
    outstanding_amount DECIMAL(16,2) DEFAULT 0, bill_status VARCHAR(50) DEFAULT '', fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_outstanding_snapshot (firm, snapshot_date, party_key, bill_reference)
  )`)
  await db.query(`CREATE TABLE IF NOT EXISTS receipt_allocations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, receipt_id VARCHAR(128) NOT NULL, bill_reference VARCHAR(255) NOT NULL,
    allocation_type VARCHAR(50) DEFAULT '', amount DECIMAL(16,2) DEFAULT 0,
    UNIQUE KEY uq_receipt_allocation (receipt_id, bill_reference, allocation_type)
  )`)
  await db.query(`CREATE TABLE IF NOT EXISTS credit_note_allocations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, credit_note_id VARCHAR(128) NOT NULL,
    invoice_reference VARCHAR(255) NOT NULL, allocation_type VARCHAR(50) DEFAULT '', amount DECIMAL(16,2) DEFAULT 0,
    UNIQUE KEY uq_credit_note_allocation (credit_note_id, invoice_reference, allocation_type)
  )`)

  await db.query(`
    CREATE TABLE IF NOT EXISTS intercompany_exclusions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      firm VARCHAR(255) NOT NULL,
      party_key VARCHAR(255) NOT NULL,
      party_name VARCHAR(255) NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_intercompany_party (firm, party_key)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS companies (
      external_id VARCHAR(255) PRIMARY KEY,
      company VARCHAR(255) NOT NULL,
      address TEXT NULL,
      district VARCHAR(255) DEFAULT '',
      state VARCHAR(255) DEFAULT '',
      gst_no VARCHAR(100) DEFAULT '',
      email VARCHAR(255) DEFAULT '',
      contact_person VARCHAR(255) DEFAULT '',
      contact_number VARCHAR(100) DEFAULT '',
      pin VARCHAR(30) DEFAULT '',
      sales_person VARCHAR(255) DEFAULT '',
      target DECIMAL(16, 2) DEFAULT 0,
      source_data LONGTEXT NULL,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
  await addColumnIfMissing(db, 'companies', 'dealing_person', "VARCHAR(255) DEFAULT ''")
  await addColumnIfMissing(db, 'companies', 'ref_person', "VARCHAR(255) DEFAULT ''")

  await db.query(`CREATE TABLE IF NOT EXISTS app_users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`)
  await db.query(`CREATE TABLE IF NOT EXISTS user_menu_permissions (
    user_id BIGINT UNSIGNED NOT NULL,
    page_id VARCHAR(100) NOT NULL,
    PRIMARY KEY (user_id, page_id),
    CONSTRAINT fk_menu_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
  )`)
  await db.query(`CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
    INDEX idx_session_expiry (expires_at)
  )`)

  await removePresetData(db)

  return { mode: 'mysql' }
}

export async function countAdmins() {
  const [rows] = await getPool().query('SELECT COUNT(*) AS count FROM app_users WHERE is_admin = TRUE')
  return Number(rows[0].count)
}

export async function findUserByEmail(email) {
  const [rows] = await getPool().query('SELECT id, email, display_name AS displayName, password_hash AS passwordHash, is_admin AS isAdmin, is_active AS isActive, must_change_password AS mustChangePassword FROM app_users WHERE email = ? LIMIT 1', [email])
  return rows[0] || null
}

export async function findUserById(id) {
  const [rows] = await getPool().query('SELECT id, email, display_name AS displayName, password_hash AS passwordHash, is_admin AS isAdmin, is_active AS isActive, must_change_password AS mustChangePassword, DATE_FORMAT(created_at, "%Y-%m-%d %H:%i:%s") AS createdAt FROM app_users WHERE id = ? LIMIT 1', [id])
  if (!rows[0]) return null
  const [permissions] = await getPool().query('SELECT page_id AS pageId FROM user_menu_permissions WHERE user_id = ? ORDER BY page_id', [id])
  return { ...rows[0], permissions: permissions.map((row) => row.pageId) }
}

export async function listUsers() {
  const [rows] = await getPool().query('SELECT id, email, display_name AS displayName, is_admin AS isAdmin, is_active AS isActive, must_change_password AS mustChangePassword, DATE_FORMAT(created_at, "%Y-%m-%d %H:%i:%s") AS createdAt FROM app_users ORDER BY display_name, email')
  const [permissions] = await getPool().query('SELECT user_id AS userId, page_id AS pageId FROM user_menu_permissions ORDER BY page_id')
  return rows.map((row) => ({ ...row, permissions: permissions.filter((item) => String(item.userId) === String(row.id)).map((item) => item.pageId) }))
}

export async function createUser({ email, displayName, passwordHash, isAdmin = false, mustChangePassword = true, permissions = [] }) {
  const db = getPool()
  const [result] = await db.query('INSERT INTO app_users (email, display_name, password_hash, is_admin, must_change_password) VALUES (?, ?, ?, ?, ?)', [email, displayName, passwordHash, Boolean(isAdmin), Boolean(mustChangePassword)])
  await replaceUserPermissions(result.insertId, permissions)
  return findUserById(result.insertId)
}

export async function updateUser(id, { email, displayName, isAdmin, isActive, permissions }) {
  await getPool().query('UPDATE app_users SET email = ?, display_name = ?, is_admin = ?, is_active = ? WHERE id = ?', [email, displayName, Boolean(isAdmin), Boolean(isActive), id])
  await replaceUserPermissions(id, permissions)
  if (!isActive) await revokeUserSessions(id)
  return findUserById(id)
}

export async function updateUserProfile(id, displayName) { await getPool().query('UPDATE app_users SET display_name = ? WHERE id = ?', [displayName, id]); return findUserById(id) }
export async function setUserPassword(id, passwordHash, mustChangePassword) { await getPool().query('UPDATE app_users SET password_hash = ?, must_change_password = ? WHERE id = ?', [passwordHash, Boolean(mustChangePassword), id]); await revokeUserSessions(id) }
export async function replaceUserPermissions(id, permissions) { const db = getPool(); await db.query('DELETE FROM user_menu_permissions WHERE user_id = ?', [id]); for (const page of permissions) await db.query('INSERT INTO user_menu_permissions (user_id, page_id) VALUES (?, ?)', [id, page]) }
export async function createSession(userId, tokenHash, expiresAt) { await getPool().query('DELETE FROM user_sessions WHERE expires_at <= NOW()'); await getPool().query('INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [userId, tokenHash, expiresAt]) }
export async function getSessionUser(tokenHash) { const [rows] = await getPool().query('SELECT user_id AS userId FROM user_sessions WHERE token_hash = ? AND expires_at > NOW() LIMIT 1', [tokenHash]); return rows[0] ? findUserById(rows[0].userId) : null }
export async function deleteSession(tokenHash) { await getPool().query('DELETE FROM user_sessions WHERE token_hash = ?', [tokenHash]) }
export async function revokeUserSessions(userId) { await getPool().query('DELETE FROM user_sessions WHERE user_id = ?', [userId]) }

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

async function addColumnIfMissing(db, table, column, definition) {
  const [rows] = await db.query(`SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, column])
  if (!rows.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
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
  const rows = await getVoucherHistory('receipts_history')
  const db = getPool()
  const [allocations] = await db.query(`SELECT receipt_id AS receiptId, SUM(CASE WHEN REPLACE(LOWER(allocation_type), ' ', '') = 'onaccount' THEN ABS(amount) ELSE 0 END) AS onAccountAmount FROM receipt_allocations GROUP BY receipt_id`)
  const amounts = new Map(allocations.map((row) => [row.receiptId, Number(row.onAccountAmount || 0)]))
  return rows.map((row) => ({ ...row, onAccountAmount: amounts.get(row.id) || 0 }))
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
  const saved = await appendVoucherHistory('receipts_history', records)
  for (const row of records) await replaceReceiptAllocations(row.id, row.allocations || [])
  return saved
}

export async function appendCreditNoteHistory(records) {
  const saved = await appendVoucherHistory('credit_notes_history', records)
  for (const row of records) await replaceCreditNoteAllocations(row.id, row.allocations || [])
  return saved
}

export async function getCreditNoteAllocations() {
  const db = getPool()
  const [rows] = await db.query(`SELECT credit_note_id AS creditNoteId, invoice_reference AS invoiceReference,
    allocation_type AS allocationType, amount FROM credit_note_allocations ORDER BY credit_note_id, id`)
  return rows
}

export async function replaceCreditNoteAllocations(creditNoteId, allocations) {
  const db = getPool()
  await db.query('DELETE FROM credit_note_allocations WHERE credit_note_id = ?', [creditNoteId])
  for (const row of allocations) await db.query(`INSERT INTO credit_note_allocations
    (credit_note_id, invoice_reference, allocation_type, amount) VALUES (?, ?, ?, ?)`,
  [creditNoteId, row.billReference, row.allocationType, row.amount])
}

export async function getTargets(financialYear) {
  const db = getPool()
  const params = []
  let where = ''
  if (financialYear) {
    where = 'WHERE financial_year = ?'
    params.push(financialYear)
  }
  const [rows] = await db.query(`
    SELECT id, customer_key AS customerKey, customer_name AS customerName,
      financial_year AS financialYear, fiscal_month AS fiscalMonth, amount
    FROM customer_targets ${where}
    ORDER BY customer_name, fiscal_month
  `, params)
  return rows
}

export async function upsertTargets({ customerKey, customerName, financialYear, months }) {
  const db = getPool()
  for (let index = 0; index < 12; index += 1) {
    await db.query(`
      INSERT INTO customer_targets (customer_key, customer_name, financial_year, fiscal_month, amount)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE customer_name = VALUES(customer_name), amount = VALUES(amount)
    `, [customerKey, customerName, financialYear, index + 1, months[index]])
  }
  return getTargets(financialYear)
}

export async function deleteTargets(customerKey, financialYear) {
  const db = getPool()
  const [result] = await db.query(
    'DELETE FROM customer_targets WHERE customer_key = ? AND financial_year = ?',
    [customerKey, financialYear],
  )
  return { deleted: result.affectedRows }
}

export async function getSalesPersonTargets({ firm = '', financialYear = '' } = {}) {
  const db = getPool()
  const conditions = []
  const params = []
  if (firm) { conditions.push('firm = ?'); params.push(firm) }
  if (financialYear) { conditions.push('financial_year = ?'); params.push(financialYear) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const [rows] = await db.query(`SELECT id, firm, sales_person AS salesPerson, financial_year AS financialYear,
    fiscal_month AS fiscalMonth, amount FROM sales_person_targets ${where} ORDER BY sales_person, fiscal_month`, params)
  return rows
}

export async function upsertSalesPersonTargets({ firm, salesPerson, financialYear, months }) {
  const db = getPool()
  for (let index = 0; index < 12; index += 1) {
    await db.query(`INSERT INTO sales_person_targets (firm, sales_person, financial_year, fiscal_month, amount)
      VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
    [firm, salesPerson, financialYear, index + 1, months[index]])
  }
  return getSalesPersonTargets({ firm, financialYear })
}

export async function deleteSalesPersonTargets(firm, salesPerson, financialYear) {
  const db = getPool()
  const [result] = await db.query('DELETE FROM sales_person_targets WHERE firm = ? AND sales_person = ? AND financial_year = ?', [firm, salesPerson, financialYear])
  return { deleted: result.affectedRows }
}

export async function getWeeklySalesTargets({ firm = '', salesPerson = '', startDate = '', endDate = '' } = {}) {
  const db = getPool()
  const conditions = []
  const params = []
  if (firm) { conditions.push('firm = ?'); params.push(firm) }
  if (salesPerson) { conditions.push('sales_person = ?'); params.push(salesPerson) }
  if (startDate) { conditions.push('start_date >= ?'); params.push(startDate) }
  if (endDate) { conditions.push('end_date <= ?'); params.push(endDate) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const [rows] = await db.query(`SELECT id, firm, sales_person AS salesPerson,
    DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate, DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate, amount
    FROM weekly_sales_targets ${where} ORDER BY start_date`, params)
  return rows
}

export async function upsertWeeklySalesTargets({ firm, salesPerson, weeks }) {
  const db = getPool()
  for (const week of weeks) {
    await db.query(`INSERT INTO weekly_sales_targets (firm, sales_person, start_date, end_date, amount)
      VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
    [firm, salesPerson, week.startDate, week.endDate, week.amount])
  }
  return { saved: weeks.length }
}

export async function replaceOutstandingSnapshot(firm, snapshotDate, rows) {
  const db = getPool()
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    await connection.query('DELETE FROM outstanding_snapshots WHERE firm = ? AND snapshot_date = ?', [firm, snapshotDate])
    for (const row of rows) await connection.query(`INSERT INTO outstanding_snapshots
      (firm, snapshot_date, party_key, party_name, bill_reference, bill_date, due_date, original_amount, outstanding_amount, bill_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [firm, snapshotDate, row.partyKey, row.partyName, row.billReference, row.billDate || null, row.dueDate || null, row.originalAmount, row.outstandingAmount, row.billStatus])
    await connection.commit()
    return { saved: rows.length }
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}

export async function getOutstandingSnapshot(firm, snapshotDate) {
  const db = getPool()
  const [rows] = await db.query(`SELECT firm, DATE_FORMAT(snapshot_date, '%Y-%m-%d') AS snapshotDate,
    party_key AS partyKey, party_name AS partyName, bill_reference AS billReference,
    DATE_FORMAT(bill_date, '%Y-%m-%d') AS billDate, DATE_FORMAT(due_date, '%Y-%m-%d') AS dueDate,
    original_amount AS originalAmount, outstanding_amount AS outstandingAmount, bill_status AS billStatus,
    DATE_FORMAT(fetched_at, '%Y-%m-%d %H:%i:%s') AS fetchedAt
    FROM outstanding_snapshots WHERE firm = ? AND snapshot_date = ? ORDER BY party_name, due_date`, [firm, snapshotDate])
  return rows
}

export async function replaceReceiptAllocations(receiptId, allocations) {
  const db = getPool()
  await db.query('DELETE FROM receipt_allocations WHERE receipt_id = ?', [receiptId])
  for (const row of allocations) await db.query(`INSERT INTO receipt_allocations (receipt_id, bill_reference, allocation_type, amount)
    VALUES (?, ?, ?, ?)`, [receiptId, row.billReference, row.allocationType, row.amount])
}

export async function getExclusions() {
  const db = getPool()
  const [rows] = await db.query(`
    SELECT id, firm, party_key AS partyKey, party_name AS partyName
    FROM intercompany_exclusions ORDER BY firm, party_name
  `)
  return rows
}

export async function upsertExclusion({ firm, partyKey, partyName }) {
  const db = getPool()
  await db.query(`
    INSERT INTO intercompany_exclusions (firm, party_key, party_name)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE party_name = VALUES(party_name)
  `, [firm, partyKey, partyName])
  const [rows] = await db.query(`
    SELECT id, firm, party_key AS partyKey, party_name AS partyName
    FROM intercompany_exclusions WHERE firm = ? AND party_key = ?
  `, [firm, partyKey])
  return rows[0]
}

export async function deleteExclusion(id) {
  const db = getPool()
  const [result] = await db.query('DELETE FROM intercompany_exclusions WHERE id = ?', [id])
  if (!result.affectedRows) throw new Error('Intercompany exclusion not found.')
  return { id }
}

export async function getCompanies() {
  const db = getPool()
  const [rows] = await db.query(`
    SELECT external_id AS id, company, address, district, state, gst_no AS gstNo,
      email, contact_person AS contactPerson, contact_number AS contactNumber,
      pin, sales_person AS salesPerson, dealing_person AS dealingPerson, ref_person AS refPerson, target,
      DATE_FORMAT(synced_at, '%Y-%m-%d %H:%i:%s') AS syncedAt
    FROM companies ORDER BY company
  `)
  return rows
}

export async function upsertCompanies(companies) {
  if (!companies.length) return { synced: 0 }
  const db = getPool()
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    for (const row of companies) {
      await connection.query(`
        INSERT INTO companies
          (external_id, company, address, district, state, gst_no, email, contact_person,
           contact_number, pin, sales_person, dealing_person, ref_person, target, source_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          company = VALUES(company), address = VALUES(address), district = VALUES(district),
          state = VALUES(state), gst_no = VALUES(gst_no), email = VALUES(email),
          contact_person = VALUES(contact_person), contact_number = VALUES(contact_number),
          pin = VALUES(pin), sales_person = VALUES(sales_person), dealing_person = VALUES(dealing_person),
          ref_person = VALUES(ref_person), target = VALUES(target),
          source_data = VALUES(source_data)
      `, [row.id, row.company, row.address, row.district, row.state, row.gstNo, row.email,
        row.contactPerson, row.contactNumber, row.pin, row.salesPerson, row.dealingPerson, row.refPerson,
        row.target, JSON.stringify(row.sourceData)])
    }
    await connection.commit()
    return { synced: companies.length }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
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
