import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import {
  appendCreditNoteHistory,
  appendReceiptHistory,
  appendSalesHistory,
  createFirm,
  deleteExclusion,
  deleteFirm,
  deleteSalesPersonTargets,
  deleteTargets,
  ensureSchema,
  getCreditNoteHistory,
  getCreditNoteAllocations,
  getCompanies,
  getExclusions,
  getFirms,
  getReceiptHistory,
  getOutstandingSnapshot,
  getSalesHistory,
  getSalesPersonTargets,
  getTargets,
  getWeeklySalesTargets,
  upsertExclusion,
  upsertCompanies,
  upsertTargets,
  upsertSalesPersonTargets,
  upsertWeeklySalesTargets,
  replaceOutstandingSnapshot,
  updateFirm,
} from './store.js'
import { fetchOutstandingData, fetchVoucherData, testTallyConnection } from './tally.js'
import { buildSalesReport, financialYearForDate, normalizeParty } from './sales-report.js'
import { buildTargetPerformance, monthRange, weeksForMonth } from './target-performance.js'
import { buildFirmWiseReport } from './firm-wise-report.js'
import { buildCreditNoteReport } from './credit-note-report.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT || 4000)
const distPath = path.join(__dirname, '..', 'dist')

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '2mb' }))

let storeMode = 'starting'
let startupError = ''

app.get('/api/health', (_req, res) => {
  res.status(startupError ? 503 : 200).json({ ok: !startupError, storeMode, message: startupError })
})

