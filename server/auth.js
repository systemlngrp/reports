import crypto from 'node:crypto'
import { promisify } from 'node:util'
import {
  countAdmins,
  createSession,
  createUser,
  deleteSession,
  findUserByEmail,
  findUserById,
  getSessionUser,
  listUsers,
  setUserPassword,
  updateUser,
  updateUserProfile,
} from './store.js'

const scrypt = promisify(crypto.scrypt)
const COOKIE_NAME = 'report_session'
const SESSION_DAYS = 30

export const PAGE_IDS = [
  'dashboard', 'sales-tracker', 'sales-person', 'performance', 'firm-wise',
  'credit-note-view', 'item-wise-sales', 'companies', 'target-master',
  'custom-target', 'sales-man-target', 'weekly-monthly-target', 'intercompany',
  'sales', 'receipts', 'credit-notes', 'firms', 'history',
]

export async function hashPassword(password) {
  validatePassword(password)
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64)
  return `scrypt$${salt}$${Buffer.from(derived).toString('hex')}`
}

export async function verifyPassword(password, encoded) {
  try {
    const [method, salt, expectedHex] = String(encoded || '').split('$')
    if (method !== 'scrypt' || !salt || !expectedHex) return false
    const actual = Buffer.from(await scrypt(String(password), salt, 64))
    const expected = Buffer.from(expectedHex, 'hex')
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export async function initializeAuth() {
  if (await countAdmins()) return
  const email = normalizeEmail(process.env.ADMIN_EMAIL)
  const password = String(process.env.ADMIN_PASSWORD || '')
  if (!email || !password) throw new Error('No administrator exists. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env, then restart.')
  validateEmail(email)
  validatePassword(password)
  await createUser({
    email,
    displayName: String(process.env.ADMIN_NAME || 'Administrator').trim(),
    passwordHash: await hashPassword(password),
    isAdmin: true,
    mustChangePassword: false,
    permissions: PAGE_IDS,
  })
}

export function registerPublicAuthRoutes(app) {
  app.post('/api/auth/login', async (req, res) => {
    try {
      const email = normalizeEmail(req.body?.email)
      const user = email ? await findUserByEmail(email) : null
      if (!user || !user.isActive || !(await verifyPassword(req.body?.password, user.passwordHash))) {
        return res.status(401).json({ message: 'Invalid email or password.' })
      }
      await issueSession(res, user.id)
      res.json(publicUser(await findUserById(user.id)))
    } catch (error) {
      res.status(500).json({ message: error.message })
    }
  })
}

export async function authenticateApi(req, res, next) {
  if (isPublicApi(req.path)) return next()
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME]
  if (!token) return res.status(401).json({ message: 'Please sign in.' })
  try {
    const user = await getSessionUser(tokenHash(token))
    if (!user || !user.isActive) return res.status(401).json({ message: 'Your session is no longer valid.' })
    req.authToken = token
    req.user = user
    if (user.mustChangePassword && !['/auth/me', '/auth/password', '/auth/logout'].includes(req.path)) {
      return res.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password to continue.' })
    }
    next()
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export function authorizeApi(req, res, next) {
  if (isPublicApi(req.path) || req.user?.isAdmin || req.path.startsWith('/auth/')) return next()
  const required = requiredPermissions(req.path, req.method)
  if (!required.length || required.some((page) => req.user.permissions.includes(page))) return next()
  return res.status(403).json({ message: 'You do not have access to this page.' })
}

export function registerProtectedAuthRoutes(app) {
  app.get('/api/auth/me', (req, res) => res.json(publicUser(req.user)))

  app.post('/api/auth/logout', async (req, res) => {
    await deleteSession(tokenHash(req.authToken))
    clearSessionCookie(res)
    res.json({ ok: true })
  })

  app.put('/api/auth/profile', async (req, res) => {
    try {
      const displayName = requireDisplayName(req.body?.displayName)
      res.json(publicUser(await updateUserProfile(req.user.id, displayName)))
    } catch (error) {
      res.status(400).json({ message: error.message })
    }
  })

  app.put('/api/auth/password', async (req, res) => {
    try {
      const current = await findUserById(req.user.id)
      if (!(await verifyPassword(req.body?.currentPassword, current.passwordHash))) {
        return res.status(400).json({ message: 'Current password is incorrect.' })
      }
      validatePassword(req.body?.newPassword)
      await setUserPassword(req.user.id, await hashPassword(req.body.newPassword), false)
      await issueSession(res, req.user.id)
      res.json(publicUser(await findUserById(req.user.id)))
    } catch (error) {
      res.status(400).json({ message: error.message })
    }
  })

  app.get('/api/users', requireAdmin, async (_req, res) => res.json(await listUsers()))

  app.post('/api/users', requireAdmin, async (req, res) => {
    try {
      const input = validateUserInput(req.body, true)
      const user = await createUser({ ...input, passwordHash: await hashPassword(req.body.password), mustChangePassword: true })
      res.status(201).json(publicUser(user))
    } catch (error) {
      sendUserError(res, error)
    }
  })

  app.put('/api/users/:id', requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id)
      const existing = await findUserById(id)
      if (!existing) return res.status(404).json({ message: 'User not found.' })
      const input = validateUserInput(req.body, false)
      if (id === Number(req.user.id) && (!input.isAdmin || !input.isActive)) {
        return res.status(400).json({ message: 'You cannot remove your own administrator access or deactivate your account.' })
      }
      res.json(publicUser(await updateUser(id, input)))
    } catch (error) {
      sendUserError(res, error)
    }
  })

  app.post('/api/users/:id/reset-password', requireAdmin, async (req, res) => {
    try {
      const user = await findUserById(Number(req.params.id))
      if (!user) return res.status(404).json({ message: 'User not found.' })
      validatePassword(req.body?.password)
      await setUserPassword(user.id, await hashPassword(req.body.password), true)
      res.json({ ok: true })
    } catch (error) {
      res.status(400).json({ message: error.message })
    }
  })
}

