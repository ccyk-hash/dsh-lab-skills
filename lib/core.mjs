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
      '在本机 ChemDraw（Windows COM，ProgID ChemDraw_x64.Application，23.1.1.3）绘制/编辑结构式与反应式，产出可编辑 CDXML/CDX 加预览 PNG/EMF；适用于教材习题与讲义的结构式、反应式、命名题、机理题插图（有机化学_第七版 第一、二、三章 figs/，第三章 c3_01..c3_13 为 cdxml+png+json 三件套）；轨道、能量曲线、过渡态等纯示意图走 tools/chemdraw/svgfig.py，教材页裁图走裁切流程；本技能不做化学推断。',
    keywords: [
      'chemdraw',
      'cdxml',
      'cdx',
      'smiles',
      'inchi',
      'molfile',
      '结构式',
      '结构式图',
      '化学结构',
      '分子结构',
      '反应式',
      '画结构',
      '化学式',
      '命名题',
      '机理',
      '机理图',
      '骨架结构',
    ],
  },
  'latex-automation': {
    title: 'LaTeX 编译与排错',
    description:
      '在本机 TeX Live（D:/Latex/texlive/2026）上跑 .tex 工程：编译出 PDF、把 .log 解析成按 root_cause 排序的诊断、缺包缺字体离线安装命令、有界修复、版面量化与渲染页检查、chktex/latexindent、模板建工程，产物落 latex-out/ 含 build-report.json；仅处理 .tex 工程（不联网不装包），不适用 HTML 或 docx 精讲的排版与参考文献（那是 KaTeX 转 OMML 加 html2docx 的流水线，outputs/ 下 0 个 .tex/.bib）。',
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
      '.bib',
      'ctex',
      'tex live',
      '编译 pdf',
      '编译pdf',
      '论文编译',
      'overfull',
      'underfull',
      '孤行',
      '寡行',
      'latexindent',
      'chktex',
    ],
  },
  'origin-plot': {
    title: 'Origin 绘图',
    description:
      '用 originpro COM 桥驱动本机 Origin 2024（D:/origin/Origin64.exe 加 C:/Python314/python.exe）把 CSV/数据表做成出版级散点、折线、柱状图，批量导出 PNG/PDF/TIFF/SVG 并存可编辑 .opju；适用于要 Origin 出图、改 .opju/.ogw 工程、出版级模板；matplotlib 或 PIL 手绘示意图与教材页裁图不属于本技能（出图、绘图、作图、曲线拟合在本工作区多指那两类）。',
    keywords: [
      'origin',
      'originlab',
      'originpro',
      'opju',
      'ogw',
      'origin 画图',
      'origin绘图',
      'origin 绘图',
    ],
  },
  'prism-analyst-cn': {
    title: 'GraphPad Prism 统计分析',
    description:
      '用中文一句话调用本机 GraphPad Prism 8.0.2（D:/workbuddy/daily use/prism8/prism_runner.py）做统计：统计值一律取自 Prism 原生结果表，脚本只能 RecalcAll，可用分析取决于 templates/registry.json（当前仅 ttest_two_group、anova_tukey_one_way、linear_regression）；适用于 .pzfx 工程内这三类分析与 Prism 出图，不适用信度、因子分析、中介调节等未登记分析（改用 spss-analyst-cn）。',
    keywords: [
      'prism',
      'graphpad',
      'graphpad prism',
      'pzfx',
      '剂量反应',
      '剂量-反应',
      'ic50',
      'ec50',
      '生存曲线',
      'kaplan',
      'tukey',
    ],
  },
  'spss-analyst-cn': {
    title: 'SPSS 统计分析',
    description:
      '用本机 IBM SPSS Statistics 25（C:/Program Files/IBM/SPSS/Statistics/25，MCP 服务 spss）把中文需求翻成 SPSS 语法并执行，产出 Markdown 结果表、可复现 .sps、.spv 原始结果、spss_chart 的 1600x1000 PNG、spss_make_report 的 Word 三线表报告，落 results/tasks/<任务名>/；适用于 .sav 问卷/量表数据的描述统计、t 检验、方差分析、相关、回归、logistic、信度 Cronbach、因子分析、聚类、卡方、中介调节，不适用只要 Prism 原生曲线的 IC50 与生存曲线（改用 prism-analyst-cn）。',
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
      '相关分析',
      '问卷数据',
      '量表',
      '中介调节',
      '三线表',
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
