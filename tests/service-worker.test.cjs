'use strict';

// Run with Node.js 18+: node --test tests/service-worker.test.cjs
// No dependencies; execute the real worker in a mocked browser environment.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
const base = 'https://example.test/AGRI-DETECT/';

function createWorker() {
  const handlers = {};
  const stores = new Map();
  const deletions = [];
  let claimed = false;
  const key = (request) => new URL(typeof request === 'string' ? request : request.url, base).href;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { deletions.push(name); return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async addAll(urls) {
          for (const url of urls) entries.set(key(url), new Response(url));
        },
        async put(request, response) { entries.set(key(request), response); },
        async match(request) {
          const response = entries.get(key(request));
          return response && response.clone();
        }
      };
    },
    async match(request) {
      for (const entries of stores.values()) {
        const response = entries.get(key(request));
        if (response) return response.clone();
      }
      return undefined;
    }
  };
  const context = vm.createContext({
    URL, Response, console, caches,
    fetch: async () => { throw new Error('offline'); },
    self: {
      location: new URL(base),
      addEventListener(type, handler) { handlers[type] = handler; },
      skipWaiting: async () => {},
      clients: { claim: async () => { claimed = true; } },
      registration: { showNotification: async () => {} }
    }
  });
  vm.runInContext(source, context, { filename: 'service-worker.js' });
  const version = vm.runInContext('VERSION', context);
  return {
    caches, stores, deletions, version,
    get claimed() { return claimed; },
    async install() {
      let pending;
      handlers.install({ waitUntil(promise) { pending = promise; } });
      await pending;
    },
    async activate() {
      let pending;
      handlers.activate({ waitUntil(promise) { pending = promise; } });
      await pending;
    },
    async navigate(relativeUrl) {
      let pending;
      handlers.fetch({
        request: { method: 'GET', mode: 'navigate', url: new URL(relativeUrl, base).href },
        respondWith(promise) { pending = promise; }
      });
      return pending;
    }
  };
}

test('activation preserves follow-up data and current assets, removing old assets', async () => {
  const worker = createWorker();
  await worker.install();
  const reminders = await worker.caches.open('agridetect-followups');
  await reminders.put('__followups__.json', new Response('[{"id":1,"done":false}]'));
  await worker.caches.open('agridetect-v0');
  await worker.caches.open('unrelated-cache');
  await worker.activate();
  assert.equal(worker.stores.has('agridetect-followups'), true);
  const saved = await reminders.match('__followups__.json');
  assert.deepEqual(await saved.json(), [{ id: 1, done: false }]);
  assert.equal(worker.stores.has(worker.version), true);
  assert.equal(worker.stores.has('unrelated-cache'), true);
  assert.equal(worker.stores.has('agridetect-v0'), false);
  assert.deepEqual(worker.deletions, ['agridetect-v0']);
  assert.equal(worker.claimed, true);
});

test('offline uncached crop query resolves to precached detection page under subpath', async () => {
  const worker = createWorker();
  await worker.install();
  const response = await worker.navigate('detection.html?crop=tomato&name=Tomato');
  assert.equal(await response.text(), 'detection.html');
});

test('offline navigation prefers an exact cached query over the queryless page', async () => {
  const worker = createWorker();
  await worker.install();
  const cache = await worker.caches.open(worker.version);
  await cache.put('detection.html?crop=tomato', new Response('exact cached page'));
  const response = await worker.navigate('detection.html?crop=tomato');
  assert.equal(await response.text(), 'exact cached page');
});

test('offline queryless navigation still resolves to the requested page', async () => {
  const worker = createWorker();
  await worker.install();
  const response = await worker.navigate('history.html');
  assert.equal(await response.text(), 'history.html');
});

test('offline unknown page retains the home-page fallback', async () => {
  const worker = createWorker();
  await worker.install();
  const response = await worker.navigate('missing.html?crop=tomato');
  assert.equal(await response.text(), 'index.html');
});
