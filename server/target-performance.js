import { normalizeParty } from './sales-report.js'

export const fiscalMonths = [
  ['April', 4], ['May', 5], ['June', 6], ['July', 7], ['August', 8], ['September', 9],
  ['October', 10], ['November', 11], ['December', 12], ['January', 1], ['February', 2], ['March', 3],
]

export function monthRange(financialYear, fiscalMonth) {
  const startYear = Number(String(financialYear).slice(0, 4))
  const calendarMonth = fiscalMonths[fiscalMonth - 1]?.[1]
  if (!startYear || !calendarMonth) throw new Error('A valid financial year and fiscal month are required.')
  const year = calendarMonth >= 4 ? startYear : startYear + 1
  const startDate = `${year}-${String(calendarMonth).padStart(2, '0')}-01`
  const endDate = new Date(Date.UTC(year, calendarMonth, 0)).toISOString().slice(0, 10)
  return { name: fiscalMonths[fiscalMonth - 1][0], startDate, endDate }
}

export function weeksForMonth(financialYear, fiscalMonth) {
  const { startDate, endDate } = monthRange(financialYear, fiscalMonth)
  const weeks = []
  let cursor = startDate
  while (cursor <= endDate) {
    const date = new Date(`${cursor}T00:00:00Z`)
    const daysToSunday = (7 - date.getUTCDay()) % 7
    const naturalEnd = new Date(date)
    naturalEnd.setUTCDate(date.getUTCDate() + daysToSunday)
    const weekEnd = naturalEnd.toISOString().slice(0, 10)
    const end = weekEnd < endDate ? weekEnd : endDate
    weeks.push({ index: weeks.length + 1, startDate: cursor, endDate: end })
    const next = new Date(`${end}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    cursor = next.toISOString().slice(0, 10)
  }
  return weeks
}

export function buildTargetPerformance({ sales = [], creditNotes = [], companies = [], monthlyTargets = [], weeklyTargets = [], firm, financialYear, salesPerson = '', fiscalMonth = 0, asOfDate }) {
  const today = asOfDate || new Date().toISOString().slice(0, 10)
  const companyPeople = new Map(companies.map((row) => [normalizeParty(row.company), String(row.salesPerson || '').trim()]))
  const people = new Set(companies.map((row) => String(row.salesPerson || '').trim()).filter(Boolean))
  monthlyTargets.forEach((row) => people.add(row.salesPerson))
  const selectedPeople = [...people].filter((person) => !salesPerson || person === salesPerson).sort()
  const data = new Map(selectedPeople.map((person) => [person, {
    salesPerson: person,
    months: fiscalMonths.map(([name], index) => ({ index: index + 1, name, target: 0, actual: 0 })),
  }]))

  monthlyTargets.filter((row) => row.firm === firm && row.financialYear === financialYear).forEach((row) => {
    const person = data.get(row.salesPerson)
    if (person?.months[row.fiscalMonth - 1]) person.months[row.fiscalMonth - 1].target = Number(row.amount || 0)
  })

  let unattributedAmount = 0
  let unattributedRows = 0
  function addActual(rows, partyField, sign) {
    rows.forEach((row) => {
      if (row.firm !== firm || !row.date || row.date > today) return
      const personName = companyPeople.get(normalizeParty(row[partyField])) || ''
      const person = data.get(personName)
      const month = fiscalMonths.findIndex(([, calendarMonth]) => Number(row.date.slice(5, 7)) === calendarMonth)
      const range = month >= 0 ? monthRange(financialYear, month + 1) : null
      if (!range || row.date < range.startDate || row.date > range.endDate) return
      const amount = Number(row.amount || 0) * sign
      if (!personName) { unattributedAmount += amount; unattributedRows += 1; return }
      if (person) person.months[month].actual += amount
    })
  }
  addActual(sales, 'debtor', 1)
  addActual(creditNotes, 'party', -1)

  const salesPeople = [...data.values()].map((person) => {
    person.months.forEach((month) => {
      month.variance = month.actual - month.target
      month.achievement = month.target > 0 ? month.actual / month.target * 100 : null
    })
    person.target = person.months.reduce((sum, month) => sum + month.target, 0)
    person.actual = person.months.reduce((sum, month) => sum + month.actual, 0)
    person.variance = person.actual - person.target
    person.achievement = person.target > 0 ? person.actual / person.target * 100 : null
    return person
  })

  let period = null
  if (salesPerson && fiscalMonth) {
    const range = monthRange(financialYear, fiscalMonth)
    const person = data.get(salesPerson)
    const month = person?.months[fiscalMonth - 1] || { target: 0, actual: 0, variance: 0, achievement: null }
    const weeks = weeksForMonth(financialYear, fiscalMonth).map((week) => {
      const saved = weeklyTargets.find((row) => row.firm === firm && row.salesPerson === salesPerson && row.startDate === week.startDate && row.endDate === week.endDate)
      let actual = 0
      const cutoff = today < week.endDate ? today : week.endDate
      const addWeekRows = (rows, field, sign) => rows.forEach((row) => {
        if (row.firm === firm && row.date >= week.startDate && row.date <= cutoff && companyPeople.get(normalizeParty(row[field])) === salesPerson) actual += Number(row.amount || 0) * sign
      })
      if (cutoff >= week.startDate) { addWeekRows(sales, 'debtor', 1); addWeekRows(creditNotes, 'party', -1) }
      const target = Number(saved?.amount || 0)
      const status = today < week.startDate ? 'Upcoming' : today <= week.endDate ? 'In Progress' : 'Completed'
      return { ...week, target, actual, variance: actual - target, achievement: target > 0 ? actual / target * 100 : null, status }
    })
    period = { ...range, ...month, status: today < range.startDate ? 'Upcoming' : today <= range.endDate ? 'In Progress' : 'Completed', weeks }
  }

  return { firm, financialYear, asOfDate: today, salesPeople, period, unattributedRows, unattributedAmount }
}
