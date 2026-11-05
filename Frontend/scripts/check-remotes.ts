import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { parse, stringify } from 'devalue';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { migrateDatabase } from '../src/lib/server/db/migrate';
import { users, userRoles, departments } from '../src/lib/server/db/schema';

// Launch our own server against disposable data; never connect to an existing app or database.
const directory = mkdtempSync(join(tmpdir(), 'ticketing-remotes-'));
const filename = join(directory, 'fixture.db');
const sqlite = new Database(filename, { create: true });
let server: ReturnType<typeof Bun.spawn> | undefined;
try {
  migrateDatabase(sqlite);
  const db = drizzle(sqlite);
  const password = await Bun.password.hash('password123');
  const admin = db.insert(users).values({ username: 'admin', email: 'admin@example.com', first_name: 'Admin', last_name: 'Test', password }).returning().get()!;
  const user = db.insert(users).values({ username: 'user', email: 'user@example.com', first_name: 'User', last_name: 'Test', password }).returning().get()!;
  db.insert(userRoles).values([{ user_id: admin.id, role: 'admin' }, { user_id: user.id, role: 'user' }]).run();
  const secret = crypto.randomUUID();
  const key = new TextEncoder().encode(secret);
  const handoff = readFileSync('build/adapter-bun.js', 'utf8');
  const base = JSON.parse(handoff.match(/export const base = (.*);/)![1]).replace(/\/$/, '');
  const configuredOrigin = handoff.match(/export const origin = (.*);/)![1];
  const remoteId = (name: string) => {
    const source = readFileSync(`build/server/chunks/${name}.remote.js`, 'utf8');
    return source.match(new RegExp(`"src/lib/${name}\\.remote\\.ts",\\s*"([^"]+)"`))![1];
  };
  const ids = { auth: remoteId('auth'), reference: remoteId('reference') };
  server = Bun.spawn([process.execPath, 'build/index.js'], {
    env: { ...process.env, DATABASE_URL: `file:${filename}`, JWT_SECRET: secret, HOST: '127.0.0.1', PORT: '0' },
    stdout: 'pipe', stderr: 'pipe',
  });
  const reader = (server.stdout as ReadableStream<Uint8Array>).getReader();
  const ready = await Promise.race([
    reader.read().then(({ value }) => new TextDecoder().decode(value)),
    server.exited.then(code => { throw new Error(`Test server exited (${code})`); }),
  ]);
  const address = ready.match(/Listening on (http:\/\/\S+)/)![1].replace(/\/$/, '');
  const origin = configuredOrigin === 'undefined' ? `https://${new URL(address).host}` : JSON.parse(configuredOrigin);

  async function rpc(module: keyof typeof ids, name: string, input?: unknown, cookie = '', method = 'POST', requestOrigin = origin) {
    const response = await fetch(`${address}${base}/_app/remote/${ids[module]}/${name}`, {
      method, headers: { Origin: requestOrigin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify({ payload: input === undefined ? '' : Buffer.from(stringify(input)).toString('base64url'), refreshes: [] }),
    });
    const envelope = await response.json() as any;
    const data = envelope.data ? parse(envelope.data) : {};
    return { response, envelope, status: envelope.error?.status ?? response.status, value: data._ };
  }

  assert.equal((await rpc('auth', 'getSession', undefined, '', 'GET')).value, null);
  assert.equal((await rpc('auth', 'login', { username: 'admin', password: 'wrong' })).status, 401);
  const login = await rpc('auth', 'login', { username: 'admin', password: 'password123' });
  assert.equal(login.status, 200);
  assert.equal(login.value.user.id, admin.id);
  assert.ok(!('password' in login.value.user));
  const setCookie = login.response.headers.get('set-cookie')!;
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  const cookie = setCookie.split(';')[0];
  assert.equal((await rpc('auth', 'getSession', undefined, cookie, 'GET')).value.id, admin.id);
  const tokenResult = await rpc('auth', 'getWsToken', undefined, cookie);
  const claims = (await jwtVerify(tokenResult.value.token, key)).payload;
  assert.equal(claims.sub, String(admin.id));
  assert.ok(claims.exp! <= Math.floor(Date.now() / 1000) + 60);

  const registration = { username: 'registered', email: 'registered@example.com', password: 'password123', first_name: 'Registered', last_name: 'Test', roles: ['admin'] };
  const registered = await rpc('auth', 'register', registration);
  assert.equal(registered.status, 200);
  assert.deepEqual(registered.value.user.roles, ['user']);
  assert.ok(!('password' in registered.value.user));
  assert.equal((await rpc('auth', 'register', registration)).status, 409);
  const races = await Promise.all([1, 2].map(() => rpc('auth', 'register', { ...registration, username: 'race', email: 'race@example.com' })));
  assert.deepEqual(races.map(result => result.status).sort(), [200, 409]);

  const item = { kind: 'departments', data: { name: 'New department', description: null, is_active: true } };
  assert.equal((await rpc('reference', 'createReferenceItem', item)).status, 401);
  const forgedRoles = await new SignJWT({ sub: String(user.id), roles: ['admin'] }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(key);
  assert.equal((await rpc('reference', 'createReferenceItem', item, `auth_cookie=${forgedRoles}`)).status, 403);
  const created = await rpc('reference', 'createReferenceItem', item, cookie);
  assert.equal(created.status, 200);
  assert.equal((await rpc('reference', 'createReferenceItem', item, cookie)).status, 409);
  const data = (await rpc('reference', 'getReferenceData', undefined, '', 'GET')).value;
  const department = data.departments.find((row: any) => row.name === item.data.name);
  assert.ok(department);
  assert.equal((await rpc('reference', 'updateReferenceItem', { ...item, id: department.id, data: { ...item.data, name: 'Updated department' } }, cookie)).status, 200);
  assert.equal((await rpc('reference', 'deleteReferenceItem', { kind: 'departments', id: department.id }, cookie)).status, 200);
  assert.equal(db.select().from(departments).where(eq(departments.id, department.id)).get()!.is_active, false);
  assert.ok(!(await rpc('reference', 'getReferenceData', undefined, '', 'GET')).value.departments.some((row: any) => row.id === department.id));

  const profile = await rpc('auth', 'saveProfile', { first_name: 'Updated', roles: ['user'], message_notifications: false }, cookie);
  assert.equal(profile.value.first_name, 'Updated');
  assert.equal(profile.value.message_notifications, false);
  assert.deepEqual(profile.value.roles, ['admin']);
  assert.ok(!('password' in profile.value));
  const csrf = await rpc('auth', 'saveProfile', { first_name: 'CSRF attempt' }, cookie, 'POST', 'https://other.invalid');
  assert.equal(csrf.status, 403);
  assert.equal(db.select().from(users).where(eq(users.id, admin.id)).get()!.first_name, 'Updated');

  db.delete(userRoles).where(eq(userRoles.user_id, admin.id)).run();
  assert.equal((await rpc('reference', 'createReferenceItem', item, cookie)).status, 403);
  db.update(users).set({ is_active: false }).where(eq(users.id, admin.id)).run();
  assert.equal((await rpc('auth', 'getSession', undefined, cookie, 'GET')).value, null);
  assert.equal((await rpc('reference', 'createReferenceItem', item, cookie)).status, 403);
  const logout = await rpc('auth', 'logout', undefined, cookie);
  assert.match(logout.response.headers.get('set-cookie')!, /Max-Age=0/i);
  const expired = await new SignJWT({ sub: String(user.id) }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime(1).sign(key);
  assert.equal((await rpc('auth', 'getSession', undefined, `auth_cookie=${expired}`, 'GET')).value, null);
  console.log('Remote auth/reference integration checks passed (isolated SQLite and Bun server).');
} catch (error) {
  console.error('Remote integration check failed:', error);
  throw error;
} finally {
  if (server) {
    server.kill();
    await server.exited;
    const logs = await new Response(server.stderr as ReadableStream).text();
    if (logs) console.error(logs);
  }
  sqlite.close();
  Bun.gc(true);
  for (const name of readdirSync(directory)) {
    // Windows may release SQLite file handles shortly after the child exits.
    for (let attempt = 0; ; attempt++) {
      try { unlinkSync(join(directory, name)); break; }
      catch (error) {
        if (!['EBUSY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '') || attempt === 20) throw error;
        await Bun.sleep(50);
      }
    }
  }
  rmdirSync(directory);
}
