// dsh-lab-skills — Client half: one settings section with five switches,
// the automatic-router toggle and its threshold.
//
// No build step: the browser module table provides `react`, and the factory id
// must equal the package name so the loader can resolve this artifact.

window.__ModuleLoader__.load({
  id: '@local/dsh-lab-skills',
  factory(require) {
    const React = require('react')
    const { useCallback, useEffect, useState } = React
    const h = React.createElement

    const API_STATE = '/api/lab-skills/state'
    const API_RESET = '/api/lab-skills/reset'

    const S = {
      wrap: { display: 'flex', flexDirection: 'column', gap: '18px', padding: '4px 0 24px' },
      intro: { color: 'var(--dsw-alias-label-secondary)', fontSize: '13px', lineHeight: '1.7' },
      card: {
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      cardTitle: { fontSize: '14px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      row: { display: 'flex', alignItems: 'center', gap: '12px' },
      rowTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
      grow: { flex: '1 1 auto', minWidth: 0 },
      name: { fontSize: '13px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' },
      caption: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', marginTop: '2px', lineHeight: '1.6' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '11px' },
      input: {
        width: '100%',
        boxSizing: 'border-box',
        padding: '7px 10px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: '12px',
        lineHeight: '1.5',
        outline: 'none',
      },
      footer: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
      button: {
        appearance: 'none',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: '8px',
        padding: '7px 14px',
        fontSize: '13px',
        cursor: 'pointer',
      },
      buttonPrimary: {
        appearance: 'none',
        border: '1px solid transparent',
        background: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-state-business-primary))',
        color: 'var(--dsw-alias-label-primary-foreground, #ffffff)',
        borderRadius: '8px',
        padding: '7px 16px',
        fontSize: '13px',
        fontWeight: 500,
        cursor: 'pointer',
      },
      note: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' },
      error: { fontSize: '12px', color: 'var(--dsw-alias-state-error-primary)' },
      switchTrack: {
        position: 'relative',
        width: '38px',
        height: '22px',
        flex: '0 0 auto',
        borderRadius: '11px',
        border: '1px solid transparent',
        padding: 0,
        cursor: 'pointer',
        transition: 'background 120ms ease',
      },
      switchKnob: {
        position: 'absolute',
        top: '2px',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: '#ffffff',
        transition: 'left 120ms ease',
      },
      badge: {
        display: 'inline-block',
        padding: '1px 7px',
        borderRadius: '999px',
        fontSize: '11px',
        lineHeight: '18px',
        border: '1px solid var(--dsw-alias-border-l2)',
        color: 'var(--dsw-alias-label-tertiary)',
      },
    }

    function Switch({ checked, onChange, label }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': label,
          title: label,
          onClick: () => onChange(!checked),
          style: Object.assign({}, S.switchTrack, {
            background: checked
              ? 'var(--dsw-alias-state-business-primary)'
              : 'var(--dsw-alias-border-l3)',
          }),
        },
        h('span', { style: Object.assign({}, S.switchKnob, { left: checked ? '19px' : '3px' }) }),
      )
    }

    function fromServer(data) {
      return {
        auto: data.auto !== false,
        threshold: typeof data.threshold === 'number' ? data.threshold : 2,
        stateFile: typeof data.stateFile === 'string' ? data.stateFile : '',
        skills: Array.isArray(data.skills)
          ? data.skills.map((row) => ({
              name: String(row.name),
              title: typeof row.title === 'string' && row.title ? row.title : String(row.name),
              description: typeof row.description === 'string' ? row.description : '',
              forceOn: row.forceOn === true,
              keywords: Array.isArray(row.keywords) ? row.keywords : [],
              keywordText: Array.isArray(row.keywords) ? row.keywords.join('、') : '',
            }))
          : [],
      }
    }

    function payloadOf(model) {
      const skills = {}
      for (const row of model.skills) {
        const parts = row.keywordText
          .split(/[,，、;；\n]/)
          .map((piece) => piece.trim())
          .filter((piece) => piece.length > 0)
        skills[row.name] = { forceOn: row.forceOn, keywords: parts }
      }
      return { auto: model.auto, threshold: model.threshold, skills }
    }

    function SkillRow({ row, auto, onToggle, onKeywords }) {
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        h(
          'div',
          { style: S.rowTop },
          h(
            'div',
            { style: S.grow },
            h('div', { style: S.row }, [
              h('span', { key: 't', style: S.name }, row.title),
              row.forceOn ? h('span', { key: 'b', style: S.badge }, '固定开启') : null,
            ]),
            h('div', { style: Object.assign({}, S.caption, S.mono) }, row.name),
          ),
          h(Switch, {
            checked: row.forceOn,
            label: `固定开启 ${row.name}`,
            onChange: (next) => onToggle(row.name, next),
          }),
        ),
        auto
          ? h('input', {
              type: 'text',
              style: S.input,
              value: row.keywordText,
              spellCheck: false,
              'aria-label': `${row.name} 触发词`,
              placeholder: '触发词，用顿号或逗号分隔',
              onChange: (event) => onKeywords(row.name, event.target.value),
            })
          : null,
      )
    }

    function LabSkillsSection() {
      const [model, setModel] = useState(null)
      const [error, setError] = useState('')
      const [note, setNote] = useState('')
      const [busy, setBusy] = useState(false)

      useEffect(() => {
        let alive = true
        fetch(API_STATE, { credentials: 'same-origin', headers: { accept: 'application/json' } })
          .then((response) => response.json())
          .then((data) => {
            if (!alive) return
            if (!data || data.ok !== true) throw new Error((data && data.error) || '读取失败')
            setModel(fromServer(data))
          })
          .catch((cause) => {
            if (alive) setError(String((cause && cause.message) || cause))
          })
        return () => {
          alive = false
        }
      }, [])

      const patchSkill = useCallback((name, patch) => {
        setModel((current) => {
          if (!current) return current
          return Object.assign({}, current, {
            skills: current.skills.map((row) => (row.name === name ? Object.assign({}, row, patch) : row)),
          })
        })
        setNote('')
      }, [])

      const save = useCallback(async () => {
        if (!model) return
        setBusy(true)
        setError('')
        try {
          const response = await fetch(API_STATE, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(payloadOf(model)),
          })
          const data = await response.json()
          if (!data || data.ok !== true) throw new Error((data && data.error) || '保存失败')
          setModel(fromServer(data))
          setNote(`已保存 · ${new Date().toLocaleTimeString()}`)
        } catch (cause) {
          setError(String((cause && cause.message) || cause))
        } finally {
          setBusy(false)
        }
      }, [model])

      const reset = useCallback(async () => {
        setBusy(true)
        setError('')
        try {
          const response = await fetch(API_RESET, { method: 'POST', credentials: 'same-origin' })
          const data = await response.json().catch(() => ({ ok: false }))
          if (!data || data.ok !== true) throw new Error('重置失败')
          const fresh = await fetch(API_STATE, { credentials: 'same-origin' }).then((r) => r.json())
          setModel(fromServer(fresh))
          setNote('已恢复默认触发词')
        } catch (cause) {
          setError(String((cause && cause.message) || cause))
        } finally {
          setBusy(false)
        }
      }, [])

      if (error && !model) {
        return h('div', { style: S.wrap }, h('div', { style: S.error }, `lab-skills 设置加载失败：${error}`))
      }
      if (!model) {
        return h('div', { style: S.wrap }, h('div', { style: S.note }, '正在读取 lab-skills 设置…'))
      }

      return h(
        'div',
        { style: S.wrap },
        h(
          'div',
          { style: S.intro },
          '把 5 个实验类技能打包成一组：每一轮新对话开始时，插件读取首条消息，按下面的触发词自动挑出需要的技能交给模型；没被挑中的技能不出现在模型可用列表里，但仍可用 /技能名 手动调用。',
        ),
        h(
          'div',
          { style: S.card },
          h(
            'div',
            { style: S.rowTop },
            h(
              'div',
              { style: S.grow },
              h('div', { style: S.cardTitle }, '自动判定'),
              h(
                'div',
                { style: S.caption },
                '开启时按对话内容筛选；关闭后只保留被“固定开启”的技能，其余全部隐藏。',
              ),
            ),
            h(Switch, {
              checked: model.auto,
              label: '自动判定',
              onChange: (next) => {
                setModel(Object.assign({}, model, { auto: next }))
                setNote('')
              },
            }),
          ),
          model.auto
            ? h(
                'div',
                { style: S.row },
                h('span', { style: S.caption }, '命中阈值'),
                h('input', {
                  type: 'number',
                  min: 1,
                  max: 20,
                  step: 1,
                  value: model.threshold,
                  style: Object.assign({}, S.input, { width: '88px' }),
                  'aria-label': '命中阈值',
                  onChange: (event) => {
                    const next = Number(event.target.value)
                    setModel(
                      Object.assign({}, model, {
                        threshold: Number.isFinite(next) && next >= 1 ? Math.round(next) : 2,
                      }),
                    )
                    setNote('')
                  },
                }),
                h(
                  'span',
                  { style: S.caption },
                  '关键词加权分达到该值即开启（长词 2 分，短词 1 分；默认 2 = 命中一个长关键词）。',
                ),
              )
            : null,
        ),
        h(
          'div',
          { style: S.card },
          h('div', { style: S.cardTitle }, '技能开关'),
          model.skills.map((row) =>
            h(SkillRow, {
              key: row.name,
              row,
              auto: model.auto,
              onToggle: (name, next) => patchSkill(name, { forceOn: next }),
              onKeywords: (name, text) => patchSkill(name, { keywordText: text }),
            }),
          ),
        ),
        h(
          'div',
          { style: S.footer },
          h(
            'button',
            { type: 'button', style: S.buttonPrimary, disabled: busy, onClick: save },
            busy ? '保存中…' : '保存',
          ),
          h('button', { type: 'button', style: S.button, disabled: busy, onClick: reset }, '恢复默认'),
          note ? h('span', { style: S.note }, note) : null,
          error ? h('span', { style: S.error }, error) : null,
        ),
        model.stateFile ? h('div', { style: Object.assign({}, S.note, S.mono) }, model.stateFile) : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'lab-skills',
              order: 32,
              label: () => '实验技能',
            },
            LabSkillsSection,
          ),
        )
      },
    }
  },
})
