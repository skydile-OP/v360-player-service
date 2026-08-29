const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD = 'test_admin_password';
process.env.ADMIN_USERNAME = 'admin';
process.env.V360_INTERNAL_API_KEY = 'test_internal_key_99';
process.env.MEDIA_DIR = path.join(__dirname, 'fixtures_media');

// Ensure test media directory exists with sample SKU
const testMediaDir = process.env.MEDIA_DIR;
if (!fs.existsSync(testMediaDir)) {
  fs.mkdirSync(testMediaDir, { recursive: true });
}
const sampleSkuDir = path.join(testMediaDir, 'TEST_SKU_1');
if (!fs.existsSync(sampleSkuDir)) {
  fs.mkdirSync(sampleSkuDir, { recursive: true });
  fs.writeFileSync(path.join(sampleSkuDir, 'still.jpg'), 'fake image data');
  fs.writeFileSync(path.join(sampleSkuDir, '0.json'), '[{"image":"still.jpg"}]');
}

let server;
let baseUrl;

test.before(async () => {
  const app = require('../server.js');
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    if (fs.existsSync(testMediaDir)) {
      fs.rmSync(testMediaDir, { recursive: true, force: true });
    }
  } catch (e) {}
});

function httpRequest(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const reqOpts = {
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(url, reqOpts, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          json
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

test('Auth - Literal cookie v360_session=active is REJECTED with 401', async () => {
  const res = await httpRequest('/api/debug', {
    headers: { 'Cookie': 'v360_session=active' }
  });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.json.error, 'Authentication required.');
});

test('Auth - Anonymous access to admin endpoints is REJECTED with 401', async () => {
  const res = await httpRequest('/api/debug');
  assert.strictEqual(res.status, 401);
});

test('Auth - Login with invalid password returns 401', async () => {
  const res = await httpRequest('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong_password' })
  });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.json.error, 'Invalid password');
});

test('Auth - Login with valid password succeeds and sets HttpOnly v360_sid cookie', async () => {
  const res = await httpRequest('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test_admin_password' })
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.success, true);

  const setCookie = res.headers['set-cookie'] || [];
  const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
  assert.ok(cookieStr.includes('v360_sid='), 'Should set v360_sid cookie');
  assert.ok(cookieStr.includes('HttpOnly'), 'Cookie must be HttpOnly');
});

test('Auth - Valid session token allows access to /api/debug and /api/session', async () => {
  // 1. Login
  const loginRes = await httpRequest('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test_admin_password' })
  });
  const setCookie = loginRes.headers['set-cookie'][0];
  const sidMatch = setCookie.match(/v360_sid=([^;]+)/);
  const sid = sidMatch[1];

  // 2. Check session endpoint
  const sessionRes = await httpRequest('/api/session', {
    headers: { 'Cookie': `v360_sid=${sid}` }
  });
  assert.strictEqual(sessionRes.status, 200);
  assert.strictEqual(sessionRes.json.authenticated, true);

  // 3. Access debug endpoint
  const debugRes = await httpRequest('/api/debug', {
    headers: { 'Cookie': `v360_sid=${sid}` }
  });
  assert.strictEqual(debugRes.status, 200);
  assert.ok(Array.isArray(debugRes.json.items));
});

test('Auth - Logout revokes session server-side', async () => {
  // 1. Login
  const loginRes = await httpRequest('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test_admin_password' })
  });
  const sid = loginRes.headers['set-cookie'][0].match(/v360_sid=([^;]+)/)[1];

  // 2. Logout
  const logoutRes = await httpRequest('/api/logout', {
    method: 'POST',
    headers: { 'Cookie': `v360_sid=${sid}` }
  });
  assert.strictEqual(logoutRes.status, 200);

  // 3. Verify session is revoked
  const debugRes = await httpRequest('/api/debug', {
    headers: { 'Cookie': `v360_sid=${sid}` }
  });
  assert.strictEqual(debugRes.status, 401);
});

test('Auth - Internal API Key allows API operations but rejects /api/debug', async () => {
  const validKey = 'test_internal_key_99';

  // 1. Internal key calling /api/debug -> REJECTED with 403
  const debugRes = await httpRequest('/api/debug', {
    headers: { 'X-V360-Internal-Key': validKey }
  });
  assert.strictEqual(debugRes.status, 403);

  // 2. Internal key calling DELETE /api/items/TEST_SKU_1 -> ACCEPTED
  const delRes = await httpRequest('/api/items/TEST_SKU_1', {
    method: 'DELETE',
    headers: { 'X-V360-Internal-Key': validKey }
  });
  assert.strictEqual(delRes.status, 200);

  // 3. Invalid internal key -> REJECTED with 401
  const invalidRes = await httpRequest('/api/items/TEST_SKU_1', {
    method: 'DELETE',
    headers: { 'X-V360-Internal-Key': 'wrong_key' }
  });
  assert.strictEqual(invalidRes.status, 401);
});

test('Public Access - Public viewer, embeds, and items catalog remain unauthenticated', async () => {
  const viewerRes = await httpRequest('/vision360.html?d=PR048');
  assert.strictEqual(viewerRes.status, 200);

  const itemsRes = await httpRequest('/api/items');
  assert.strictEqual(itemsRes.status, 200);
  assert.ok(Array.isArray(itemsRes.json.items));
});
