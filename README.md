# dsh-lab-skills

把 5 个实验/排版类技能打包成一个 DeepSeek Harness 插件，并且**每条新对话开始时自动判断该开哪几个**。

> 安装（任选其一）
>
> ```bash
> # A. 直接装 GitHub 仓库
> #    DSH 里：plugin_manager → action: install_bundle → target: github:ccyk-hash/dsh-lab-skills
> # B. 先克隆再按目录装（离线/改代码时用）
> git clone https://github.com/ccyk-hash/dsh-lab-skills.git
> #    DSH 里：plugin_manager → action: install_bundle → target: <克隆目录的绝对路径>
> ```
>
> 要求：DSH ≥ 0.2.1-rc.2、Node ≥ 20。装完在 设置 → 实验技能 里能看到 5 个开关即生效。

| 技能 | 目录 | 干什么 |
| --- | --- | --- |
| `chemdraw-automation` | `skills/chemdraw-automation` | 驱动本机 ChemDraw 画结构式/反应式，导出 CDXML |
| `latex-automation` | `skills/latex-automation` | 编译 LaTeX 出 PDF、.log 诊断、版面检查、模板工程 |
| `origin-plot` | `skills/origin-plot` | Origin 作图、批量导出出版级图 |
| `prism-analyst-cn` | `skills/prism-analyst-cn` | GraphPad Prism 统计分析（t 检验/ANOVA/剂量反应） |
| `spss-analyst-cn` | `skills/spss-analyst-cn` | SPSS 中文实证分析，出三线表与 Word 报告 |

技能正文（`SKILL.md` 及脚本、模板等资产）随插件一起打包在包内 `skills/`，**不再依赖** `~/.dsh/skills` 下的副本。

## 三个需求的实现方式

### 1. 打包

`skills/` 下是 5 个技能的完整目录拷贝；Host 侧 `ctx.skills.registerProvider()` 把每一个都注册成一个 skill 候选，`get()` 时才读 `SKILL.md` 正文（剥离 frontmatter），`resourceBase` 指向包内目录，脚本与模板保持可访问。

### 2. 逐个开关

设置页（设置 → 实验技能）为每个技能提供一个开关：

- **固定开启**：不管对话说了什么，这个技能始终对模型可见。
- 关掉且没命中触发词：技能从模型可见目录里消失，但 `userInvocable` 恒为真，仍然可以 `/latex-automation` 这样手动调用。

契约细节：`~/.dsh/skills` 里的同名技能以 `user-dsh`（rank 400）由内置 provider 注册，而技能注册表**先按层合并、同层才比 rank**（近层同名直接覆盖远层）。只有在 agent 自己的 context 里注册 provider，才能落到与该内置 provider 相同的最近一层，再用 **rank 50 对 400** 胜出；仅在 host 层注册会被外层覆盖，开关随之失效。因此插件在每个 `agent/created` 里用 `agent.ctx.inject(['skills'], …)` 注册一份 provider，另在 host 层保留一份供无 scope 的目录读取。

provider **始终返回全部 5 条**，用 `invocation.modelInvocable` 表达开关。如果直接“不返回”，被覆盖的内置条目会重新冒出来，开关就失效了。

### 3. 每轮新对话自动判定

- 监听 `agent/inbox/inserted`，取该会话第一条用户消息的文本。
- 用关键词加权打分（长词/多字短语 2 分，短词 1 分；ASCII 触发词按词边界匹配，避免 `tex` 命中 `text`、`origin` 命中 `original`），达到阈值（默认 2）即判为需要。
- 结果按 agent 存在内存里（`WeakMap`），只影响该会话；随后的消息只能**追加**技能，不会撤销，避免首轮误判把技能永久关掉。
- 判定后调用 provider 的 `control.invalidate()`，`skills` 服务立刻重算目录，本轮的技能清单就是判定结果。
- 自动判定可整体关闭：关闭后只剩“固定开启”的技能。

## 设置页

设置 → **实验技能**（`settings.section` slot 内的 React 组件，只用 `--dsw-alias-*` 主题 token）：

- 自动判定总开关
- 命中阈值
- 5 个“固定开启”开关
- 每个技能的触发词可逐条编辑（顿号/逗号分隔）
- 恢复默认

设置页通过两条本地路由读写状态：`GET/POST /api/lab-skills/state`、`POST /api/lab-skills/reset`（node handler，写前用 `ctx.connection.requestRejection` 拦跨站请求）。

状态文件：`%DSH_HOME%`（默认 `~/.dsh`）`/dsh-lab-skills/state.json`

```json
{
  "version": 1,
  "auto": true,
  "threshold": 2,
  "skills": {
    "latex-automation": { "forceOn": false, "keywords": ["latex", "xelatex", "..."] }
  }
}
```

## Agent 工具 `lab_skills`

模型侧兜底，也可以自己在会话里调：

| action | 作用 |
| --- | --- |
| `status` | 显示本次对话的判定来源、每个技能的分数与命中词、当前可见集合 |
| `catalog` | 查技能注册表**真实**解析结果（每条由哪个 provider 提供、`modelInvocable` 真假），用于自检开关是否真的生效 |
| `enable` / `disable` | 本次会话强制启用/隐藏若干技能（`skills: ["all"]` 表示全部） |
| `reset` | 忘掉本次对话的判定，下一条消息重新判 |
| `set_auto` | 切换自动判定（写状态文件，全局生效） |

## 安装

```bash
node --version   # >= 20
node test/smoke.mjs
```

在 DSH 里：`plugin_manager` → `install_bundle`，target 指向本目录。安装后 profile 会多一行 `lab-skills` 的 patch 与一个符号链接。改动 Host 代码后需重启 profile 才生效。

## 结构

```
index.js             Host：provider、首轮判定、lab_skills 工具、两条 web 路由
client.js            Client：设置页 slot 组件（window.__ModuleLoader__）
lib/core.mjs         状态存取、SKILL.md 解析、关键词打分
skills/              5 个技能目录（含脚本与模板）
cordis.patch.yml     bundle patch
locale/{zh,en}.json  插件页标题与说明
icon.svg             插件图标
test/smoke.mjs       离线集成测试（假 cordis ctx 驱动全流程）
```

## 验证记录（本机实测）

派两个独立子代理（各自就是一次全新会话）做黑盒验证，用 `lab_skills action=catalog` 交叉核对注册表真实解析结果：

| 子代理首条消息 | 判定结果 | `<available_skills>` 里出现的实验技能 |
| --- | --- | --- |
| 提到 `.tex` / overfull hbox | `latex-automation` ON（score 5） | 只有 `latex-automation` |
| 「解释光合作用」 | 全 off | 五个都不出现 |

修复前同一探针会看到 `latex-automation` 仍由内置 provider（`source=user-dsh`）露出；改为 agent 层注册后，五条的 `provider` 全部变成 `lab-skills`，开关才真正生效。

设置页：应用内「设置」侧栏出现「实验技能」一栏（`settings.section` slot 注册成功）。改完开关点保存后，`/api/lab-skills/state` 立即返回新值，下一次目录读取随判定更新。
