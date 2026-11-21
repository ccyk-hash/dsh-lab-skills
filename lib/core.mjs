// Core helpers for dsh-lab-skills: state store, keyword scoring, SKILL.md parsing.
// Node built-ins only — this package lives outside the DSH install tree.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Stable skill ids. Must satisfy DSH's /^[a-z0-9]+(?:-[a-z0-9]+)*$/ rule. */
export const SKILL_NAMES = [
  'chemdraw-automation',
  'latex-automation',
  'origin-plot',
  'prism-analyst-cn',
  'spss-analyst-cn',
]

export const PROVIDER_NAME = 'lab-skills'

/** Lower rank wins inside one layer; 50 keeps us above the built-in file provider (user-dsh = 400). */
export const CANDIDATE_RANK = 50

/**
 * Per-skill defaults: a short description used only if SKILL.md cannot be read,
 * plus the activation keywords used by the automatic router.
 * Weights are derived from length: >= 4 characters counts 2, otherwise 1.
 */
export const SKILL_DEFAULTS = {
  'chemdraw-automation': {
    title: 'ChemDraw 结构式自动化',
    description:
      '用脚本绘制/批量生成 ChemDraw 结构式（CDXML、SMILES 转换、批量出图）。触发词：ChemDraw、结构式、化学式、CDXML、SMILES、反应式、分子结构。',
    keywords: [
      'chemdraw',
      'cdxml',
      'smiles',
      '结构式',
      '化学结构',
      '分子结构',
      '反应式',
      '画结构',
      '化学式',
    ],
  },
  'latex-automation': {
    title: 'LaTeX 编译与排错',
    description:
      '在本机 TeX Live 上编译 LaTeX 生成 PDF、诊断 .log 报错、缺包缺字体处理、版面量化检查和模板建工程。触发词：LaTeX、XeLaTeX、pdflatex、latexmk、ctex、编译 PDF、.tex、.log、参考文献、overfull。',
    keywords: [
      'latex',
      'xelatex',
      'pdflatex',
      'lualatex',
      'latexmk',
      'biber',
      'bibtex',
      'tex',
      '.tex',
      '.log',
      'ctex',
      '编译 pdf',
      '编译pdf',
      '排版',
      '参考文献',
      '论文编译',
      'overfull',
      'underfull',
      '孤行',
      '寡行',
      'latexindent',
      'chktex',
      'tex live',
    ],
  },
  'origin-plot': {
    title: 'Origin 绘图',
    description:
      'Origin 作图与批量出图：数据导入、图层设置、曲线拟合、导出图片。触发词：Origin、OriginLab、opju、ogw、绘图、曲线拟合、导出图。',
    keywords: [
      'origin',
      'originlab',
      'opju',
      'ogw',
      'origin 画图',
      'origin绘图',
      'origin 绘图',
      '曲线拟合',
      '拟合曲线',
      '作图',
      '出图',
      '绘图',
    ],
  },
  'prism-analyst-cn': {
    title: 'GraphPad Prism 统计分析',
    description:
      'GraphPad Prism 数据分析与出图：t 检验、ANOVA、生存分析、剂量反应曲线、p 值报告。触发词：Prism、GraphPad、pzfx、剂量反应、IC50、生存曲线。',
    keywords: [
      'prism',
      'graphpad',
      'pzfx',
      '剂量反应',
      '剂量-反应',
      'ic50',
      'ec50',
      '生存曲线',
      'kaplan',
      'graphpad prism',
    ],
  },
  'spss-analyst-cn': {
    title: 'SPSS 统计分析',
    description:
      'SPSS 数据分析：描述统计、t 检验、方差分析、回归、信度、因子分析、聚类，读写 .sav 并出中文报告。触发词：SPSS、.sav、方差分析、回归、信度、Cronbach、因子分析。',
    keywords: [
      'spss',
      '.sav',
      'sav 文件',
      '方差分析',
      '回归分析',
      '线性回归',
      'logistic',
      '信度',
      'cronbach',
      '因子分析',
      '主成分',
      '聚类分析',
      '卡方',
      't 检验',
      't检验',
      '描述统计',
      '相关分析',
      '问卷数据',
      '量表',
    ],
  },
}

/** Split "---\n...\n---\nbody" into frontmatter text and body. */
export function splitFrontmatter(raw) {
  const text = String(raw).replace(/^\uFEFF/, '')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) return { frontmatter: '', body: text }
  return { frontmatter: match[1], body: text.slice(match[0].length) }
}

