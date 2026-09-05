import { financialYearForDate, normalizeParty } from './sales-report.js'

export function buildCreditNoteReport({ creditNotes = [], allocations = [], companies = [], filters = {} }) {
  const companyMap = new Map(companies.map((row) => [normalizeParty(row.company), row]))
  const allocationMap = new Map()
  allocations.forEach((row) => { if (!allocationMap.has(row.creditNoteId)) allocationMap.set(row.creditNoteId, []); allocationMap.get(row.creditNoteId).push(row) })
  const unmatched = new Set()
  const rows = []
  creditNotes.forEach((note) => {
    const company = companyMap.get(normalizeParty(note.party))
    if (!company && note.party) unmatched.add(note.party)
    const dealingPerson = company?.dealingPerson || company?.salesPerson || ''
    const refPerson = company?.refPerson || ''
    const month = note.date ? new Date(`${note.date}T00:00:00Z`).toLocaleString('en-IN', { month: 'long', timeZone: 'UTC' }) : ''
    const financialYear = note.date ? financialYearForDate(note.date) : ''
    const noteAllocations = allocationMap.get(note.id) || []
    const parts = noteAllocations.length ? noteAllocations : [{ invoiceReference: '', allocationType: '', amount: note.amount }]
    parts.forEach((allocation, index) => rows.push({
      id: `${note.id}:${index}`, creditNoteId: note.id, firm: note.firm, mainAccount: note.party, date: note.date,
      amount: Number(allocation.amount || 0), narration: note.narration || '', invoiceReference: allocation.invoiceReference || '',
      voucherNo: note.voucherNo, allocationType: allocation.allocationType || '', dealingPerson, refPerson, month, financialYear,
    }))
  })
  const search = String(filters.search || '').trim().toLocaleLowerCase('en-IN')
  const filteredRows = rows.filter((row) => (!filters.firm || row.firm === filters.firm)
    && (!filters.financialYear || row.financialYear === filters.financialYear) && (!filters.month || row.month === filters.month)
    && (!filters.dealingPerson || row.dealingPerson === filters.dealingPerson) && (!filters.refPerson || row.refPerson === filters.refPerson)
    && (!search || [row.mainAccount, row.invoiceReference, row.voucherNo, row.narration].some((value) => String(value || '').toLocaleLowerCase('en-IN').includes(search))))
  const visibleNotes = new Map()
  filteredRows.forEach((row) => { if (!visibleNotes.has(row.creditNoteId)) visibleNotes.set(row.creditNoteId, creditNotes.find((note) => note.id === row.creditNoteId)) })
  return {
    rows: filteredRows,
    summary: { rowCount: filteredRows.length, totalAmount: [...visibleNotes.values()].reduce((sum, note) => sum + Number(note?.amount || 0), 0), customerCount: new Set(filteredRows.map((row) => normalizeParty(row.mainAccount))).size },
    options: { firms: unique(rows.map((row) => row.firm)), financialYears: unique(rows.map((row) => row.financialYear)).reverse(), months: orderMonths(rows.map((row) => row.month)), dealingPeople: unique(rows.map((row) => row.dealingPerson)), refPeople: unique(rows.map((row) => row.refPerson)) },
    unmatched: [...unmatched].sort(), filters,
  }
}

function unique(values) { return [...new Set(values.filter(Boolean))].sort() }
function orderMonths(values) { const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']; const found = new Set(values); return names.filter((name) => found.has(name)) }
