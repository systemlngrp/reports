import path from 'node:path'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { appendSalesHistory, ensureSchema, getFirms, getSalesHistory, saveFirms } from './store.js'
import { fetchVoucherData, testTallyConnection } from './tally.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT || 4000)
const distPath = path.join(__dirname, '..', 'dist')

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '2mb' }))

let storeMode = 'local-json'

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, storeMode })
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
    const firms = validateFirms(req.body.firms || [])
    res.json(await saveFirms(firms))
  } catch (error) {
    res.status(400).json({ message: error.message })
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
        if (normalizedType === 'sales') {
          const appended = await appendSalesHistory(result.records)
          savedRecords = [...savedRecords, ...appended]
        }
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

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

function validateFirms(firms) {
  if (!Array.isArray(firms)) throw new Error('Firm list is required.')
  if (firms.length > 4) throw new Error('Only four firms are supported.')

  return firms.map((firm, index) => ({
    id: firm.id || `firm-${index + 1}`,
    name: String(firm.name || '').trim(),
    port: validatePort(firm.port),
  }))
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
    app.listen(port, () => {
      console.log(`Report API running on http://localhost:${port} using ${storeMode}`)
    })
  })
  .catch((error) => {
    console.error('Failed to start Report API:', error)
    process.exit(1)
  })
