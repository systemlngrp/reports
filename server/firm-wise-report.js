import { financialYearForDate, normalizeParty } from './sales-report.js'

export function buildFirmWiseReport({ firm, asOfDate, sales = [], creditNotes = [], receipts = [], targets = [], companies = [], outstanding = [], dealingPerson = '', refPerson = '', snapshotAt = null }) {
  const financialYear = financialYearForDate(asOfDate)
  const fyStart = `${financialYear.slice(0, 4)}-04-01`
  const monthStart = `${asOfDate.slice(0, 7)}-01`
  const previousEndDate = previousDay(monthStart)
  const previousStartDate = `${previousEndDate.slice(0, 7)}-01`
  const upcomingEndDate = addDays(asOfDate, 7)
  const fiscalMonth = fiscalMonthIndex(asOfDate)
  const companyMap = new Map(companies.map((row) => [normalizeParty(row.company), row]))
  const targetMap = new Map(targets.filter((row) => Number(row.fiscalMonth) === fiscalMonth).map((row) => [row.customerKey || normalizeParty(row.customerName), Number(row.amount || 0)]))
  const rows = new Map()
  const unmatched = new Map()
  function ensure(name) {
    const key = normalizeParty(name); if (!key) return null
    const company = companyMap.get(key)
    if (!company) unmatched.set(key, String(name || '').trim())
    if (!rows.has(key)) rows.set(key, { key, company: company?.company || String(name || '').trim(), dealingPerson: company?.dealingPerson || company?.salesPerson || '', refPerson: company?.refPerson || '', target: targetMap.get(key) || 0, fySales: 0, previousMonthSales: 0, selectedMonthSales: 0, collections: 0, totalDues: 0, notDue: 0, overdue: 0, upcoming: 0, onAccountReceipts: 0 })
    return rows.get(key)
  }
  function addSales(source, partyField, sign) { source.forEach((item) => { if (item.firm !== firm || !item.date || item.date > asOfDate) return; const row = ensure(item[partyField]); if (!row) return; const amount = Number(item.amount || 0) * sign; if (item.date >= fyStart) row.fySales += amount; if (item.date >= previousStartDate && item.date <= previousEndDate) row.previousMonthSales += amount; if (item.date >= monthStart) row.selectedMonthSales += amount }) }
  addSales(sales, 'debtor', 1); addSales(creditNotes, 'party', -1)
  receipts.forEach((item) => { if (item.firm !== firm || !item.date || item.date > asOfDate) return; const row = ensure(item.party); if (!row) return; if (item.date >= monthStart) row.collections += Number(item.amount || 0); if (item.date >= fyStart) row.onAccountReceipts += Number(item.onAccountAmount || 0) })
  outstanding.forEach((item) => { if (item.firm !== firm) return; const row = ensure(item.partyName); if (!row) return; const amount = Number(item.outstandingAmount || 0); row.totalDues += amount; if (item.dueDate && item.dueDate < asOfDate) row.overdue += amount; else row.notDue += amount; if (item.dueDate > asOfDate && item.dueDate <= upcomingEndDate) row.upcoming += amount })
  let customerRows = [...rows.values()].filter((row) => (!dealingPerson || row.dealingPerson === dealingPerson) && (!refPerson || row.refPerson === refPerson))
  customerRows.forEach((row) => { row.achievement = row.target > 0 ? row.selectedMonthSales / row.target * 100 : null })
  customerRows.sort((a, b) => a.dealingPerson.localeCompare(b.dealingPerson) || a.company.localeCompare(b.company))
  const numeric = ['target', 'fySales', 'previousMonthSales', 'selectedMonthSales', 'collections', 'totalDues', 'notDue', 'overdue', 'upcoming', 'onAccountReceipts']
  const totals = Object.fromEntries(numeric.map((key) => [key, customerRows.reduce((sum, row) => sum + row[key], 0)]))
  totals.achievement = totals.target > 0 ? totals.selectedMonthSales / totals.target * 100 : null
  return { firm, asOfDate, financialYear, monthStart, previousStartDate, previousEndDate, snapshotAt, rows: customerRows, totals, unmatched: [...unmatched.values()].sort(), filters: { dealingPerson, refPerson } }
}

function fiscalMonthIndex(value) { const month = Number(value.slice(5, 7)); return month >= 4 ? month - 3 : month + 9 }
function addDays(value, days) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }
function previousDay(value) { return addDays(value, -1) }
