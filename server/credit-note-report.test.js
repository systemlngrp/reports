import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCreditNoteReport } from './credit-note-report.js'
import { normalizeVoucher } from './tally.js'

test('splits allocations without inflating parent credit-note total', () => {
  const report = buildCreditNoteReport({
    creditNotes: [{ id: 'cn-1', firm: 'Firm A', date: '2026-04-02', party: ' ACME ', voucherNo: 'CN-1', amount: 1000, narration: 'Rate difference' }],
    allocations: [
      { creditNoteId: 'cn-1', invoiceReference: 'INV-1', allocationType: 'Agst Ref', amount: 400 },
      { creditNoteId: 'cn-1', invoiceReference: 'INV-2', allocationType: 'Agst Ref', amount: 600 },
    ],
    companies: [{ company: 'acme', dealingPerson: 'Ravi', refPerson: 'Bikram' }], filters: {},
  })
  assert.equal(report.rows.length, 2)
  assert.equal(report.rows[0].financialYear, '2026-27')
  assert.equal(report.rows[0].dealingPerson, 'Ravi')
  assert.equal(report.summary.totalAmount, 1000)
  assert.equal(report.summary.customerCount, 1)
})

test('keeps historical records without invoice allocations', () => {
  const report = buildCreditNoteReport({ creditNotes: [{ id: 'old', firm: 'A', date: '2026-03-31', party: 'Old Customer', voucherNo: 'CN-OLD', amount: 50 }], filters: {} })
  assert.equal(report.rows[0].invoiceReference, '')
  assert.equal(report.rows[0].financialYear, '2025-26')
  assert.deepEqual(report.unmatched, ['Old Customer'])
})

test('applies combined credit-note filters and search', () => {
  const data = { creditNotes: [{ id: '1', firm: 'A', date: '2026-05-10', party: 'ACME', voucherNo: 'CN1', amount: 20, narration: 'Being credit' }], companies: [{ company: 'ACME', salesPerson: 'Ravi', refPerson: 'Sam' }] }
  assert.equal(buildCreditNoteReport({ ...data, filters: { firm: 'A', financialYear: '2026-27', month: 'May', dealingPerson: 'Ravi', refPerson: 'Sam', search: 'credit' } }).rows.length, 1)
  assert.equal(buildCreditNoteReport({ ...data, filters: { search: 'missing' } }).rows.length, 0)
})

test('normalizes and merges duplicate Tally bill allocations', () => {
  const row = normalizeVoucher({ DATE: '20260501', VOUCHERNUMBER: 'CN1', PARTYLEDGERNAME: 'ACME', AMOUNT: '-30', 'BILLALLOCATIONS.LIST': [{ NAME: 'INV1', BILLTYPE: 'Agst Ref', AMOUNT: '-10' }, { NAME: 'INV1', BILLTYPE: 'Agst Ref', AMOUNT: '-20' }] }, 'Firm A', 'Credit Note', 0)
  assert.deepEqual(row.allocations, [{ billReference: 'INV1', allocationType: 'Agst Ref', amount: 30 }])
})
