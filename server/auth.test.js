import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, requiredPermissions, verifyPassword } from './auth.js'

test('scrypt hashes use unique salts and verify safely', async () => {
  const first = await hashPassword('a-secure-password')
  const second = await hashPassword('a-secure-password')
  assert.notEqual(first, second)
  assert.equal(await verifyPassword('a-secure-password', first), true)
  assert.equal(await verifyPassword('wrong-password', first), false)
})

test('passwords require at least ten characters', async () => {
  await assert.rejects(() => hashPassword('short'), /at least 10/)
})

test('API permission mappings cover protected report areas', () => {
  assert.deepEqual(requiredPermissions('/reporting/credit-notes'), ['credit-notes', 'credit-note-view'])
  assert.ok(requiredPermissions('/sales-history').includes('sales'))
  assert.ok(requiredPermissions('/receipts-history').includes('receipts'))
  assert.ok(requiredPermissions('/firms', 'POST').includes('firms'))
})
