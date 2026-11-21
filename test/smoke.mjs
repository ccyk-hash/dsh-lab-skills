// Offline harness: drives the host plugin with a fake cordis context so the
// provider, the inbox router, the tool and the settings routes can be exercised
// without restarting DSH. Run with: node test/smoke.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

import { apply } from '../index.js'
import { SKILL_NAMES } from '../lib/core.mjs'

const stateFile = path.join(os.tmpdir(), `lab-skills-test-${process.pid}`, 'state.json')
fs.rmSync(path.dirname(stateFile), { recursive: true, force: true })

const hooks = new Map()
const providers = []
const tools = []
const routes = []
let invalidations = 0

const ctx = {
  logger: {
    info() {},
    warn(message) {
      console.warn('[warn]', message)
    },
  },
  effect(fn) {
    return fn()
  },
  on(event, callback) {
    hooks.set(event, callback)
    return () => hooks.delete(event)
  },
  inject(_deps, callback) {
    callback(ctx)
  },
  skills: {
    registerProvider(create) {
      providers.push(create({ invalidate: () => (invalidations += 1) }))
      return () => {}
    },
  },
  tools: {
    register(definition) {
      tools.push(definition)
      return () => {}
    },
  },
  webServer: {
    register(route) {
      routes.push(route)
      return () => {}
    },
  },
}

apply(ctx, { stateFile })

assert.equal(providers.length, 1, 'one skill provider registered')
assert.equal(tools.length, 1, 'one tool registered')
assert.equal(routes.length, 2, 'two web routes registered')
assert.ok(hooks.has('agent/inbox/inserted'), 'inbox listener registered')

const provider = providers[0]

// Every agent gets its own provider instance registered inside that agent's context: the nearest scope layer is where
// a bundled filesystem root lives, so only an agent-layer registration can outrank it.
const agentScoped = []
const makeAgent = (id) => {
  const agent = { id }
  const agentCtx = {
    effect(fn) {
      return fn()
    },
    inject(_deps, callback) {
      callback(agentCtx)
    },
    skills: {
      registerProvider(create) {
        agentScoped.push({ id, provider: create({ invalidate: () => (invalidations += 1) }) })
        return () => {}
      },
    },
  }
  agent.ctx = agentCtx
  return agent
}
const agentA = makeAgent('agent-a')
const agentB = makeAgent('agent-b')

assert.ok(hooks.has('agent/created'), 'agent/created listener registered')
const agentCreated = hooks.get('agent/created')
agentCreated({ agent: agentA })
agentCreated({ agent: agentB })
agentCreated({ agent: agentA }) // idempotent: one provider per agent
assert.equal(agentScoped.length, 2, 'one agent-scoped provider per agent')
const boundA = agentScoped[0].provider
const boundB = agentScoped[1].provider

const visibleBound = async (bound) =>
  (await bound.list({})).filter((entry) => entry.invocation.modelInvocable).map((entry) => entry.name)
assert.deepEqual(await visibleBound(boundA), [], 'a bound provider reads its own agent, not the scope option')

const visible = async (agent) => {
  const candidates = await provider.list({ scope: agent })
  assert.equal(candidates.length, SKILL_NAMES.length, 'always claims all five skills')
  return candidates.filter((entry) => entry.invocation.modelInvocable).map((entry) => entry.name)
}

// 1. No decision yet: nothing is model-visible, everything stays user-invocable.
assert.deepEqual(await visible(agentA), [])
const cold = await provider.list({ scope: agentA })
assert.ok(cold.every((entry) => entry.invocation.userInvocable === true), 'manual invocation stays on')

// 2. First message routes LaTeX only, per agent.
const emit = hooks.get('agent/inbox/inserted')
emit({ agent: agentA, message: { content: [{ type: 'text', text: '帮我用 latex 编译这篇论文，一堆 overfull' }] } })
assert.deepEqual(await visible(agentA), ['latex-automation'])
assert.deepEqual(await visibleBound(boundA), ['latex-automation'], 'the bound provider follows the same decision')
assert.deepEqual(await visibleBound(boundB), [], 'a sibling agent keeps its own decision')
assert.deepEqual(await visible(agentB), [], 'other conversations are untouched')
assert.ok(invalidations > 0, 'provider cache invalidated after a decision')

// 3. A later message may only add, never revoke.
emit({ agent: agentA, message: { content: [{ type: 'text', text: '再帮我用 SPSS 跑个回归' }] } })
assert.deepEqual(await visible(agentA), ['latex-automation', 'spss-analyst-cn'])