app.get('/api/firms', async (_req, res) => {
  try {
    res.json(await getFirms())
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.post('/api/firms', async (req, res) => {
  try {
    const firm = validateFirm(req.body)
    res.status(201).json(await createFirm(firm))
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

app.put('/api/firms/:id', async (req, res) => {
  try {
    const firm = validateFirm(req.body)
    res.json(await updateFirm(req.params.id, firm))
  } catch (error) {
    res.status(error.message === 'Firm not found.' ? 404 : 400).json({ message: error.message })
  }
})

app.delete('/api/firms/:id', async (req, res) => {
  try {
    res.json(await deleteFirm(req.params.id))
  } catch (error) {
    res.status(error.message === 'Firm not found.' ? 404 : 400).json({ message: error.message })
  }
})

app.post('/api/firms/:id/test', async (req, res) => {
  try {
    const firms = await getFirms()
    const firm = firms.find((item) => item.id === req.params.id)
    if (!firm) return res.status(404).json({ message: 'Firm not found.' })
    validatePort(firm.port)
    res.json(await testTallyConnection(firm.port))
  } catch (error) {
    res.status(502).json({ ok: false, message: error.message })
  }
})

app.get('/api/sales-history', async (_req, res) => {
  try {
    res.json(await getSalesHistory())
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.get('/api/receipts-history', async (_req, res) => {
  try {
    res.json(await getReceiptHistory())
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.get('/api/credit-notes-history', async (_req, res) => {
  try {
    res.json(await getCreditNoteHistory())
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.get('/api/reporting/credit-notes', async (req, res) => {
  try {
    const [creditNotes, allocations, companies] = await Promise.all([getCreditNoteHistory(), getCreditNoteAllocations(), getCompanies()])
    res.json(buildCreditNoteReport({ creditNotes, allocations, companies, filters: {
      firm: String(req.query.firm || ''), financialYear: String(req.query.financialYear || ''), month: String(req.query.month || ''),
      dealingPerson: String(req.query.dealingPerson || ''), refPerson: String(req.query.refPerson || ''), search: String(req.query.search || ''),
    } }))
  } catch (error) { res.status(400).json({ message: error.message }) }
})

app.get('/api/companies', async (_req, res) => {
  try {
    res.json(await getCompanies())
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.post('/api/sync/companies', companySyncHandler)
app.post('/api/npd-sync', companySyncHandler)

async function companySyncHandler(req, res) {
  try {
    validateSyncRequest(req)
    const syncMode = String(req.body?.syncMode || req.body?.mode || 'batch')
    if (syncMode === 'full_finalize') {
      const processedIds = Array.isArray(req.body?.processedIds) ? req.body.processedIds.map(String) : []
      return res.json({ ok: true, success: true, syncMode, processedRows: processedIds.length, processedIds, inserted: 0, updated: 0, removed: 0, invalidRows: [], duplicateIds: [] })
    }
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null
    if (!rows) throw new Error('A rows array is required.')
    const maximum = Number(process.env.COMPANY_SYNC_MAX_BATCH_SIZE || 500)
    if (rows.length > maximum) throw new Error(`A maximum of ${maximum} company rows can be synchronized at once.`)
    const companies = rows.map(normalizeCompanyRow)
    const result = await upsertCompanies(companies)
    const processedIds = companies.map((company) => company.id)
    res.json({
      ok: true,
      success: true,
      syncMode,
      processedRows: result.synced,
      processedIds,
      inserted: 0,
      updated: result.synced,
      removed: 0,
      invalidRows: [],
      duplicateIds: [],
    })
  } catch (error) {
    const status = error.code === 'SYNC_AUTH' ? 401 : error.code === 'SYNC_CONFIG' ? 503 : 400
    res.status(status).json({ ok: false, success: false, message: error.message })
  }
}

app.get('/api/reporting/ledgers', async (_req, res) => {
  try {
    const [sales, creditNotes] = await Promise.all([getSalesHistory(), getCreditNoteHistory()])
    const values = new Map()
    sales.forEach((row) => addLedger(values, row.firm, row.debtor))
    creditNotes.forEach((row) => addLedger(values, row.firm, row.party))
    res.json([...values.values()].sort((a, b) => a.partyName.localeCompare(b.partyName)))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.get('/api/reporting/targets', async (req, res) => {
  try {
    res.json(await getTargets(req.query.financialYear))
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.put('/api/reporting/targets', async (req, res) => {
  try {
    const target = validateTarget(req.body)
    res.json(await upsertTargets(target))
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

app.delete('/api/reporting/targets/:customerKey/:financialYear', async (req, res) => {
  try {
    res.json(await deleteTargets(normalizeParty(req.params.customerKey), req.params.financialYear))
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

app.get('/api/reporting/sales-person-targets', async (req, res) => {
  try {
    res.json(await getSalesPersonTargets({ firm: String(req.query.firm || ''), financialYear: String(req.query.financialYear || '') }))
  } catch (error) { res.status(500).json({ message: error.message }) }
})

app.put('/api/reporting/sales-person-targets', async (req, res) => {
  try {
    res.json(await upsertSalesPersonTargets(validateSalesPersonTarget(req.body)))
  } catch (error) { res.status(400).json({ message: error.message }) }
})

app.delete('/api/reporting/sales-person-targets', async (req, res) => {
  try {
    const firm = requiredText(req.query.firm, 'Firm')
    const salesPerson = requiredText(req.query.salesPerson, 'Sales person')
    const financialYear = validFinancialYear(req.query.financialYear)
    res.json(await deleteSalesPersonTargets(firm, salesPerson, financialYear))
  } catch (error) { res.status(400).json({ message: error.message }) }
})

app.get('/api/reporting/target-performance', async (req, res) => {
  try {
    const firm = requiredText(req.query.firm, 'Firm')
    const financialYear = validFinancialYear(req.query.financialYear)
    const salesPerson = String(req.query.salesPerson || '').trim()
    const fiscalMonth = req.query.fiscalMonth ? validFiscalMonth(req.query.fiscalMonth) : 0
    const asOfDate = String(req.query.asOfDate || new Date().toISOString().slice(0, 10))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new Error('As-of date must use YYYY-MM-DD.')
    const [sales, creditNotes, companies, monthlyTargets] = await Promise.all([
      getSalesHistory(), getCreditNoteHistory(), getCompanies(), getSalesPersonTargets({ firm, financialYear }),
    ])
    let weeklyTargets = []
    if (salesPerson && fiscalMonth) {
      const range = monthRange(financialYear, fiscalMonth)
      weeklyTargets = await getWeeklySalesTargets({ firm, salesPerson, startDate: range.startDate, endDate: range.endDate })
    }
    res.json(buildTargetPerformance({ sales, creditNotes, companies, monthlyTargets, weeklyTargets, firm, financialYear, salesPerson, fiscalMonth, asOfDate }))
  } catch (error) { res.status(400).json({ message: error.message }) }
})

app.put('/api/reporting/weekly-sales-targets', async (req, res) => {
  try {
    const firm = requiredText(req.body.firm, 'Firm')
    const salesPerson = requiredText(req.body.salesPerson, 'Sales person')
    const financialYear = validFinancialYear(req.body.financialYear)
    const fiscalMonth = validFiscalMonth(req.body.fiscalMonth)
    const expected = weeksForMonth(financialYear, fiscalMonth)
    if (!Array.isArray(req.body.weeks) || req.body.weeks.length !== expected.length) throw new Error('All generated weeks are required.')
    const weeks = req.body.weeks.map((week, index) => {
      const amount = Number(week.amount)
      if (week.startDate !== expected[index].startDate || week.endDate !== expected[index].endDate) throw new Error('Week boundaries do not match the selected month.')
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Weekly targets must be non-negative numbers.')
      return { startDate: week.startDate, endDate: week.endDate, amount }
    })
    res.json(await upsertWeeklySalesTargets({ firm, salesPerson, weeks }))
  } catch (error) { res.status(400).json({ message: error.message }) }
})

app.get('/api/reporting/exclusions', async (_req, res) => {
  try {
    res.json(await getExclusions())
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.post('/api/reporting/exclusions', async (req, res) => {
  try {
    const firm = String(req.body.firm || '').trim()
    const partyName = String(req.body.partyName || '').trim()
    if (!firm || !partyName) throw new Error('Firm and party are required.')
    res.status(201).json(await upsertExclusion({ firm, partyName, partyKey: normalizeParty(partyName) }))
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

app.delete('/api/reporting/exclusions/:id', async (req, res) => {
  try {
    res.json(await deleteExclusion(req.params.id))
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 400).json({ message: error.message })
  }
})

app.get('/api/reporting/sales-tracker', async (req, res) => {
  try {
    const asOfDate = String(req.query.asOfDate || new Date().toISOString().slice(0, 10))
    const financialYear = String(req.query.financialYear || financialYearForDate(asOfDate))
    const firms = typeof req.query.firms === 'string' ? req.query.firms.split(',').filter(Boolean) : []
    const [sales, creditNotes, targets, exclusions] = await Promise.all([
      getSalesHistory(), getCreditNoteHistory(), getTargets(financialYear), getExclusions(),
    ])
    res.json(buildSalesReport({ sales, creditNotes, targets, exclusions, firms, financialYear, asOfDate }))
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

app.get('/api/reporting/firm-wise', async (req, res) => {
  try {
    const firm = requiredText(req.query.firm, 'Firm')
    const asOfDate = validDate(req.query.asOfDate, 'As-of date')
    const financialYear = financialYearForDate(asOfDate)
    const [sales, creditNotes, receipts, targets, companies, outstanding] = await Promise.all([
      getSalesHistory(), getCreditNoteHistory(), getReceiptHistory(), getTargets(financialYear), getCompanies(), getOutstandingSnapshot(firm, asOfDate),
    ])
    res.json(buildFirmWiseReport({ firm, asOfDate, sales, creditNotes, receipts, targets, companies, outstanding,
      dealingPerson: String(req.query.dealingPerson || ''), refPerson: String(req.query.refPerson || ''), snapshotAt: outstanding[0]?.fetchedAt || null }))
  } catch (error) { res.status(400).json({ message: error.message }) }
})

app.post('/api/tally/outstanding/fetch', async (req, res) => {
  try {
    const asOfDate = validDate(req.body.asOfDate, 'As-of date')
    const firms = await getFirms()
    const firm = firms.find((row) => row.id === String(req.body.firmId || ''))
    if (!firm) return res.status(404).json({ message: 'Firm not found.' })
    validatePort(firm.port)
    const result = await fetchOutstandingData({ firm, asOfDate })
    const saved = await replaceOutstandingSnapshot(firm.name, asOfDate, result.records)
    res.json({ firmId: firm.id, firm: firm.name, asOfDate, ...result, ...saved })
  } catch (error) { res.status(400).json({ message: error.message }) }
})

app.post('/api/tally/:type/fetch', async (req, res) => {
  try {
    const { type } = req.params
    if (!['sales', 'receipts', 'credit-notes'].includes(type)) {
      return res.status(404).json({ message: 'Unsupported voucher type.' })
    }

    const firms = await getFirms()
    const selectedFirmIds = req.body.firmIds?.length ? req.body.firmIds : firms.map((firm) => firm.id)
    const selectedFirms = firms.filter((firm) => selectedFirmIds.includes(firm.id))
    const normalizedType = type === 'credit-notes' ? 'creditNotes' : type
    const results = []
    let savedRecords = []

    for (const firm of selectedFirms) {
      try {
        validatePort(firm.port)
        const result = await fetchVoucherData({
          firm,
          type: normalizedType,
          fromDate: req.body.fromDate,
          toDate: req.body.toDate,
        })
        const appended = await saveVoucherRecords(normalizedType, result.records)
        savedRecords = [...savedRecords, ...appended]
        results.push({ firmId: firm.id, firm: firm.name, ok: true, ...result })
      } catch (error) {
        results.push({ firmId: firm.id, firm: firm.name, ok: false, message: error.message })
      }
    }

    res.json({ results, savedRecords })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

app.use(express.static(distPath))

app.get('/favicon.ico', (_req, res) => {
  res.redirect(301, '/favicon.svg')
})

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

function validateFirm(firm) {
  if (!firm || typeof firm !== 'object') throw new Error('Firm details are required.')
  const name = String(firm.name || '').trim()
  if (!name) throw new Error('Firm name is required.')

  return {
    id: firm.id,
    name: String(firm.name || '').trim(),
    port: validatePort(firm.port),
  }
}

function validateTarget(value) {
  const customerName = String(value?.customerName || '').trim()
  const financialYear = String(value?.financialYear || '').trim()
  if (!customerName) throw new Error('Customer is required.')
  if (!/^\d{4}-\d{2}$/.test(financialYear)) throw new Error('Financial year must use YYYY-YY format.')
  if (!Array.isArray(value.months) || value.months.length !== 12) throw new Error('All 12 monthly targets are required.')
  const months = value.months.map(Number)
  if (months.some((amount) => !Number.isFinite(amount) || amount < 0)) throw new Error('Targets must be valid non-negative amounts.')
  return { customerName, customerKey: normalizeParty(customerName), financialYear, months }
}

function requiredText(value, label) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${label} is required.`)
  return text
}

function validDate(value, label) {
  const date = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error(`${label} must use a valid YYYY-MM-DD date.`)
  return date
}

function validFinancialYear(value) {
  const financialYear = String(value || '').trim()
  if (!/^\d{4}-\d{2}$/.test(financialYear)) throw new Error('Financial year must use YYYY-YY format.')
  const start = Number(financialYear.slice(0, 4))
  if (Number(financialYear.slice(5)) !== (start + 1) % 100) throw new Error('Financial year must contain consecutive years.')
  return financialYear
}

function validFiscalMonth(value) {
  const fiscalMonth = Number(value)
  if (!Number.isInteger(fiscalMonth) || fiscalMonth < 1 || fiscalMonth > 12) throw new Error('Fiscal month must be between 1 and 12.')
  return fiscalMonth
}

function validateSalesPersonTarget(value) {
  const firm = requiredText(value?.firm, 'Firm')
  const salesPerson = requiredText(value?.salesPerson, 'Sales person')
  const financialYear = validFinancialYear(value?.financialYear)
  if (!Array.isArray(value?.months) || value.months.length !== 12) throw new Error('All 12 monthly targets are required.')
  const months = value.months.map(Number)
  if (months.some((amount) => !Number.isFinite(amount) || amount < 0)) throw new Error('Targets must be valid non-negative amounts.')
  return { firm, salesPerson, financialYear, months }
}

function validateSyncRequest(req) {
  const expectedSecret = String(process.env.NPD_SYNC_SECRET || '')
  if (!expectedSecret) throw syncError('NPD_SYNC_SECRET is not configured.', 'SYNC_CONFIG')
  const allowedTab = String(process.env.NPD_SYNC_ALLOWED_TAB || 'Companies')
  if (String(req.body?.tabName || '') !== allowedTab) throw new Error(`Only the ${allowedTab} tab may be synchronized.`)
  const receivedSecret = String(req.get('x-npd-sync-secret') || req.get('X-Sync-Secret') || '')
  const expected = Buffer.from(expectedSecret)
  const received = Buffer.from(receivedSecret)
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw syncError('Invalid synchronization credentials.', 'SYNC_AUTH')
  }
}

function normalizeCompanyRow(row, index) {
  if (!row || typeof row !== 'object') throw new Error(`Company row ${index + 1} is invalid.`)
  const company = String(row.Company || '').trim()
  const id = String(row.Id || '').trim()
  if (!id) throw new Error(`Company row ${index + 1} is missing Id.`)
  if (!company) throw new Error(`Company row ${index + 1} is missing Company.`)
  const target = parseSheetAmount(row.TARGET)
  return {
    id, company, address: String(row.Address || '').trim(), district: String(row.District || '').trim(),
    state: String(row.State || '').trim(), gstNo: String(row['GST NO'] || '').trim(),
    email: String(row.Email || '').trim(), contactPerson: String(row['Contact Person'] || '').trim(),
    contactNumber: String(row['Contact Number'] || '').trim(), pin: String(row.PIN || '').trim(),
    salesPerson: String(row['Sales Person'] || row['Dealing Person'] || '').trim(),
    dealingPerson: String(row['Dealing Person'] || row['Sales Person'] || '').trim(),
    refPerson: String(row['Ref. Person'] || row['Ref Person'] || row['Reference Person'] || '').trim(),
    target, sourceData: row,
  }
}

function parseSheetAmount(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text || ['-', 'n/a', 'na', 'nil', 'none'].includes(text)) return 0
  const match = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return 0
  let amount = Number(match[0])
  if (/\b(?:crore|crores|cr)\b/.test(text)) amount *= 10000000
  else if (/\b(?:lakh|lakhs|lac|lacs)\b/.test(text)) amount *= 100000
  if (/^\(.*\)$/.test(text) && amount > 0) amount *= -1
  return Number.isFinite(amount) ? amount : 0
}

function syncError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

function addLedger(values, firm, name) {
  const partyName = String(name || '').trim()
  const partyKey = normalizeParty(partyName)
  if (!partyKey) return
  const key = `${firm}\u0000${partyKey}`
  if (!values.has(key)) values.set(key, { firm, partyKey, partyName })
}

function saveVoucherRecords(type, records) {
  if (type === 'sales') return appendSalesHistory(records)
  if (type === 'receipts') return appendReceiptHistory(records)
  if (type === 'creditNotes') return appendCreditNoteHistory(records)
  return []
}

function validatePort(port) {
  const value = String(port || '').trim()
  if (!/^\d{2,5}$/.test(value)) throw new Error('Port number is required and must be numeric.')
  const portNumber = Number(value)
  if (portNumber < 1 || portNumber > 65535) throw new Error('Port number must be between 1 and 65535.')
  return value
}

ensureSchema()
  .then((result) => {
    storeMode = result.mode
  })
  .catch((error) => {
    storeMode = 'mysql-error'
    startupError = error.message
    console.error('Failed to start Report API:', error)
  })
  .finally(() => {
    app.listen(port, () => {
      console.log(`Report API running on http://localhost:${port} using ${storeMode}`)
    })
  })
