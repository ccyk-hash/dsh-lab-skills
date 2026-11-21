---
name: spss-analyst-cn
description: 用本机 IBM SPSS Statistics 做中文实证分析并输出论文级产物。当用户提到 SPSS、统计分析、描述统计、t 检验、方差分析、相关、回归、信度、因子分析、中介调节、问卷数据、.sav 文件，或要求"帮我分析这份数据/出三线表/写结果段落/生成分析报告"时使用。产出 Markdown 结果表、可复现 .sps、.spv 原始结果、300dpi 图表与 Word 三线表报告。
disable-model-invocation: true
---

# SPSS 中文实证分析

把用户的自然语言需求翻译成 SPSS 语法，调用本机 SPSS 引擎执行，产出论文可直接使用的表格与文字。

## 环境事实（已固化，勿改）

| 项 | 值 |
|---|---|
| SPSS 版本 | Statistics 25 |
| 安装路径 | `C:\Program Files\IBM\SPSS\Statistics\25`（**非默认路径**） |
| 内置 Python | `...\Statistics\25\Python3\python.exe`（3.4.3） |
| 引擎 | MCP 服务 `spss`，常驻进程，首次调用冷启动约 30–60 秒 |
| 结果根目录 | `D:\workbuddy\daily use\spss\results\tasks\<任务名>\` |

**关键约束**：调用 SPSS 内置 Python 前必须清空 `PYTHONPATH` 与 `PYTHONHOME`，否则 WorkBuddy 注入的 shim 会让 Python 3.4 直接崩溃（`os.fspath` 不存在）。MCP 服务已在 `mcp.json` 中配置好 `PYTHONPATH=""`。

## 工具选择

| 目的 | 用哪个 | 说明 |
|---|---|---|
| 跑分析、要能写进论文的表格 | `spss_run_table` | **默认首选**。结果走 OMS XLSX 再解析，保留行列结构与多层表头，输出干净 Markdown 表 |
| 只要看结果、不在意排版 | `spss_run_syntax` | 原版文本输出，中文列宽会错位，仅作快速排查 |
| 出图 | `spss_chart` | 导出独立 PNG，`chart_size=200` 时 1600×1000 像素 |
| 要 SPSS 原生排版 | `spss_export` | DOC/XLS/XLSX/HTML/PDF |
| 要 Word 三线表报告 | `spss_make_report` | 读取同任务目录下的表与图，合成 .docx |

## 标准工作流

1. **确认数据**：用 `spss_read_metadata` 或 `spss_file_summary` 看变量、样本量、标签；变量类型决定方法能不能用。
2. **方法前置校验**：
   - 连续变量比较两组 → t 检验；三组以上 → ANOVA + 事后检验
   - 分类变量关联 → 交叉表 + 卡方
   - 量表 → 先 `spss_reliability_alpha`，再 `spss_factor`
   - 中介 → 三步回归（`spss_regression` 多次）或 `spss_mediation`（若可用）
3. **跑分析**：`spss_run_table(syntax=..., output_name="<任务名>", data_file="<绝对路径>")`。同一任务的多条语法合并成一次调用，减少引擎往返。
4. **出图**（需要时）：`spss_chart(chart_syntax=..., output_name="<同一任务名>", data_file=...)`。
5. **写报告**：先逐条读结果表，写中文解读，再调 `spss_make_report(output_name=..., title=..., narrative=...)`。

任务名用英文短横线，例如 `paper1_descriptive`、`survey_ttest`。同一任务名复用同一目录，表格会累积。

## 中文需求 → SPSS 语法

| 用户说法 | 语法要点 |
|---|---|
| 描述统计 / 基本情况 | `DESCRIPTIVES VARIABLES=a b c /STATISTICS=MEAN STDDEV MIN MAX.` |
| 频数 / 人口学分布 | `FREQUENCIES VARIABLES=gender edu.` |
| 交叉表 / 卡方 | `CROSSTABS /TABLES=gender BY edu /STATISTICS=CHISQ.` |
| 两组比较 / 性别差异 | `T-TEST GROUPS=gender(1 2) /VARIABLES=score.` |
| 前后测 | `T-TEST PAIRS=pre WITH post (PAIRED).` |
| 三组以上 | `ONEWAY score BY group /STATISTICS=DESCRIPTIVES /POSTHOC=TUKEY ALPHA(0.05).` |
| 相关 | `CORRELATIONS /VARIABLES=x y z /PRINT=TWOTAIL NOSIG.` |
| 回归 | `REGRESSION /DEPENDENT=y /METHOD=ENTER x1 x2 /STATISTICS=COEFF OUTS R ANOVA.` |
| 信度 | `RELIABILITY /VARIABLES=q1 TO q6 /SCALE('量表') ALL /MODEL=ALPHA.` |
| 因子分析 | `FACTOR /VARIABLES=q1 TO q6 /PRINT=KMO EXTRACTION ROTATION /ROTATION=VARIMAX.` |
| 逻辑回归 | `LOGISTIC REGRESSION y WITH x1 x2 /METHOD=ENTER.` |
| 中介 | 三次回归：c 路径 → a 路径 → c' + b 路径，配 Sobel 或 Bootstrap 说明 |

## 结果目录

```
spss/results/tasks/<任务名>/
├── tables.xlsx        # 结构化结果（可回溯）
├── charts/charts_files/*.png
├── report.docx        # 三线表报告
└── export.doc         # 可选：SPSS 原生导出
```

`.sps` 与 `.spv` 由引擎写在 `spss/results/` 根下，文件名带随机后缀。

## 论文写作规范

- **三线表**：无竖线，顶线与底线粗，表头下线细。`spss_make_report` 已实现。
- **数值**：统一 3 位小数；p 值写 `p = 0.032`，小于 0.001 写 `p < 0.001`（**不要**写 `p = 0.000`）。
- **统计量斜体**：*t*、*F*、*r*、*p*、*M*、*SD*，在正文 Markdown 里用 `*t*`。
- **必报效应量**：t 检验报 Cohen's *d*，ANOVA 报 η²，相关报 *r*，回归报 R² 与 ΔR²。
- **自由度**：t 检验写 `t(198)`，ANOVA 写 `F(2, 197)`。
- **结论要落到业务/理论上**，不要只复述数字。

## 常见故障

| 现象 | 处理 |
|---|---|
| 首次调用超时 | 冷启动 30–60 秒属正常，等待即可；持续失败查 `spss-mcp status` |
| `SPSS not found` | 检查 `SPSS_INSTALL_PATH` 是否指向 `...\Statistics\25` |
| 引擎崩溃 / 假死 | 调用 `spss_reset_engine`，下次调用会重新拉起 |
| 中文乱码 | 结果走 XLSX 通道一般正常；若用文本通道，语法首行加 `SET UNICODE ON.` |
| 表格解析出空 | 该语法不产生"表"（如 SAVE/RECODE），改用 `spss_run_syntax` |
| 图表只有一张 | `OMS /SELECT CHARTS` 需在 GRAPH 之前声明，且每条 GRAPH 都要在 OMS…OMSEND 之间 |

## DSH 环境适配（2026-10-31 实测）

本 skill 由 WorkBuddy 迁移而来，DSH 的工具命名与注册方式不同：

| 项 | 值 |
|---|---|
| 工具实际名 | `mcp__spss__spss_run_table`、`mcp__spss__spss_chart`、`mcp__spss__spss_export`、`mcp__spss__spss_make_report`（下文简写去掉前缀） |
| 注册位置 | `~/.dsh/profiles/desktop/cordis.patch.yml`，以 **`insert:` 列表**形式插入条目 `id: mcp-spss`，插件 `@deepseek-ai/dsh-mcp-client` |
| 生效条件 | patch 文件保存后宿主会热重载，工具即进入模型工具表（无需重启；重启亦保留） |
| 旧路径 | `~/.workbuddy/mcp.json` 是 WorkBuddy 遗留，DSH 不读取 |

**注册要点（踩过的坑）**：DSH 的 patch 层只按 `id` 覆盖/禁用**已存在**的条目；直接写 `- id: mcp-spss` 这类全新条目会被静默丢弃，仅打印
`patch: entry "mcp-spss" not found`。新增插件必须写成
`- insert: [ { id, name, config } ]`（`cordis-plugin-include` 的 `applyEntryPatches`：无 `id` 的 `insert` 直接追加到条目列表根，带 `id` 则要求目标是 `group: true` 条目）。校验命令：

```
cd "C:/Users/pgc/AppData/Local/Programs/DeepSeek Harness/resources/app/dsh/node_modules/@deepseek-ai/dsh"
DSH_HOME="C:/Users/pgc/.dsh" node lib/bin.js --profile <副本profile> --dump-config
```

会话里应见 41 个 `mcp__spss__*` 工具（含 4 个中文增强工具）；若工具表为空，先查注册条目形态与 dump 告警，再查 `spss/venv/Scripts/python.exe -m spss_mcp.cli status`。

## 边界

- 只读用户数据，不修改、不覆盖原始 `.sav`；需要写文件时输出到 `results/tasks/` 下。
- 不执行 `HOST`、`ERASE`、`DELETE FILE` 等破坏性语法。
- 不替用户编造数据或结果；SPSS 报错就如实上报原始错误。
