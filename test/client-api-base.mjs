// Offline harness for the client bundle: loads client.js in a stubbed browser and checks where the panel's requests
// are resolved. Run with: node test/client-api-base.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')

// A mount shape is: the page URL, the boot row this bundle was served from (if the Host published one), and any
// explicit override. The sandbox carries only what the bundle touches.
function load({ href, entryUrl, override }) {
  const captured = {}
  const sandbox = {
    URL,
    console,
    location: { href, origin: new URL(href).origin },
    __DSH_BOOT__: entryUrl ? { rev: 'test', entries: [{ id: '@local/dsh-lab-skills', url: entryUrl }], batches: [] } : undefined,
    __DSH_LAB_SKILLS_API_BASE__: override,
    __ModuleLoader__: {
      load({ id, factory }) {
        captured.id = id
        // The factory only needs `require('react')` to return something; nothing here renders.
        captured.module = factory(() => ({}))
      },
    },
  }
  sandbox.globalThis = sandbox
  sandbox.window = sandbox
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox)
  return captured
}

const cases = [
  ['plain origin, no boot row', { href: 'http://127.0.0.1:13950/' }, 'http://127.0.0.1:13950'],
  [
    'boot row served from the root',
    { href: 'http://127.0.0.1:13950/', entryUrl: '/plugins/@local/dsh-lab-skills/client.js?rev=1' },
    'http://127.0.0.1:13950',
  ],
  [
    'boot row under a path prefix',
    { href: 'http://127.0.0.1:13950/app/', entryUrl: '/app/plugins/@local/dsh-lab-skills/client.js?rev=1' },
    'http://127.0.0.1:13950/app',
  ],
  ['override wins over both', { href: 'http://127.0.0.1:13950/', override: 'https://lab.example.test/base/' }, 'https://lab.example.test/base'],
  ['blank override is ignored', { href: 'http://127.0.0.1:13950/', override: '   ' }, 'http://127.0.0.1:13950'],
  ['malformed entry url falls back to the origin', { href: 'http://127.0.0.1:13950/', entryUrl: 'http://[bad' }, 'http://127.0.0.1:13950'],
]

for (const [label, input, want] of cases) {
  const loaded = load(input)
  assert.equal(loaded.id, '@local/dsh-lab-skills', `${label}: factory id must equal the package name`)
  assert.equal(loaded.module.apiBase, want, `${label}: apiBase`)
  assert.equal(loaded.module.apiUrl('/state'), `${want}/api/lab-skills/state`, `${label}: /state route`)
  assert.equal(loaded.module.apiUrl('/reset'), `${want}/api/lab-skills/reset`, `${label}: /reset route`)
}

const exported = load(cases[0][1]).module
// The bundle runs in its own realm, so compare copies rather than the cross-realm arrays themselves.
assert.deepEqual(Object.keys(exported).sort(), ['apiBase', 'apiUrl', 'apply', 'inject'], 'client exports')
assert.equal(Array.from(exported.inject).join(','), 'slots', 'client injects slots')

console.log('lab-skills client: all checks passed')
