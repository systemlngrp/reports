import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTargetPerformance, monthRange, weeksForMonth } from './target-performance.js'

test('creates Monday-Sunday weeks clipped to month boundaries', () => {
  assert.deepEqual(weeksForMonth('2026-27', 1), [
    { index: 1, startDate: '2026-04-01', endDate: '2026-04-05' },
    { index: 2, startDate: '2026-04-06', endDate: '2026-04-12' },
    { index: 3, startDate: '2026-04-13', endDate: '2026-04-19' },
    { index: 4, startDate: '2026-04-20', endDate: '2026-04-26' },
    { index: 5, startDate: '2026-04-27', endDate: '2026-04-30' },
  ])
  assert.equal(monthRange('2023-24', 11).endDate, '2024-02-29')
})

test('attributes net sales by company sales person and firm', () => {
  const report = buildTargetPerformance({
    firm: 'Firm A', financialYear: '2026-27', salesPerson: 'Ravi', fiscalMonth: 1, asOfDate: '2026-04-15',
    companies: [{ company: 'ACME', salesPerson: 'Ravi' }],
    sales: [{ firm: 'Firm A', debtor: ' acme ', date: '2026-04-06', amount: 1000 }, { firm: 'Firm B', debtor: 'ACME', date: '2026-04-06', amount: 900 }],
    creditNotes: [{ firm: 'Firm A', party: 'ACME', date: '2026-04-07', amount: 200 }],
    monthlyTargets: [{ firm: 'Firm A', salesPerson: 'Ravi', financialYear: '2026-27', fiscalMonth: 1, amount: 600 }],
    weeklyTargets: [{ firm: 'Firm A', salesPerson: 'Ravi', startDate: '2026-04-06', endDate: '2026-04-12', amount: 500 }],
  })
  assert.equal(report.salesPeople[0].actual, 800)
  assert.equal(report.period.actual, 800)
  assert.equal(report.period.weeks[1].actual, 800)
  assert.equal(report.period.weeks[1].variance, 300)
  assert.equal(report.period.weeks[2].status, 'In Progress')
})

test('reports unattributed voucher rows without assigning them', () => {
  const report = buildTargetPerformance({ firm: 'Firm A', financialYear: '2026-27', asOfDate: '2026-04-30', sales: [{ firm: 'Firm A', debtor: 'Unknown', date: '2026-04-01', amount: 250 }] })
  assert.equal(report.unattributedRows, 1)
  assert.equal(report.unattributedAmount, 250)
})
