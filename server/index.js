import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import {
  appendCreditNoteHistory,
  appendReceiptHistory,
  appendSalesHistory,
  createFirm,
  deleteFirm,
  ensureSchema,
  getCreditNoteHistory,
  getFirms,
  getReceiptHistory,
  getSalesHistory,
  updateFirm,
} from './store.js'
import { fetchVoucherData, testTallyConnection } from './tally.js'

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