/** Read a single scalar field out of a frontmatter block (line based, enough for our SKILL.md files). */
export function frontmatterField(frontmatter, key) {
  const lines = frontmatter.split(/\r?\n/)
  for (const line of lines) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!m) continue
    if (m[1] !== key) continue
    let value = m[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (value === '' || value === '>' || value === '|' || value === '>-' || value === '|-') {
      // block scalar: gather the indented continuation lines
      const start = lines.indexOf(line)
      const collected = []
      for (let i = start + 1; i < lines.length; i += 1) {
        const next = lines[i]
        if (/^\s+\S/.test(next)) collected.push(next.trim())
        else if (next.trim() === '') continue
        else break
      }
      return collected.join(' ').trim()
    }
    return value
  }
  return undefined
}

/** Parse a SKILL.md buffer into { description, name, body }. */
export function parseSkillMarkdown(raw, fallbackName) {
  const { frontmatter, body } = splitFrontmatter(raw)
  const description = frontmatterField(frontmatter, 'description')
  const name = frontmatterField(frontmatter, 'name')
  return {
    description: (description && description.trim()) || '',
    name: (name && name.trim()) || fallbackName,
    body: body.trim(),
  }
}

/** Lowercase, unify full-width punctuation, collapse whitespace. */
export function normalizeText(input) {
  return String(input ?? '')
    .toLowerCase()
    .replace(/[\u3000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const CJK_RE = /[\u3400-\u9fff]/
const ASCII_KEYWORD_RE = /^[a-z0-9][a-z0-9 ._+-]*$/

function keywordWeight(keyword) {
  const k = normalizeText(keyword)
  if (!k) return 0
  // Long ASCII tokens and multi-character CJK phrases are strong signals.
  return k.length >= 4 ? 2 : 1
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * ASCII trigger words match on word boundaries ("tex" must not fire inside
 * "text", "origin" must not fire inside "original"), while CJK phrases match as
 * plain substrings because Chinese text carries no separators.
 */
function matchesKeyword(haystack, keyword) {
  if (!CJK_RE.test(keyword) && ASCII_KEYWORD_RE.test(keyword)) {
    const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(keyword)}(?![a-z0-9])`, 'i')
    return pattern.test(haystack)
  }
  return haystack.includes(keyword)
}

/**
 * Score one piece of user text against a keyword list.
 * Returns { score, hits } — hits keeps the original keyword spelling for UI display.
 */
export function scoreText(text, keywords) {
  const haystack = normalizeText(text)
  if (!haystack) return { score: 0, hits: [] }
  let score = 0
  const hits = []
  for (const keyword of keywords || []) {
    const needle = normalizeText(keyword)
    if (!needle) continue
    if (!matchesKeyword(haystack, needle)) continue
    score += keywordWeight(needle)
    hits.push(keyword)
  }
  return { score, hits }
}

export function defaultState() {
  const skills = {}
  for (const name of SKILL_NAMES) {
    skills[name] = { forceOn: false, keywords: [...SKILL_DEFAULTS[name].keywords] }
  }
  return { version: 1, auto: true, threshold: 2, updatedAt: new Date().toISOString(), skills }
}

function coerceKeywordList(value) {
  if (!Array.isArray(value)) return undefined
  const out = []
  const seen = new Set()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed) continue
    const key = normalizeText(trimmed)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

export function coerceState(raw) {
  const base = defaultState()
  if (!raw || typeof raw !== 'object') return base
  const thresholdRaw = Number(raw.threshold)
  const threshold =
    Number.isFinite(thresholdRaw) && thresholdRaw >= 1 ? Math.min(20, Math.round(thresholdRaw)) : base.threshold
  const skills = {}
  const rawSkills = raw.skills && typeof raw.skills === 'object' ? raw.skills : {}
  for (const name of SKILL_NAMES) {
    const entry = rawSkills[name] && typeof rawSkills[name] === 'object' ? rawSkills[name] : {}
    const keywords = coerceKeywordList(entry.keywords)
    skills[name] = {
      forceOn: entry.forceOn === true,
      keywords: keywords && keywords.length > 0 ? keywords : [...base.skills[name].keywords],
    }
  }
  return {
    version: 1,
    auto: raw.auto !== false,
    threshold,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
    skills,
  }
}

export function resolveStateFile(config) {
  if (typeof config?.stateFile === 'string' && config.stateFile.trim()) {
    return path.resolve(config.stateFile.trim())
  }
  const home =
    (typeof config?.dshHome === 'string' && config.dshHome.trim()) ||
    process.env.DSH_HOME ||
    process.env.DSH_PROFILE_DIR ||
    path.join(os.homedir(), '.dsh')
  return path.join(home, 'dsh-lab-skills', 'state.json')
}

export function readState(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    return coerceState(JSON.parse(raw))
  } catch {
    return defaultState()
  }
}

export function writeState(file, state) {
  const next = coerceState({ ...state, updatedAt: new Date().toISOString() })
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, file)
  return next
}
