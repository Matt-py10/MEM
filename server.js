/**
 * Servidor Local Autónomo - Portal de Laboratorios MEM & Mecatrónica IUB
 * Institución Universitaria de Barranquilla (Unibarranquilla)
 * Seguridad reforzada:
 *  - Vista pública blog sin login (solo lectura)
 *  - Consola /admin con sesiones HttpOnly + Token CSRF por sesión + scrypt
 *  - Validación de origen, rate-limit anti fuerza bruta, magic-bytes en uploads y log de auditoría
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'iub_portal_data.json');
const AUTH_FILE = path.join(ROOT_DIR, 'data', 'admin_auth.json');
const AUDIT_FILE = path.join(ROOT_DIR, 'data', 'admin_audit.json');
const PDF_DIR = path.join(PUBLIC_DIR, 'resources', 'pdfs');
const ZIP_DIR = path.join(PUBLIC_DIR, 'resources', 'fluidsim');

const SESSION_COOKIE_NAME = 'iub_admin_session';
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 horas
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 3 * 60 * 1000;
const MAX_AUDIT_ENTRIES = 60;

const sessions = new Map();
const loginAttempts = new Map();
let fallbackAuthRecord = null;
let memoryAuditLog = [];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.ct': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8'
};

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash: derived };
}

function verifyPassword(password, authRecord) {
  if (!authRecord || !authRecord.salt || !authRecord.hash) return false;
  const derived = crypto.scryptSync(String(password), authRecord.salt, 64);
  const stored = Buffer.from(authRecord.hash, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

function timingSafeTextEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (!bufA.length || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function buildDefaultAuthRecord() {
  const initialUser = process.env.ADMIN_USER || 'admin';
  const initialPass = process.env.ADMIN_PASS || 'iub2026';
  const { salt, hash } = hashPassword(initialPass);
  return {
    username: initialUser,
    salt,
    hash,
    mustChangePassword: !process.env.ADMIN_PASS,
    updatedAt: new Date().toISOString()
  };
}

function ensureAdminAuthFile() {
  if (fs.existsSync(AUTH_FILE)) return;
  if (!fallbackAuthRecord) {
    fallbackAuthRecord = buildDefaultAuthRecord();
  }
  try {
    const dataDir = path.dirname(AUTH_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(AUTH_FILE, JSON.stringify(fallbackAuthRecord, null, 2), 'utf8');
  } catch (err) {
    console.warn('Aviso auth en memoria (escritura restringida):', err.message);
  }
}

function readAdminAuth() {
  ensureAdminAuthFile();
  if (fs.existsSync(AUTH_FILE)) {
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  }
  return fallbackAuthRecord || (fallbackAuthRecord = buildDefaultAuthRecord());
}

function saveAdminAuth(record) {
  fallbackAuthRecord = record;
  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(record, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.warn('No se pudo persistir admin_auth.json en disco:', err.message);
    return false;
  }
}

function getClientIp(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwarded || req?.socket?.remoteAddress || 'local';
}

function isHttpsRequest(req) {
  if (req?.socket?.encrypted) return true;
  const proto = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return proto === 'https';
}

function buildSessionCookie(token, maxAgeSec, req) {
  const value = token ? encodeURIComponent(token) : '';
  const secureAttr = isHttpsRequest(req) ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}${secureAttr}`;
}

function recordAudit(event, detail, req, username = 'sistema') {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    username,
    detail,
    ip: getClientIp(req)
  };
  try {
    let list = memoryAuditLog;
    if (fs.existsSync(AUDIT_FILE)) {
      list = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
      if (!Array.isArray(list)) list = [];
    }
    list.unshift(entry);
    list = list.slice(0, MAX_AUDIT_ENTRIES);
    memoryAuditLog = list;
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (_) {
    memoryAuditLog.unshift(entry);
    memoryAuditLog = memoryAuditLog.slice(0, MAX_AUDIT_ENTRIES);
  }
}

function readAuditLogs() {
  try {
    if (fs.existsSync(AUDIT_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return memoryAuditLog;
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

function createAdminSession(username, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  sessions.set(token, {
    username,
    csrfToken,
    ip: getClientIp(req),
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  });
  return { token, csrfToken };
}

function getValidSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  const sess = sessions.get(token);
  if (!sess) return null;
  if (Date.now() > sess.expiresAt) {
    sessions.delete(token);
    return null;
  }
  sess.expiresAt = Date.now() + SESSION_TTL_MS;
  return { token, ...sess };
}

const responseRequestMap = new WeakMap();

const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://i.ytimg.com https://img.youtube.com",
  "font-src 'self' data:",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'"
].join('; ');

function buildSecurityHeaders(extraHeaders = {}, isAdminRoute = false, req = null) {
  const base = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': isAdminRoute ? 'same-origin' : 'strict-origin-when-cross-origin',
    'Content-Security-Policy': CSP_HEADER,
    'Cache-Control': isAdminRoute ? 'no-store, no-cache, must-revalidate' : 'no-cache'
  };
  if (req && isHttpsRequest(req)) {
    base['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }
  if (isAdminRoute) {
    base['X-Robots-Tag'] = 'noindex, nofollow';
  }
  return { ...base, ...extraHeaders };
}

function sendJson(res, statusCode, payload, extraHeaders = {}, isAdminRoute = false) {
  const body = JSON.stringify(payload);
  const req = responseRequestMap.get(res) || null;
  res.writeHead(
    statusCode,
    buildSecurityHeaders(
      {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...extraHeaders
      },
      isAdminRoute,
      req
    )
  );
  res.end(body);
}

function verifySameOrigin(req) {
  const allowedHosts = new Set(
    [req.headers.host, req.headers['x-forwarded-host']]
      .filter(Boolean)
      .flatMap((h) => String(h).split(','))
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  );
  if (allowedHosts.size === 0) return true;
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (origin) {
    try {
      return allowedHosts.has(new URL(origin).host.toLowerCase());
    } catch (_) {
      return false;
    }
  }
  if (referer) {
    try {
      return allowedHosts.has(new URL(referer).host.toLowerCase());
    } catch (_) {
      return false;
    }
  }
  return true;
}

function requireAdmin(req, res, requireCsrf = false) {
  const sess = getValidSession(req);
  if (!sess) {
    sendJson(res, 401, { ok: false, error: 'Autenticación de administrador requerida' }, {}, true);
    return null;
  }
  if (requireCsrf) {
    if (!verifySameOrigin(req)) {
      sendJson(res, 403, { ok: false, error: 'Origen de petición no autorizado' }, {}, true);
      return null;
    }
    const headerToken = req.headers['x-csrf-token'];
    if (!timingSafeTextEqual(headerToken, sess.csrfToken)) {
      sendJson(res, 403, { ok: false, error: 'Token CSRF inválido o faltante. Recarga la consola.' }, {}, true);
      return null;
    }
  }
  return sess;
}

function validateUploadedFileMagic(ext, buffer) {
  if (!buffer || buffer.length === 0) return 'El archivo está vacío';
  if (ext === '.pdf') {
    const header = buffer.subarray(0, 5).toString('ascii');
    if (header !== '%PDF-') {
      return 'El archivo .pdf no tiene una firma PDF válida (%PDF-)';
    }
    return null;
  }
  if (ext === '.zip') {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return 'El archivo .zip no tiene una cabecera ZIP válida (PK)';
    }
    return null;
  }
  if (ext === '.ct') {
    const sample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8').toLowerCase();
    if (sample.includes('<script') || sample.includes('<!doctype html') || sample.includes('<html')) {
      return 'El archivo .ct contiene etiquetas HTML/script no permitidas';
    }
    return null;
  }
  return 'Solo se permiten archivos .pdf, .zip o .ct de FluidSIM';
}

function readRequestBody(req, maxBytes = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Archivo o carga útil excede el límite de 50MB'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Asegurar que credenciales y recursos iniciales existan
ensureAdminAuthFile();
if (!fs.existsSync(DATA_FILE)) {
  try {
    execFileSync(process.execPath, [path.join(ROOT_DIR, 'scripts', 'generate-resources.js')], {
      stdio: 'inherit'
    });
  } catch (err) {
    console.warn('Aviso al inicializar recursos:', err.message);
  }
}

const server = http.createServer(async (req, res) => {
  responseRequestMap.set(res, req);
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    if (pathname === '/healthz' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, status: 'up', timestamp: new Date().toISOString() });
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, buildSecurityHeaders({
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token'
      }, false, req));
      return res.end();
    }

    // ----------------------------------------------------------------------
    // 0. API DE AUTENTICACIÓN, AUDITORÍA Y SEGURIDAD EXCLUSIVA DEL ADMIN
    // ----------------------------------------------------------------------
    if (pathname === '/api/admin/session' && req.method === 'GET') {
      const sess = getValidSession(req);
      const auth = sess ? readAdminAuth() : null;
      return sendJson(
        res,
        200,
        {
          ok: true,
          authenticated: Boolean(sess),
          username: sess ? sess.username : null,
          csrfToken: sess ? sess.csrfToken : null,
          mustChangePassword: Boolean(auth?.mustChangePassword)
        },
        {},
        true
      );
    }

    if (pathname === '/api/admin/login' && req.method === 'POST') {
      if (!verifySameOrigin(req)) {
        return sendJson(res, 403, { ok: false, error: 'Origen no autorizado' }, {}, true);
      }

      const clientKey = getClientIp(req);
      const attempt = loginAttempts.get(clientKey);
      if (attempt && attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
        const secs = Math.ceil((attempt.lockedUntil - Date.now()) / 1000);
        return sendJson(
          res,
          429,
          { ok: false, error: `Demasiados intentos fallidos. Espera ${secs}s para volver a intentar.` },
          {},
          true
        );
      }

      const bodyStr = await readRequestBody(req, 64 * 1024);
      const { username, password } = JSON.parse(bodyStr || '{}');
      const auth = readAdminAuth();

      const validUser = timingSafeTextEqual(String(username || '').trim(), auth.username);
      const validPass = verifyPassword(password || '', auth);

      if (!validUser || !validPass) {
        const nextCount = (attempt?.count || 0) + 1;
        const locked = nextCount >= MAX_LOGIN_ATTEMPTS;
        loginAttempts.set(clientKey, {
          count: nextCount,
          lockedUntil: locked ? Date.now() + LOCK_WINDOW_MS : 0
        });
        recordAudit(
          locked ? 'LOGIN_LOCKED' : 'LOGIN_FAIL',
          `Intento fallido para usuario "${String(username || '').slice(0, 32)}" (${nextCount}/${MAX_LOGIN_ATTEMPTS})`,
          req,
          String(username || 'desconocido').slice(0, 32)
        );
        return sendJson(res, 401, { ok: false, error: 'Usuario o contraseña incorrectos' }, {}, true);
      }

      loginAttempts.delete(clientKey);
      const { token, csrfToken } = createAdminSession(auth.username, req);
      recordAudit('LOGIN_OK', 'Inicio de sesión exitoso en Consola Admin', req, auth.username);

      const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
      return sendJson(
        res,
        200,
        {
          ok: true,
          username: auth.username,
          csrfToken,
          mustChangePassword: Boolean(auth.mustChangePassword)
        },
        {
          'Set-Cookie': buildSessionCookie(token, maxAgeSec, req)
        },
        true
      );
    }

    if (pathname === '/api/admin/logout' && req.method === 'POST') {
      const sess = getValidSession(req);
      if (sess) {
        sessions.delete(sess.token);
        recordAudit('LOGOUT', 'Sesión cerrada manualmente', req, sess.username);
      }
      return sendJson(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': buildSessionCookie('', 0, req) },
        true
      );
    }

    if (pathname === '/api/admin/logout-all' && req.method === 'POST') {
      const sess = requireAdmin(req, res, true);
      if (!sess) return;

      const revokedCount = Math.max(0, sessions.size - 1);
      for (const key of sessions.keys()) {
        if (key !== sess.token) sessions.delete(key);
      }
      // Rotar también el token actual
      sessions.delete(sess.token);
      const { token, csrfToken } = createAdminSession(sess.username, req);
      recordAudit('SESSIONS_REVOKED', `Sesión rotada y ${revokedCount} sesión(es) remota(s) revocada(s)`, req, sess.username);

      const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
      return sendJson(
        res,
        200,
        { ok: true, csrfToken, revokedCount },
        {
          'Set-Cookie': buildSessionCookie(token, maxAgeSec, req)
        },
        true
      );
    }

    if (pathname === '/api/admin/change-credentials' && req.method === 'POST') {
      const sess = requireAdmin(req, res, true);
      if (!sess) return;

      const bodyStr = await readRequestBody(req, 64 * 1024);
      const { currentPassword, newUsername, newPassword } = JSON.parse(bodyStr || '{}');
      const auth = readAdminAuth();

      if (!verifyPassword(currentPassword || '', auth)) {
        return sendJson(res, 403, { ok: false, error: 'La contraseña actual no coincide' }, {}, true);
      }

      const cleanUser = String(newUsername || auth.username).trim();
      if (cleanUser.length < 3) {
        return sendJson(res, 400, { ok: false, error: 'El usuario debe tener al menos 3 caracteres' }, {}, true);
      }

      const passToSave = newPassword ? String(newPassword) : null;
      if (passToSave && passToSave.length < 8) {
        return sendJson(res, 400, { ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres' }, {}, true);
      }

      const nextSecret = passToSave ? hashPassword(passToSave) : { salt: auth.salt, hash: auth.hash };
      const updatedAuth = {
        username: cleanUser,
        salt: nextSecret.salt,
        hash: nextSecret.hash,
        mustChangePassword: passToSave ? false : Boolean(auth.mustChangePassword),
        updatedAt: new Date().toISOString()
      };
      saveAdminAuth(updatedAuth);

      // Rotar sesión e invalidar otras sesiones activas por seguridad
      sessions.clear();
      const { token, csrfToken } = createAdminSession(cleanUser, req);
      recordAudit('CREDS_UPDATED', `Credenciales actualizadas para "${cleanUser}"`, req, cleanUser);

      const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
      return sendJson(
        res,
        200,
        {
          ok: true,
          username: cleanUser,
          csrfToken,
          mustChangePassword: Boolean(updatedAuth.mustChangePassword),
          message: 'Credenciales actualizadas y sesión renovada con éxito'
        },
        {
          'Set-Cookie': buildSessionCookie(token, maxAgeSec, req)
        },
        true
      );
    }

    if (pathname === '/api/admin/overview' && req.method === 'GET') {
      const sess = requireAdmin(req, res, false);
      if (!sess) return;

      const pdfFiles = fs.existsSync(PDF_DIR) ? fs.readdirSync(PDF_DIR).sort() : [];
      const zipFiles = fs.existsSync(ZIP_DIR) ? fs.readdirSync(ZIP_DIR).sort() : [];
      const stat = fs.existsSync(DATA_FILE) ? fs.statSync(DATA_FILE) : null;

      return sendJson(
        res,
        200,
        {
          ok: true,
          username: sess.username,
          pdfFilesCount: pdfFiles.length,
          zipFilesCount: zipFiles.length,
          activeSessionsCount: sessions.size,
          dataBytes: stat ? stat.size : 0,
          dataUpdatedAt: stat ? stat.mtime.toISOString() : null
        },
        {},
        true
      );
    }

    if (pathname === '/api/admin/files' && req.method === 'GET') {
      const sess = requireAdmin(req, res, false);
      if (!sess) return;

      const pdfs = fs.existsSync(PDF_DIR)
        ? fs.readdirSync(PDF_DIR).sort().map((f) => `/resources/pdfs/${f}`)
        : [];
      const zips = fs.existsSync(ZIP_DIR)
        ? fs.readdirSync(ZIP_DIR).sort().map((f) => `/resources/fluidsim/${f}`)
        : [];

      return sendJson(res, 200, { ok: true, pdfs, zips }, {}, true);
    }

    if (pathname === '/api/admin/audit' && req.method === 'GET') {
      const sess = requireAdmin(req, res, false);
      if (!sess) return;

      return sendJson(
        res,
        200,
        {
          ok: true,
          activeSessionsCount: sessions.size,
          logs: readAuditLogs().slice(0, 25)
        },
        {},
        true
      );
    }

    // ----------------------------------------------------------------------
    // 1. API: Obtener toda la data del portal IUB (lectura pública blog)
    // ----------------------------------------------------------------------
    if (pathname === '/api/data' && req.method === 'GET') {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return sendJson(res, 200, JSON.parse(raw));
    }

    // ----------------------------------------------------------------------
    // 2. API PROTEGIDA (Sesión + CSRF): Guardar cambios del Panel Admin
    // ----------------------------------------------------------------------
    if (pathname === '/api/data' && req.method === 'PUT') {
      const sess = requireAdmin(req, res, true);
      if (!sess) return;

      const bodyStr = await readRequestBody(req);
      const updatedData = JSON.parse(bodyStr);
      if (!updatedData || !updatedData.institution || !Array.isArray(updatedData.practices)) {
        return sendJson(res, 400, { ok: false, error: 'Estructura de datos inválida' }, {}, true);
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(updatedData, null, 2), 'utf8');
      recordAudit(
        'DATA_SAVED',
        `Actualizado iub_portal_data.json (${updatedData.practices.length} circuitos, ${(updatedData.youtubeVideos || []).length} videos)`,
        req,
        sess.username
      );
      return sendJson(
        res,
        200,
        {
          ok: true,
          message: 'Datos guardados directamente en data/iub_portal_data.json',
          timestamp: new Date().toISOString()
        },
        {},
        true
      );
    }

    // ----------------------------------------------------------------------
    // 3. API PROTEGIDA (Sesión + CSRF + Magic Bytes): Subir PDF o ZIP
    // ----------------------------------------------------------------------
    if (pathname === '/api/upload' && req.method === 'POST') {
      const sess = requireAdmin(req, res, true);
      if (!sess) return;

      const bodyStr = await readRequestBody(req);
      const { filename, categoryType, base64Data } = JSON.parse(bodyStr);
      if (!filename || !base64Data) {
        return sendJson(res, 400, { ok: false, error: 'Faltan filename o base64Data' }, {}, true);
      }

      const cleanName = path.basename(filename).replace(/[^a-zA-Z0-9._+-]/g, '_');
      const ext = path.extname(cleanName).toLowerCase();
      const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const fileBuffer = Buffer.from(cleanBase64, 'base64');

      const magicErr = validateUploadedFileMagic(ext, fileBuffer);
      if (magicErr) {
        recordAudit('UPLOAD_REJECTED', `Archivo rechazado (${cleanName}): ${magicErr}`, req, sess.username);
        return sendJson(res, 400, { ok: false, error: magicErr }, {}, true);
      }

      const isZip = ext === '.zip' || ext === '.ct' || categoryType === 'zip';
      const targetDir = isZip ? ZIP_DIR : PDF_DIR;
      const publicSubdir = isZip ? '/resources/fluidsim/' : '/resources/pdfs/';

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const fullPath = path.join(targetDir, cleanName);
      fs.writeFileSync(fullPath, fileBuffer);
      recordAudit('FILE_UPLOADED', `Archivo subido: ${cleanName} (${fileBuffer.length} bytes)`, req, sess.username);

      return sendJson(
        res,
        200,
        {
          ok: true,
          filename: cleanName,
          size: fileBuffer.length,
          path: publicSubdir + cleanName
        },
        {},
        true
      );
    }

    // ----------------------------------------------------------------------
    // 4. API PROTEGIDA (Sesión + CSRF): Regenerar datos de fábrica
    // ----------------------------------------------------------------------
    if (pathname === '/api/reset' && req.method === 'POST') {
      const sess = requireAdmin(req, res, true);
      if (!sess) return;

      execFileSync(process.execPath, [path.join(ROOT_DIR, 'scripts', 'generate-resources.js')], {
        stdio: 'inherit'
      });
      const fresh = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      recordAudit('FACTORY_RESET', 'Restauración completa desde script inicial', req, sess.username);
      return sendJson(res, 200, { ok: true, data: fresh }, {}, true);
    }

    // ----------------------------------------------------------------------
    // 5. Servir consola /admin y archivos estáticos desde public/
    // ----------------------------------------------------------------------
    let relativePath = 'index.html';
    const isAdminStatic = pathname === '/admin' || pathname === '/admin/';
    if (isAdminStatic) {
      relativePath = 'admin.html';
    } else if (pathname !== '/') {
      relativePath = pathname.replace(/^\/+/, '');
    }

    const safePath = path.normalize(path.join(PUBLIC_DIR, relativePath));
    if (!safePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, buildSecurityHeaders({}, false, req));
      return res.end('Acceso denegado');
    }

    if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const isPrivateStatic = isAdminStatic || relativePath === 'css/admin.css' || relativePath === 'js/admin.js';
      const cacheControl = isAdminStatic
        ? 'no-store, no-cache, must-revalidate'
        : isPrivateStatic || ext === '.html'
          ? 'no-cache'
          : 'public, max-age=3600';
      const headers = buildSecurityHeaders(
        { 'Content-Type': contentType, 'Cache-Control': cacheControl },
        isAdminStatic,
        req
      );

      if (parsedUrl.searchParams.get('download') === '1' || ext === '.zip') {
        headers['Content-Disposition'] = `attachment; filename="${path.basename(safePath)}"`;
      }

      res.writeHead(200, headers);
      fs.createReadStream(safePath).pipe(res);
      return;
    }

    res.writeHead(404, buildSecurityHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }, false, req));
    res.end('Recurso no encontrado en el portal IUB');
  } catch (err) {
    console.error('Error en servidor:', err);
    sendJson(res, 500, { ok: false, error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log('========================================================================');
  console.log('  PORTAL DE LABORATORIOS MEM & MECATRÓNICA - UNIBARRANQUILLA (IUB)');
  console.log(`  Blog Público : http://localhost:${PORT}/`);
  console.log(`  Panel Admin  : http://localhost:${PORT}/admin`);
  console.log(`  Escuchando en: ${HOST}:${PORT}`);
  console.log('  Seguridad    : HttpOnly + CSRF + scrypt + MagicBytes + Auditoría');
  console.log('========================================================================');
});
