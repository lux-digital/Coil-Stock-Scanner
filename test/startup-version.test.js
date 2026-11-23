const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script id="coilStartup">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'startup check must run from the page before the scanner scripts');
assert.match(html, /<meta name="coil-build" content="2026-11-23\.1">/);
assert.match(html, /scanner\.js\?v=22/);
new vm.Script(script);

function boot({remote = '2026-11-23.1', failure = false} = {}) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) {
      const listeners = {};
      elements.set(id, {hidden: false, textContent: '',
        addEventListener(name, callback) {listeners[name] = callback;},
        click() {listeners.click?.();}});
    }
    return elements.get(id);
  };
  const listeners = {};
  const requests = [];
  let loaded = null;
  const location = {
    href: 'https://example.test/Coil-Stock-Scanner/',
    replace(url) {loaded = url;}
  };
  const document = {
    baseURI: location.href,
    hidden: false,
    documentElement: {dataset: {startup: 'checking'}},
    querySelector() {return {content: '2026-11-23.1'};},
    getElementById: get,
    addEventListener(name, callback) {listeners[name] = callback;}
  };
  const window = {addEventListener() {}, CoilScannerBusy: () => false, CoilHasResults: () => false};
  vm.runInNewContext(script, {document, window, location, URL, Date, AbortController,
    setTimeout: () => 1, clearTimeout() {},
    async fetch(url, options) {
      requests.push({url: String(url), cache: options.cache});
      if (failure) throw new Error('Offline');
      return {ok: true, async text() {return `<meta name="coil-build" content="${remote}">`;}};
    }});
  listeners.DOMContentLoaded();
  return {document, window, get, requests, get loaded() {return loaded;}, setRemote(value) {remote = value;}};
}

async function main() {
  const current = boot();
  assert.equal(await current.window.CoilStartup.ready(), true);
  assert.equal(current.document.documentElement.dataset.startup, 'ready');
  assert.equal(current.window.CoilStartup.info().build, '2026-11-23.1');
  assert.equal(current.requests[0].cache, 'no-store');
  assert.match(current.requests[0].url, /_coilCheck=/);

  const newer = boot({remote: '2026-11-24.1'});
  assert.equal(await newer.window.CoilStartup.ready(), false);
  assert.match(newer.loaded, /coilBuild=2026-11-24\.1/);
  assert.match(newer.loaded, /_reload=/);
  assert.equal(newer.document.documentElement.dataset.startup, 'checking');

  const offline = boot({failure: true});
  assert.equal(await offline.window.CoilStartup.ready(), false);
  assert.equal(offline.get('startupContinue').hidden, false);
  offline.get('startupContinue').click();
  assert.equal(await offline.window.CoilStartup.ready(), true);
  assert.equal(offline.window.CoilStartup.info().status, 'unverified');

  current.setRemote('2026-11-24.1');
  current.window.CoilScannerBusy = () => true;
  assert.equal(await current.window.CoilStartup.check({force: true}), false);
  assert.equal(current.window.CoilStartup.info().status, 'pending');
  assert.equal(current.loaded, null);
  current.window.CoilScannerBusy = () => false;
  assert.equal(await current.window.CoilStartup.ready(), false);
  assert.match(current.loaded, /coilBuild=2026-11-24\.1/);
  console.log('Startup version checks passed');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