export function requiredPermissions(path, method = 'GET') {
  if (path.startsWith('/users')) return ['users']
  if (path.startsWith('/firms')) return method === 'GET' ? PAGE_IDS : ['firms']
  if (path.startsWith('/companies')) return method === 'GET' ? PAGE_IDS : ['companies']
  if (path.startsWith('/sales-history')) return ['sales', 'history', 'item-wise-sales']
  if (path.startsWith('/receipts-history')) return ['receipts', 'firm-wise']
  if (path.startsWith('/credit-notes-history')) return ['credit-notes', 'credit-note-view', 'firm-wise']
  if (path.startsWith('/reporting/credit-notes')) return ['credit-notes', 'credit-note-view']
  if (path.startsWith('/reporting/sales-tracker')) return ['sales-tracker', 'sales-person', 'performance']
  if (path.startsWith('/reporting/firm-wise')) return ['firm-wise']
  if (path.startsWith('/reporting/sales-person-targets')) return ['sales-person', 'sales-man-target']
  if (path.startsWith('/reporting/weekly-sales-targets')) return ['sales-tracker', 'weekly-monthly-target']
  if (path.startsWith('/reporting/targets')) return ['sales-tracker', 'performance', 'target-master', 'custom-target']
  if (path.startsWith('/reporting/target-performance')) return ['performance', 'sales-person']
  if (path.startsWith('/reporting/exclusions') || path.startsWith('/reporting/ledgers')) return ['companies', 'intercompany']
  if (path.startsWith('/tally/outstanding')) return ['sales-tracker']
  if (path.startsWith('/tally/sales')) return ['sales', 'history', 'item-wise-sales']
  if (path.startsWith('/tally/receipts')) return ['receipts']
  if (path.startsWith('/tally/credit-notes')) return ['credit-notes', 'credit-note-view']
  return []
}

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ message: 'Administrator access is required.' })
  next()
}

function publicUser(user) {
  const { passwordHash: _passwordHash, ...safe } = user
  return safe
}

function validateUserInput(body, creating) {
  const email = normalizeEmail(body?.email)
  validateEmail(email)
  if (creating) validatePassword(body?.password)
  return {
    email,
    displayName: requireDisplayName(body?.displayName),
    isAdmin: Boolean(body?.isAdmin),
    isActive: body?.isActive !== false,
    permissions: [...new Set(Array.isArray(body?.permissions) ? body.permissions : [])].filter((page) => PAGE_IDS.includes(page)),
  }
}

function normalizeEmail(value) { return String(value || '').trim().toLowerCase() }
function validateEmail(email) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.') }
function validatePassword(value) { if (String(value || '').length < 10) throw new Error('Password must contain at least 10 characters.') }
function requireDisplayName(value) { const name = String(value || '').trim(); if (!name) throw new Error('Display name is required.'); return name }
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex') }
function parseCookies(header = '') { return Object.fromEntries(header.split(';').map((item) => item.trim().split('=').map(decodeURIComponent)).filter(([key]) => key)) }
function isPublicApi(path) { return path === '/health' || path === '/auth/login' || path === '/sync/companies' || path === '/npd-sync' }

async function issueSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000)
  await createSession(userId, tokenHash(token), expiresAt)
  const secure = String(process.env.COOKIE_SECURE ?? (process.env.NODE_ENV === 'production')).toLowerCase() === 'true'
  res.cookie(COOKIE_NAME, token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400000 })
}

function clearSessionCookie(res) {
  const secure = String(process.env.COOKIE_SECURE ?? (process.env.NODE_ENV === 'production')).toLowerCase() === 'true'
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure, sameSite: 'lax', path: '/' })
}

function sendUserError(res, error) {
  if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That email address is already in use.' })
  res.status(400).json({ message: error.message })
}
