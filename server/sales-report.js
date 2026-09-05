export const fiscalMonths = [
  { index: 1, name: 'April', calendarMonth: 4 },
  { index: 2, name: 'May', calendarMonth: 5 },
  { index: 3, name: 'June', calendarMonth: 6 },
  { index: 4, name: 'July', calendarMonth: 7 },
  { index: 5, name: 'August', calendarMonth: 8 },
  { index: 6, name: 'September', calendarMonth: 9 },
  { index: 7, name: 'October', calendarMonth: 10 },
  { index: 8, name: 'November', calendarMonth: 11 },
  { index: 9, name: 'December', calendarMonth: 12 },
  { index: 10, name: 'January', calendarMonth: 1 },
  { index: 11, name: 'February', calendarMonth: 2 },
  { index: 12, name: 'March', calendarMonth: 3 },
]

export function normalizeParty(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN')
}

export function financialYearForDate(value) {
  const date = parseDate(value)
  const startYear = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1
  return `${startYear}-${String(startYear + 1).slice(-2)}`
}

export function financialYearBounds(financialYear) {
  const match = String(financialYear || '').match(/^(\d{4})-(\d{2}|\d{4})$/)
  if (!match) throw new Error('Financial year must use YYYY-YY format.')
  const startYear = Number(match[1])
  const endYear = startYear + 1
  return { startYear, start: `${startYear}-04-01`, end: `${endYear}-03-31` }
}

export function fiscalMonthIndex(value) {
  const date = parseDate(value)
  const month = date.getUTCMonth() + 1
  return month >= 4 ? month - 3 : month + 9
}

export function periodTargetAmount(monthlyTargets, financialYear, asOfDate) {
  const { start, end } = financialYearBounds(financialYear)
  const cutoff = clampDate(asOfDate, start, end)
  const currentMonth = fiscalMonthIndex(cutoff)
  const date = parseDate(cutoff)
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  return monthlyTargets.reduce((sum, amount, offset) => {
    const monthIndex = offset + 1
    if (monthIndex < currentMonth) return sum + number(amount)
    if (monthIndex === currentMonth) return sum + number(amount) * (date.getUTCDate() / daysInMonth)
    return sum
  }, 0)
}

export function buildSalesReport({ sales = [], creditNotes = [], targets = [], exclusions = [], firms = [], financialYear, asOfDate }) {
  const { start, end } = financialYearBounds(financialYear)
  const cutoff = clampDate(asOfDate, start, end)
  const firmSet = new Set(firms.filter(Boolean))
  const includeFirm = (firm) => !firmSet.size || firmSet.has(firm)
  const exclusionSet = new Set(exclusions.map((row) => `${row.firm}\u0000${normalizeParty(row.partyName)}`))
  const customers = new Map()

  function customer(name) {
    const key = normalizeParty(name)
    if (!key) return null
    if (!customers.has(key)) {
      customers.set(key, {
        customerKey: key,
        customerName: String(name || '').trim(),
        grossSales: 0,
        creditNotes: 0,
        netSales: 0,
        target: 0,
        contributionPercent: 0,
        achievementPercent: null,
        shortfallExcess: 0,
        months: fiscalMonths.map(({ index, name }) => ({ index, name, grossSales: 0, creditNotes: 0, netSales: 0, target: 0 })),
      })
    }
    return customers.get(key)
  }

  let grossSales = 0
  let creditNoteAmount = 0
  let intercompanyExclusions = 0

  for (const row of sales) {
    if (!includeFirm(row.firm) || !inRange(row.date, start, cutoff)) continue
    const amount = number(row.amount)
    grossSales += amount
    if (exclusionSet.has(`${row.firm}\u0000${normalizeParty(row.debtor)}`)) {
      intercompanyExclusions += amount
      continue
    }
    const item = customer(row.debtor)
    if (!item) continue
    const month = item.months[fiscalMonthIndex(row.date) - 1]
    item.grossSales += amount
    month.grossSales += amount
  }

  for (const row of creditNotes) {
    if (!includeFirm(row.firm) || !inRange(row.date, start, cutoff)) continue
    if (exclusionSet.has(`${row.firm}\u0000${normalizeParty(row.party)}`)) continue
    const item = customer(row.party)
    if (!item) continue
    const amount = number(row.amount)
    const month = item.months[fiscalMonthIndex(row.date) - 1]
    item.creditNotes += amount
    month.creditNotes += amount
    creditNoteAmount += amount
  }

  for (const row of targets) {
    if (row.financialYear !== financialYear) continue
    const item = customer(row.customerName)
    if (!item) continue
    const index = Number(row.fiscalMonth) - 1
    if (index < 0 || index > 11) continue
    item.months[index].target += number(row.amount)
  }

  let periodTarget = 0
  let netSales = 0
  for (const item of customers.values()) {
    item.months.forEach((month) => { month.netSales = month.grossSales - month.creditNotes })
    item.netSales = item.grossSales - item.creditNotes
    item.target = periodTargetAmount(item.months.map((month) => month.target), financialYear, cutoff)
    item.achievementPercent = item.target > 0 ? (item.netSales / item.target) * 100 : null
    item.shortfallExcess = item.netSales - item.target
    netSales += item.netSales
    periodTarget += item.target
  }

  const rows = [...customers.values()]
    .map((item) => ({ ...item, contributionPercent: netSales ? (item.netSales / netSales) * 100 : 0 }))
    .sort((a, b) => b.netSales - a.netSales || a.customerName.localeCompare(b.customerName))

  const monthly = fiscalMonths.map(({ index, name }) => {
    const values = rows.map((row) => row.months[index - 1])
    return {
      index,
      name,
      netSales: values.reduce((sum, value) => sum + value.netSales, 0),
      target: values.reduce((sum, value) => sum + value.target, 0),
    }
  })

  return {
    filters: { financialYear, asOfDate: cutoff, firms: [...firmSet] },
    kpis: {
      grossSales,
      creditNotes: creditNoteAmount,
      intercompanyExclusions,
      netSales,
      periodTarget,
      achievementPercent: periodTarget > 0 ? (netSales / periodTarget) * 100 : null,
      shortfallExcess: netSales - periodTarget,
    },
    monthly,
    customers: rows,
  }
}

function parseDate(value) {
  const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) throw new Error('A valid date is required.')
  return date
}

function clampDate(value, minimum, maximum) {
  const normalized = parseDate(value).toISOString().slice(0, 10)
  return normalized < minimum ? minimum : normalized > maximum ? maximum : normalized
}

function inRange(value, start, end) {
  const date = String(value || '').slice(0, 10)
  return date >= start && date <= end
}

function number(value) {
  const result = Number(value || 0)
  return Number.isFinite(result) ? result : 0
}
