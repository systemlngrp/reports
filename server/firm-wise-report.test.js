import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFirmWiseReport } from './firm-wise-report.js'
import { parseOutstandingXml } from './tally.js'

test('builds firm-wise sales, collection and ageing measures', () => {
  const report = buildFirmWiseReport({
    firm: 'Firm A', asOfDate: '2026-09-05', companies: [{ company: 'ACME', dealingPerson: 'Ravi', refPerson: 'Bikram' }],
    targets: [{ customerName: 'ACME', customerKey: 'acme', fiscalMonth: 6, amount: 1000 }],
    sales: [{ firm: 'Firm A', debtor: 'ACME', date: '2026-08-10', amount: 400 }, { firm: 'Firm A', debtor: 'ACME', date: '2026-09-02', amount: 800 }],
    creditNotes: [{ firm: 'Firm A', party: ' acme ', date: '2026-09-03', amount: 100 }],
    receipts: [{ firm: 'Firm A', party: 'ACME', date: '2026-09-04', amount: 300, onAccountAmount: 50 }],
    outstanding: [
      { firm: 'Firm A', partyName: 'ACME', dueDate: '2026-09-01', outstandingAmount: 200 },
      { firm: 'Firm A', partyName: 'ACME', dueDate: '2026-09-10', outstandingAmount: 500 },
      { firm: 'Firm A', partyName: 'ACME', dueDate: '2026-10-01', outstandingAmount: 300 },
    ],
  })
  const row = report.rows[0]
  assert.equal(row.fySales, 1100)
  assert.equal(row.previousMonthSales, 400)
  assert.equal(row.selectedMonthSales, 700)
  assert.equal(row.collections, 300)
  assert.equal(row.achievement, 70)
  assert.equal(row.totalDues, 1000)
  assert.equal(row.overdue, 200)
  assert.equal(row.notDue, 800)
  assert.equal(row.upcoming, 500)
  assert.equal(row.onAccountReceipts, 50)
})

test('keeps unmatched ledgers visible and supports people filters', () => {
  const report = buildFirmWiseReport({ firm: 'Firm A', asOfDate: '2026-04-30', dealingPerson: 'Ravi', companies: [{ company: 'Known', dealingPerson: 'Ravi' }], sales: [{ firm: 'Firm A', debtor: 'Unknown', date: '2026-04-01', amount: 10 }] })
  assert.deepEqual(report.unmatched, ['Unknown'])
  assert.equal(report.rows.length, 0)
})

test('parses bill-wise outstanding XML', () => {
  const rows = parseOutstandingXml('<ENVELOPE><BILL><NAME>INV-1</NAME><PARENT>ACME</PARENT><BILLDATE>20260801</BILLDATE><DUEDATE>20260910</DUEDATE><OPENINGBALANCE>1000</OPENINGBALANCE><CLOSINGBALANCE>250</CLOSINGBALANCE></BILL></ENVELOPE>')
  assert.deepEqual(rows[0], { partyKey: 'acme', partyName: 'ACME', billReference: 'INV-1', billDate: '2026-08-01', dueDate: '2026-09-10', originalAmount: 1000, outstandingAmount: 250, billStatus: 'Outstanding' })
})
