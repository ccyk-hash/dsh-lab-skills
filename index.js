// dsh-lab-skills — Host half.
//
// Packs five lab skills into one plugin and registers a skill provider that
// decides, per agent (= per conversation), which of them the model can see.
//
// Visibility is expressed through `invocation.modelInvocable` rather than by
// returning fewer candidates: `~/.dsh/skills` already exposes these skills at a
// much weaker rank, so a filtered-out skill must still be *claimed* here with
// modelInvocable:false, otherwise the lower-priority entry would resurface and
// the "off" switch would do nothing.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CANDIDATE_RANK,
  PROVIDER_NAME,
  SKILL_DEFAULTS,
  SKILL_NAMES,
  coerceState,
  defaultState,
  parseSkillMarkdown,
  readState,
  resolveStateFile,
  scoreText,
  writeState,
} from './lib/core.mjs'

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url))

export const name = 'lab-skills'
export const inject = ['skills']

/** Turn a UserMessage into plain text (concatenated text blocks only). */
function messageText(message) {
  const blocks = message?.content
  if (!Array.isArray(blocks)) return ''
  const parts = []
  for (const block of blocks) {
    if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n').trim()
}

export function apply(ctx, config = {}) {
  const stateFile = resolveStateFile(config)
  const skillsDir =
    typeof config?.skillsDir === 'string' && config.skillsDir.trim()
      ? path.resolve(config.skillsDir.trim())
      : path.join(PACKAGE_DIR, 'skills')

  let state = readState(stateFile)
  /** Lazily filled: name -> { dir, file, description, title, frontmatter } */
  const catalog = new Map()
  /** agent -> decision record (per conversation, never persisted) */
  const decisions = new WeakMap()
  /** Every live provider registration (global + one per agent) so a settings change reaches all of them. */
  const providerControls = new Set()

  /**
   * The skill registry caches its merged catalog; a routing decision or a settings edit stays invisible to the
   * model until every live provider drops that cache.
   */
  function invalidateSkillCache() {
    for (const control of providerControls) {
      try {
        control.invalidate()
      } catch (error) {
        ctx.logger?.warn?.(`lab-skills: catalog invalidation failed: ${error?.message ?? error}`)
      }
    }
  }

  function loadCatalogEntry(skillName) {
    const cached = catalog.get(skillName)
    if (cached) return cached
    const defaults = SKILL_DEFAULTS[skillName] ?? { title: skillName, description: skillName, keywords: [] }
    const dir = path.join(skillsDir, skillName)
    const file = path.join(dir, 'SKILL.md')
    let description = defaults.description
    let title = defaults.title
    let body
    try {
      const raw = fs.readFileSync(file, 'utf8')
      const parsed = parseSkillMarkdown(raw, skillName)
      body = parsed.body
      if (parsed.description) description = parsed.description
      const heading = /^#\s+(.+)$/m.exec(body || '')
      if (heading) title = heading[1].trim()
    } catch {
      body = undefined
    }
    const entry = { name: skillName, dir, file, description, title, body }
    catalog.set(skillName, entry)
    return entry
  }

  function ensureCatalog() {
    for (const skillName of SKILL_NAMES) loadCatalogEntry(skillName)
  }

  // ---------------------------------------------------------------- decisions

  function forcedNames() {
    return SKILL_NAMES.filter((skillName) => state.skills[skillName]?.forceOn === true)
  }

  function evaluateText(text) {
    const threshold = state.threshold
    const perSkill = {}
    const passing = []
    for (const skillName of SKILL_NAMES) {
      const keywords = state.skills[skillName]?.keywords ?? []
      const { score, hits } = scoreText(text, keywords)
      perSkill[skillName] = { score, hits }
      if (score >= threshold) passing.push(skillName)
    }
    return { perSkill, passing }
  }

  /** Effective skill set for one agent: forced ∪ auto ∪ manual-add − manual-remove. */
  function effectiveNames(agent) {
    const decision = agent ? decisions.get(agent) : undefined
    const out = new Set(forcedNames())
    if (state.auto && decision) for (const skillName of decision.auto) out.add(skillName)
    if (decision) for (const skillName of decision.add) out.add(skillName)
    if (decision) for (const skillName of decision.remove) out.delete(skillName)
    return out
  }

  function recordPrompt(agent, text) {
    if (!agent) return
    let decision = decisions.get(agent)
    const normalized = text.trim()
    if (!normalized) return
    const { perSkill, passing } = evaluateText(normalized)
    if (!decision) {
      decision = {
        prompt: normalized.slice(0, 400),
        auto: new Set(),
        add: new Set(),
        remove: new Set(),
        scores: perSkill,
        seen: 0,
        decided: false,
        decidedAt: undefined,
      }
      decisions.set(agent, decision)
    }
    decision.seen += 1
    // The first substantive message decides the session; until that decision is
    // settled (or while the conversation is still young) later messages may only
    // *add* skills — a superset refinement, never a revocation.
    if (!decision.decided) {
      decision.prompt = normalized.slice(0, 400)
      for (const skillName of passing) decision.auto.add(skillName)
      decision.scores = perSkill
      if (!state.auto || passing.length > 0 || decision.seen >= 3) {
        decision.decided = true
        decision.decidedAt = new Date().toISOString()
      }
    } else if (decision.seen <= 6) {
      for (const skillName of passing) decision.auto.add(skillName)
      decision.scores = perSkill
    }
    invalidateSkillCache()
  }

  ctx.effect(() => {
    const off = ctx.on('agent/inbox/inserted', (payload) => {
      const agent = payload?.agent
      const text = messageText(payload?.message)
      if (!agent || !text) return
      try {
        recordPrompt(agent, text)
      } catch (error) {
        ctx.logger?.warn?.(`lab-skills: prompt routing failed: ${error?.message ?? error}`)
      }
    })
    return () => {
      if (typeof off === 'function') off()
    }
  })

  // ------------------------------------------------------------ skill provider

  ensureCatalog()

  /**
   * One provider instance. `boundAgent` is set when the provider is registered inside an agent's own context: that
   * layer outranks every outer layer the same skill name appears in, so the plugin — not a bundled filesystem root —
   * decides whether the skill is model-visible.
   */
  function createProvider(boundAgent) {
    return {
      name: PROVIDER_NAME,
      list: async (options) => {
        const agent = boundAgent ?? options?.scope
        const enabled = effectiveNames(agent)
        ensureCatalog()
        return SKILL_NAMES.map((skillName) => {
          const entry = loadCatalogEntry(skillName)
          const on = enabled.has(skillName)
          return {
            name: skillName,
            description: entry.description,
            invocation: { modelInvocable: on, userInvocable: true },
            source: 'custom',
            provider: PROVIDER_NAME,
            path: entry.file,
            resourceBase: { kind: 'directory', path: entry.dir },
            rank: CANDIDATE_RANK,
            locator: { name: skillName },
            metadata: { plugin: '@local/dsh-lab-skills', autoRouted: on },
          }
        })
      },
      get: async (candidate) => {
        const skillName = typeof candidate?.name === 'string' ? candidate.name : ''
        if (!SKILL_NAMES.includes(skillName)) return undefined
        const entry = loadCatalogEntry(skillName)
        let content = entry.body
        if (typeof content !== 'string') {
          try {
            content = parseSkillMarkdown(fs.readFileSync(entry.file, 'utf8'), skillName).body
          } catch {
            return undefined
          }
        }
        return {
          name: skillName,
          description: entry.description,
          invocation: { modelInvocable: true, userInvocable: true },
          source: 'custom',
          provider: PROVIDER_NAME,
          path: entry.file,
          resourceBase: { kind: 'directory', path: entry.dir },
          content,
          metadata: { plugin: '@local/dsh-lab-skills', title: entry.title },
        }
      },
    }
  }

  // Host-layer registration: answers catalog reads that carry no agent scope.
  ctx.effect(() => {
    const dispose = ctx.skills.registerProvider((control) => {
      providerControls.add(control)
      return createProvider(undefined)
    })
    return () => {
      dispose()
    }
  })

  // Agent-layer registration: the decisive one. A skill directory under ~/.dsh/skills is discovered by a provider that
  // sits in a scope layer nearer than the host, and a nearer layer replaces an outer one for the same name before rank
  // is ever compared. Registering inside each agent's own context puts this plugin in that same nearest layer, where
  // CANDIDATE_RANK wins.
  const agentProviders = new WeakSet()
  function ensureAgentProvider(agent) {
    if (!agent?.ctx || agentProviders.has(agent)) return
    agentProviders.add(agent)
    // A service can only be read through a context that declares it, so the agent context injects its own.
    const attach = (scoped) => {
      scoped.effect(() => {
        let ownControl
        const dispose = scoped.skills.registerProvider((control) => {
          ownControl = control
          providerControls.add(control)
          return createProvider(agent)
        })
        return () => {
          if (ownControl) providerControls.delete(ownControl)
          dispose()
        }
      })
    }
    if (typeof agent.ctx.inject === 'function') agent.ctx.inject(['skills'], attach)
    else attach(agent.ctx)
  }

  ctx.effect(() => {
    const off = ctx.on('agent/created', (payload) => ensureAgentProvider(payload?.agent))
    // Adopt the agents that were already live when this instance loaded (a reload, or an enable in the middle of a
    // conversation). Without this sweep the running conversation keeps falling back to the built-in provider and only
    // the next one would be governed.
    let live = []
    try {
      live = ctx.get?.('agents')?.list?.() ?? []
    } catch {
      live = []
    }
    for (const agent of live) ensureAgentProvider(agent)
    return () => {
      if (typeof off === 'function') off()
    }
  })

  // ------------------------------------------------------------------ settings

  function readConfig() {
    return coerceState(state)
  }

  function saveConfig(patch) {
    const incomingSkills = patch?.skills && typeof patch.skills === 'object' ? patch.skills : {}
    const skills = {}
    for (const skillName of SKILL_NAMES) {
      const current = state.skills[skillName]
      const incoming = incomingSkills[skillName]
      skills[skillName] = incoming
        ? coerceState({ skills: { [skillName]: incoming } }).skills[skillName]
        : current
    }
    const next = coerceState({
      ...state,
      ...(typeof patch?.auto === 'boolean' ? { auto: patch.auto } : {}),
      ...(patch?.threshold !== undefined ? { threshold: patch.threshold } : {}),
      skills,
    })
    state = writeState(stateFile, next)
    invalidateSkillCache()
    return state
  }

  function statusFor(agent) {
    ensureCatalog()
    const enabled = effectiveNames(agent)
    const decision = agent ? decisions.get(agent) : undefined
    return {
      auto: state.auto,
      threshold: state.threshold,
      stateFile,
      decision: decision
        ? {
            prompt: decision.prompt,
            decided: decision.decided,
            decidedAt: decision.decidedAt ?? null,
            auto: [...decision.auto].sort(),
            added: [...decision.add].sort(),
            removed: [...decision.remove].sort(),
          }
        : null,
      skills: SKILL_NAMES.map((skillName) => {
        const entry = loadCatalogEntry(skillName)
        const row = state.skills[skillName]
        return {
          name: skillName,
          title: entry.title,
          on: enabled.has(skillName),
          forceOn: row.forceOn === true,
          keywords: row.keywords,
          score: decision?.scores?.[skillName]?.score ?? 0,
          hits: decision?.scores?.[skillName]?.hits ?? [],
        }
      }),
    }
  }

  async function catalogFor(agent) {
    const service = ctx.skills
    if (!service || typeof service.snapshot !== 'function') throw new Error('skills service unavailable')
    let cwd
    try {
      cwd = typeof ctx.workingDirectory?.ensure === 'function' ? await ctx.workingDirectory.ensure(agent) : undefined
    } catch {
      cwd = undefined
    }
    const snapshot = await service.snapshot(cwd === undefined ? { scope: agent } : { scope: agent, cwd })
    const registry = snapshot.skills
      .filter((skill) => SKILL_NAMES.includes(skill.name))
      .map((skill) => ({
        name: skill.name,
        provider: skill.provider,
        source: skill.source,
        modelInvocable: skill.invocation?.modelInvocable === true,
        userInvocable: skill.invocation?.userInvocable === true,
      }))
    const base = statusFor(agent)
    return {
      ...base,
      complete: snapshot.complete === true,
      total: snapshot.skills.length,
      names: snapshot.skills.map((skill) => skill.name),
      registry,
    }
  }

  function summarize(value) {
    const on = value.skills.filter((row) => row.on).map((row) => row.name)
    const head = `auto=${value.auto ? 'on' : 'off'} threshold=${value.threshold}`
    const body = on.length > 0 ? on.join(', ') : '(none)'
    const rows = value.skills
      .map((row) => {
        const flags = [row.on ? 'ON' : 'off']
        if (row.forceOn) flags.push('forced')
        if (row.score > 0) flags.push(`score=${row.score}`)
        return `- ${row.name}: ${flags.join(' ')}${row.hits.length ? ` (${row.hits.join('/')})` : ''}`
      })
      .join('\n')
    const registry = Array.isArray(value.registry)
      ? [
          `registry: complete=${value.complete} total=${value.total}`,
          ...value.registry.map(
            (row) =>
              `- ${row.name}: provider=${row.provider} source=${row.source} model=${row.modelInvocable ? 'yes' : 'no'} user=${row.userInvocable ? 'yes' : 'no'}`,
          ),
        ].join('\n')
      : ''
    return `lab-skills: ${head}\nactive: ${body}\n${rows}${registry ? `\n${registry}` : ''}`
  }

  ctx.inject(['tools'], (toolsCtx) => {
    toolsCtx.effect(() =>
      toolsCtx.tools.register({
        name: 'lab_skills',
        description:
          'Inspect or change which lab skills (chemdraw-automation, latex-automation, origin-plot, prism-analyst-cn, spss-analyst-cn) are available in this conversation. The plugin already routes skills automatically from the first user message; use this tool to inspect the decision, force a skill on/off for this session, or toggle the automatic router.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: {
              type: 'string',
              enum: ['status', 'catalog', 'enable', 'disable', 'reset', 'set_auto'],
              description:
                'status: show the decision and the effective set. catalog: cross-check what the skills registry really resolves for this conversation. enable/disable: add or remove skills for this session. reset: forget this session\'s routing and let the next message decide again. set_auto: toggle the automatic router for every conversation.',
            },
            skills: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Skill names, for enable/disable. Use "all" to mean every bundled skill.',
            },
            auto: {
              type: 'boolean',
              description: 'For set_auto: true keeps routing automatically, false only honours the per-skill switches.',
            },
          },
          required: ['action'],
        },
        output: {
          schema: { type: 'object' },
          render(args, value) {
            return [{ type: 'text', text: summarize(value) }]
          },
        },
        isConcurrencySafe: true,
        async execute(args, exec) {
          const agent = exec?.agent
          const action = typeof args?.action === 'string' ? args.action : 'status'
          const requested = Array.isArray(args?.skills) ? args.skills.filter((s) => typeof s === 'string') : []
          const target = requested.includes('all') ? [...SKILL_NAMES] : requested
          const unknown = target.filter((skillName) => !SKILL_NAMES.includes(skillName))
          if (unknown.length > 0) {
            throw new Error(`unknown skill(s): ${unknown.join(', ')}; known: ${SKILL_NAMES.join(', ')}`)
          }

          if (action === 'status') return statusFor(agent)

          if (action === 'catalog') return catalogFor(agent)

          if (action === 'set_auto') {
            if (typeof args?.auto !== 'boolean') throw new Error('set_auto requires a boolean "auto"')
            saveConfig({ auto: args.auto })
            return statusFor(agent)
          }

          if (action === 'reset') {
            if (agent) decisions.delete(agent)
            invalidateSkillCache()
            return statusFor(agent)
          }

          if (target.length === 0) throw new Error(`${action} requires at least one skill name`)

          if (action === 'enable') {
            let decision = agent ? decisions.get(agent) : undefined
            if (!decision && agent) {
              decision = {
                prompt: '(manual)',
                auto: new Set(),
                add: new Set(),
                remove: new Set(),
                scores: {},
                seen: 0,
                decided: true,
                decidedAt: new Date().toISOString(),
              }
              decisions.set(agent, decision)
            }
            for (const skillName of target) {
              decision?.add.add(skillName)
              decision?.remove.delete(skillName)
            }
            invalidateSkillCache()
            return statusFor(agent)
          }

          if (action === 'disable') {
            let decision = agent ? decisions.get(agent) : undefined
            if (!decision && agent) {
              decision = {
                prompt: '(manual)',
                auto: new Set(),
                add: new Set(),
                remove: new Set(),
                scores: {},
                seen: 0,
                decided: true,
                decidedAt: new Date().toISOString(),
              }
              decisions.set(agent, decision)
            }
            for (const skillName of target) {
              decision?.remove.add(skillName)
              decision?.add.delete(skillName)
              decision?.auto.delete(skillName)
            }
            invalidateSkillCache()
            return statusFor(agent)
          }

          throw new Error(`unknown action "${action}"`)
        },
      }),
    )
  })

  // ------------------------------------------------------------------- web API
  //
  // `resource` routes only answer GET/HEAD, and the settings section posts its
  // edits, so both routes are plain node handlers that own the response.

  function sendJson(res, status, data) {
    const body = JSON.stringify(data)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
  }

  async function readJsonBody(req, limit = 262144) {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > limit) throw new Error('request body too large')
      chunks.push(chunk)
    }
    if (size === 0) return {}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }

  /** Reject cross-origin callers when the host exposes its connection guard. */
  function permitted(req) {
    try {
      if (typeof ctx.connection?.requestRejection !== 'function') return true
      return ctx.connection.requestRejection(req) === undefined
    } catch {
      return true
    }
  }

  function configView() {
    ensureCatalog()
    const cfg = readConfig()
    const active = effectiveNames(undefined)
    return {
      ok: true,
      auto: cfg.auto,
      threshold: cfg.threshold,
      stateFile,
      skills: SKILL_NAMES.map((skillName) => {
        const entry = loadCatalogEntry(skillName)
        return {
          name: skillName,
          title: entry.title,
          description: entry.description,
          forceOn: cfg.skills[skillName].forceOn === true,
          keywords: cfg.skills[skillName].keywords,
          active: active.has(skillName),
        }
      }),
    }
  }

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      const disposeState = webCtx.webServer.register({
        kind: 'exact',
        path: '/api/lab-skills/state',
        handler: async (req, res) => {
          if (!permitted(req)) {
            sendJson(res, 403, { ok: false, error: 'forbidden' })
            return
          }
          const method = (req.method || 'GET').toUpperCase()
          if (method === 'GET' || method === 'HEAD') {
            sendJson(res, 200, configView())
            return
          }
          if (method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'method not allowed' })
            return
          }
          let body
          try {
            body = await readJsonBody(req)
          } catch (error) {
            sendJson(res, 400, { ok: false, error: `invalid body: ${error?.message ?? error}` })
            return
          }
          try {
            saveConfig(body ?? {})
            sendJson(res, 200, configView())
          } catch (error) {
            sendJson(res, 500, { ok: false, error: String(error?.message ?? error) })
          }
        },
      })
      const disposeReset = webCtx.webServer.register({
        kind: 'exact',
        path: '/api/lab-skills/reset',
        handler: async (req, res) => {
          if (!permitted(req)) {
            sendJson(res, 403, { ok: false, error: 'forbidden' })
            return
          }
          if ((req.method || 'GET').toUpperCase() !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'method not allowed' })
            return
          }
          state = writeState(stateFile, defaultState())
          catalog.clear()
          invalidateSkillCache()
          sendJson(res, 200, { ok: true })
        },
      })
      return () => {
        disposeState()
        disposeReset()
      }
    })
  })

  ctx.logger?.info?.(`lab-skills: provider "${PROVIDER_NAME}" ready, state at ${stateFile}`)
}
