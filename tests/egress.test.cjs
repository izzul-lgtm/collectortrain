const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('public/app.js', 'utf8');
for (const name of ['pollUnreadMessages', 'pollUnreadDiscussion']) {
  test(`${name} skips hidden and signed-out tabs but polls visible tabs`, async () => {
    const start = app.indexOf(`async function ${name}()`);
    const end = app.indexOf(`setInterval(${name},`, start);
    let requests = 0;
    const context = vm.createContext({
      currentUser: {}, document: { hidden: true }, authHeaders: () => ({}),
      fetch: async () => { requests++; return { ok: false, json: async () => ({}) }; },
    });
    vm.runInContext(app.slice(start, end), context);
    await context[name]();
    assert.equal(requests, 0);
    context.document.hidden = false;
    context.currentUser = null;
    await context[name]();
    assert.equal(requests, 0);
    context.currentUser = {};
    await context[name]();
    assert.equal(requests, 1);
    assert.match(app, new RegExp(`setInterval\\(${name},NOTIFICATION_POLL_INTERVAL_MS\\)`));
  });
}
test('notification cadence is one minute', () => {
  assert.match(app, /const NOTIFICATION_POLL_INTERVAL_MS=60000;/);
});
test('session lists select all response fields without downloading transcripts', () => {
  const route = fs.readFileSync('app/api/sessions/route.js', 'utf8');
  const list = route.slice(route.indexOf('// List mode'), route.indexOf('export async function POST'));
  const columns = list.match(/\.select\('([^']+)'\)/)[1].split(',').map(s => s.trim());
  assert.ok(!columns.includes('*'));
  assert.ok(!columns.includes('transcript'));
  const fields = [...route.slice(0, route.indexOf('function toDbShape')).matchAll(/row\.(\w+)/g)].map(m => m[1]);
  for (const field of fields.filter(f => f !== 'transcript')) assert.ok(columns.includes(field), field);
  assert.match(route, /select\('\*'\)\.eq\('id', id\)\.maybeSingle\(\)/);
});
