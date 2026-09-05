import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSalesReport, financialYearForDate, fiscalMonthIndex, normalizeParty, periodTargetAmount } from './sales-report.js'

test('uses Indian financial years and April-first fiscal months', () => {
  assert.equal(financialYearForDate('2026-04-01'), '2026-27')
  assert.equal(financialYearForDate('2027-03-31'), '2026-27')
  assert.equal(fiscalMonthIndex('2026-04-01'), 1)
  assert.equal(fiscalMonthIndex('2027-03-31'), 12)
})

test('normalizes case and whitespace in party names', () => {
  assert.equal(normalizeParty('  ACME   Industries '), normalizeParty('acme industries'))
})

test('prorates the current month including leap-year February', () => {
  const values = Array(12).fill(100)
  assert.equal(periodTargetAmount(values, '2023-24', '2024-02-14'), 1048.2758620689656)
})

test('reconciles exclusions, credits, targets and customer aggregation', () => {
  const report = buildSalesReport({
    financialYear: '2026-27',
    asOfDate: '2026-04-15',
    sales: [
      { firm: 'Firm A', debtor: ' ACME ', date: '2026-04-02', amount: 1000 },
      { firm: 'Firm B', debtor: 'acme', date: '2026-04-03', amount: 500 },
      { firm: 'Firm A', debtor: 'Group Co', date: '2026-04-04', amount: 300 },
    ],
    creditNotes: [{ firm: 'Firm A', party: 'Acme', date: '2026-04-08', amount: 200 }],
    exclusions: [{ firm: 'Firm A', partyName: 'group co' }],
    targets: [{ customerName: 'ACME', financialYear: '2026-27', fiscalMonth: 1, amount: 620 }],
  })
  assert.equal(report.kpis.grossSales, 1800)
  assert.equal(report.kpis.creditNotes, 200)
  assert.equal(report.kpis.intercompanyExclusions, 300)
  assert.equal(report.kpis.netSales, 1300)
  assert.equal(report.kpis.periodTarget, 310)
  assert.equal(report.customers.length, 1)
  assert.equal(report.customers[0].netSales, 1300)
})

test('keeps zero-target and negative-net customers without division errors', () => {
  const report = buildSalesReport({
    financialYear: '2026-27', asOfDate: '2026-04-30', sales: [], targets: [], exclusions: [],
    creditNotes: [{ firm: 'Firm A', party: 'Returns Only', date: '2026-04-08', amount: 250 }],
  })
  assert.equal(report.kpis.netSales, -250)
  assert.equal(report.customers[0].achievementPercent, null)
  assert.equal(report.customers[0].shortfallExcess, -250)
})
