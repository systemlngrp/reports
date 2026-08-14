import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
})

const voucherTypes = {
  sales: 'Sales',
  receipts: 'Receipt',
  creditNotes: 'Credit Note',
}

export async function testTallyConnection(port) {
  const response = await postToTally(port, buildCompanyRequest())
  return {
    ok: true,
    message: response.includes('<') ? 'Tally responded successfully.' : 'Tally responded.',
  }
}

export async function fetchVoucherData({ firm, type, fromDate, toDate }) {
  const voucherType = voucherTypes[type] || 'Sales'
  const xml = await postToTally(firm.port, buildVoucherRequest(voucherType, fromDate, toDate))
  const parsed = parser.parse(xml)
  const vouchers = collectByKey(parsed, 'VOUCHER')

  if (type !== 'sales') {
    return {
      records: [],
      rawCount: vouchers.length,
      message: `${voucherType} fetch completed. Detailed table mapping can be extended after live Tally XML is confirmed.`,
    }
  }

  const records = vouchers.flatMap((voucher, voucherIndex) =>
    normalizeSalesVoucher(voucher, firm.name, voucherIndex),
  )

  return {
    records,
    rawCount: vouchers.length,
    message: records.length
      ? `Fetched ${records.length} sales item rows from ${firm.name}.`
      : `Tally responded, but no Sales rows were found for ${firm.name}.`,
  }
}

async function postToTally(port, body) {
  const url = `http://localhost:${port}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml' },
      body,
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Tally returned HTTP ${response.status}`)
    }

    return await response.text()
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'Connection timed out' : error.message
    throw new Error(`Could not connect to Tally on port ${port}. ${reason}.`)
  } finally {
    clearTimeout(timeout)
  }
}

function buildCompanyRequest() {
  return `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>Company</ID>
  </HEADER>
  <BODY>
    <DESC>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="Company" ISMODIFY="No">
            <TYPE>Company</TYPE>
            <FETCH>Name</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`.trim()
}

function buildVoucherRequest(voucherType, fromDate, toDate) {
  const from = formatTallyDate(fromDate)
  const to = formatTallyDate(toDate)

  return `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>VoucherCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVFROMDATE>${from}</SVFROMDATE>
        <SVTODATE>${to}</SVTODATE>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="VoucherCollection" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>Date,VoucherNumber,PartyLedgerName,VoucherTypeName,InventoryEntries.*,AllInventoryEntries.*,AccountingEntries.*,LedgerEntries.*</FETCH>
            <FILTER>VoucherTypeFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="VoucherTypeFilter">$VoucherTypeName = "${voucherType}"</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`.trim()
}

function formatTallyDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10).replaceAll('-', '')
  return String(value).replaceAll('-', '')
}

function collectByKey(value, key, results = []) {
  if (!value || typeof value !== 'object') return results

  if (Array.isArray(value)) {
    value.forEach((item) => collectByKey(item, key, results))
    return results
  }

  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey.toUpperCase() === key) {
      if (Array.isArray(entryValue)) results.push(...entryValue)
      else results.push(entryValue)
    } else {
      collectByKey(entryValue, key, results)
    }
  }

  return results
}

function normalizeSalesVoucher(voucher, firmName, voucherIndex) {
  const entries = asArray(voucher['ALLINVENTORYENTRIES.LIST'] || voucher['INVENTORYENTRIES.LIST'])
  const date = normalizeDate(voucher.DATE)
  const invoiceNo = stringValue(voucher.VOUCHERNUMBER || voucher.REFERENCE || `TALLY-${voucherIndex + 1}`)
  const debtor = stringValue(voucher.PARTYLEDGERNAME || '')

  if (!entries.length) {
    return [
      {
        id: `${firmName}-${invoiceNo}-${voucherIndex}-0`,
        firm: firmName,
        date,
        debtor,
        invoiceNo,
        item: '',
        partNo: '',
        qty: 0,
        rate: 0,
        amount: Math.abs(numberValue(voucher.AMOUNT)),
        source: 'tally',
      },
    ]
  }

  return entries.map((entry, entryIndex) => ({
    id: `${firmName}-${invoiceNo}-${voucherIndex}-${entryIndex}`,
    firm: firmName,
    date,
    debtor,
    invoiceNo,
    item: stringValue(entry.STOCKITEMNAME),
    partNo: stringValue(entry.PARTNO || entry.BASICUSERDESCRIPTION || ''),
    qty: quantityValue(entry.ACTUALQTY || entry.BILLEDQTY),
    rate: numberValue(entry.RATE),
    amount: Math.abs(numberValue(entry.AMOUNT)),
    source: 'tally',
  }))
}

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function stringValue(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'object') return stringValue(value['#text'] || value._ || '')
  return String(value)
}

function numberValue(value) {
  const match = stringValue(value).match(/-?\d+(\.\d+)?/)
  return match ? Number(match[0]) : 0
}

function quantityValue(value) {
  return Math.abs(numberValue(value))
}

function normalizeDate(value) {
  const date = stringValue(value)
  if (/^\d{8}$/.test(date)) {
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
  }
  return date
}