// 4. Definitions load real SKILL.md content.
const candidate = (await provider.list({ scope: agentA })).find((entry) => entry.name === 'latex-automation')
const definition = await provider.get(candidate, { scope: agentA })
assert.equal(definition.name, 'latex-automation')
assert.ok(definition.content.length > 500, 'SKILL.md body loaded')
assert.ok(!definition.content.startsWith('---'), 'frontmatter stripped')
assert.equal(definition.resourceBase.kind, 'directory')

// 5. Tool: status / disable / enable / set_auto / reset.
const tool = tools[0]
const exec = { agent: agentA }
const status = await tool.execute({ action: 'status' }, exec)
assert.equal(status.auto, true)
assert.deepEqual(
  status.skills.filter((row) => row.on).map((row) => row.name),
  ['latex-automation', 'spss-analyst-cn'],
)

await tool.execute({ action: 'disable', skills: ['latex-automation'] }, exec)
assert.deepEqual(await visible(agentA), ['spss-analyst-cn'])

await tool.execute({ action: 'enable', skills: ['origin-plot'] }, exec)
assert.deepEqual(await visible(agentA), ['origin-plot', 'spss-analyst-cn'])

const rendered = tool.output.render({}, status)
assert.ok(rendered[0].text.includes('lab-skills:'))

await tool.execute({ action: 'set_auto', auto: false }, exec)
assert.deepEqual(await visible(agentA), ['origin-plot'], 'auto off drops keyword picks but keeps manual adds')

await tool.execute({ action: 'set_auto', auto: true }, exec)
await tool.execute({ action: 'reset' }, exec)
assert.deepEqual(await visible(agentA), [], 'reset forgets the session decision')

// 6. Web routes: GET state, POST edit, GET again.
const callRoute = async (routePath, { method = 'GET', body } = {}) => {
  const route = routes.find((entry) => entry.path === routePath)
  assert.ok(route, `route ${routePath} registered`)
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  const req = Readable.from(chunks)
  req.method = method
  req.headers = {}
  req.url = routePath
  const out = { status: 200, headers: {}, payload: '' }
  const res = {
    writeHead(status, headers) {
      out.status = status
      out.headers = headers || {}
    },
    end(text) {
      out.payload += text ?? ''
    },
  }
  await route.handler(req, res)
  return { status: out.status, data: out.payload ? JSON.parse(out.payload) : undefined }
}

const initial = await callRoute('/api/lab-skills/state')
assert.equal(initial.status, 200)
assert.equal(initial.data.skills.length, 5)
assert.ok(initial.data.skills.every((row) => Array.isArray(row.keywords) && row.keywords.length > 0))

const posted = await callRoute('/api/lab-skills/state', {
  method: 'POST',
  body: {
    auto: true,
    threshold: 3,
    skills: {
      'origin-plot': { forceOn: true, keywords: ['origin', '绘图'] },
    },
  },
})
assert.equal(posted.status, 200)
assert.equal(posted.data.threshold, 3)
const originRow = posted.data.skills.find((row) => row.name === 'origin-plot')
assert.equal(originRow.forceOn, true)
assert.deepEqual(originRow.keywords, ['origin', '绘图'])
const latexRow = posted.data.skills.find((row) => row.name === 'latex-automation')
assert.ok(latexRow.keywords.includes('latex'), 'untouched skills keep their keywords')

// forced skill is visible even with no session decision and auto routing on
assert.deepEqual(await visible(agentB), ['origin-plot'])

// threshold now 3: a single weak hit no longer routes
emit({ agent: agentB, message: { content: [{ type: 'text', text: '做个 t 检验' }] } })
assert.deepEqual(await visible(agentB), ['origin-plot'], 'threshold raised to 3 rejects a 2-point hit')

const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
assert.equal(persisted.threshold, 3)
assert.equal(persisted.skills['origin-plot'].forceOn, true)

const reset = await callRoute('/api/lab-skills/reset', { method: 'POST' })
assert.equal(reset.status, 200)
const afterReset = await callRoute('/api/lab-skills/state')
assert.equal(afterReset.data.threshold, 2)
assert.ok(afterReset.data.skills.every((row) => row.forceOn === false))

// 7. Malformed input does not throw out of the route.
const bad = await callRoute('/api/lab-skills/state', { method: 'POST', body: [] })
assert.equal(bad.status, 200, 'array body is coerced, not fatal')

console.log('lab-skills smoke: all checks passed')
fs.rmSync(path.dirname(stateFile), { recursive: true, force: true })
