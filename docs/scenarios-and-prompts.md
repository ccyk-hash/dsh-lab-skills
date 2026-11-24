# 实验技能包：使用场景分析与提示词优化

依据目录：`D:\workbuddy\sutdy\outputs`（1137 文件 / 375 MB，8 个科目目录）
配套工具目录：`D:\workbuddy\sutdy\tools`、`D:\workbuddy\sutdy\tmp\orgch`
工作日志：`D:\workbuddy\sutdy\.workbuddy\memory`

本文只改**提示词文本**，不改技能划分、开关与路由机制（`lib/core.mjs` 的 `keywords`、`threshold`、打分函数、`index.js` 的 provider/工具/路由逻辑全部未动）。

---

## 0 结论摘要

1. 五个技能里，**只有 `chemdraw-automation` 在产出物中有硬证据**：`有机化学_第七版` 第一、二、三章共 51 幅图是 CDXML 交本机 ChemDraw 渲染出来的，第三章还留下 13 组 `cdxml + png + json` 三件套。
2. `latex-automation`、`origin-plot`、`prism-analyst-cn`、`spss-analyst-cn` 在 `outputs` 与 `tools` 中**没有任何产出物**（0 个 `.tex/.bib`、0 个 `.opju/.ogw`、0 个 `.pzfx/.sav/.spv/.sps`，`tools/` 里也没有任何脚本调用 TeX / Origin / Prism / SPSS）。它们的使用场景只能引自各自 `SKILL.md` 已声明的能力边界 + 本机执行器存在性，**不得从产出物反推**。
3. 产出物本身构成了一条与五个技能都无关的第四类流水线：HTML 精讲 + KaTeX→OMML + html2docx + 教材页裁图 + lint 验收。提示词的主要改动就是**把这条流水线从五个技能的语义范围里明确划出去**，并给出误触发词（排版、参考文献、出图、绘图、描述统计）的归属说明。
4. 原提示词的两类缺陷：① 只有「能做什么」，没有「不做什么」，五个技能对「排版 / 出图 / 描述统计」这类本工作区高频词全部误命中；② 缺可追溯锚点，模型无法判断某次出图到底该走 ChemDraw、svgfig 还是裁图。

---

## 1 证据基线（可追溯）

| 事实 | 证据 |
| --- | --- |
| 交付体例 | `*/*/*_精讲.html` = 66，`*/*/*_精讲.docx` = 66（严格成对）；`*/*/figs` 与 `*/*/images` 目录 = 31；`全章整理 / 习题详解 / 合并 / 合集` 类 = 14 |
| 体例规范 | `outputs/整理说明.md`（25 710 B，2026-10-27）：按「教材 → 章节」分级，`<节号>_<标题>_精讲.html` + `.docx` 成对，配 `figs/`、`images/`、`_backup_YYYYMMDD/`；lint 13 条硬规则 + 六项验收 |
| 公式链路 | HTML 用 KaTeX + `$...$`（145 个 html 含行内公式，108 个含 `\frac`）；`tools/h2d.py` 用 `latex2mathml.converter` + `mathml2omml` 转 Word 原生 OMML，`merge_runs` 合并相邻 `m:r` |
| 转档日志 | `outputs/生物化学_上册/第2章_氨基酸、肽和蛋白质/batch4_convert.log`：`CSS 规则数=20`、`标题层级 18 / 表格 2 / 列表 12 / 图片 13 / 公式 0(原生)` |
| 合订本 | `outputs/马克思主义基本原理/交付说明.md`：`mayuan_merge.py` → html2docx → `tblwidth.py` → `cantsplit.py` → `fix_toc.py` → `fix_break.py` → `drop_toc_entry.py`，220 页 / 161 578 字 / 126 表 / 391 标题 |
| **ChemDraw 证据** | `outputs/有机化学_第七版/第一章_绪论/figs/` 21 png + 21 json；`第二章_烷烃和环烷烃/figs/` 17 png + 17 json；`第三章_烯烃和炔烃/figs/` 13 `c3_*.cdxml` + 13 png + 13 json，另 20 幅 `fig3-*`；`第三章_化学性质复习/figs/` 1 `c3r_02` png + json |
| CDXML 头 | `CreationProgram="chemdraw-auto"`、`<!DOCTYPE CDXML SYSTEM "https://static.chemistry.revvitycloud.com/cdxml/CDXML.dtd">`、`BondLength="28.8"`（13/13 文件一致） |
| 出图脚本 | `tmp/orgch/ch1figs.py`「第一章（绪论）配图：全部用 CDXML 交本机 ChemDraw 渲染」；`ch2figs.py`「第二章…全部用 CDXML 交本机 ChemDraw 渲染」；`c3lib.py`「第三章配图排版库：用 CDXML 描述版面，交本机 ChemDraw 渲染」，RDKit CoordGen 键长 14.4 pt；`c4lib.py` 追加 Newman/锯架/椅型/棒棒糖等课本图元；`publish.py` 设 DPI 236.22 并写 `w_px/h_px/w_cm/h_cm` |
| svgfig 证据 | `tools/chemdraw/svgfig.py`：RDKit 出骨架 → 内嵌 `<g transform>` 贴到 pt 画布 → 自绘弯箭头/孤对/虚线框/中文标注（matplotlib `TextPath` 转字形轮廓，`FONT_CN = C:\Windows\Fonts\simsun.ttc`）→ PyMuPDF 600 dpi 栅格化；电子转移箭头 `ARROW = "#B03A2E"` |
| **无 .tex 证据** | `outputs` 下 `.tex` / `.bib` 数量 = 0；28 个 PDF 中 25 个 Producer = Microsoft Word、2 个 = `Skia/PDF m158`（浏览器打印）、1 个 Creator = LibreOffice Writer；**无一份出自 TeX 引擎** |
| LaTeX 反向证据 | `outputs/马克思主义基本原理/04_第四章_资本主义的本质及规律.docx`、`马克思主义基本原理_考试复习合集.docx`：「本章不用 LaTeX，公式一律纯文本」 |
| **无 Origin 证据** | `.opju` / `.ogw` = 0；`tools/` 无 `originpro` 调用；唯一的 matplotlib 产物 `outputs/大学物理学_下册/期中模拟卷/wave17.png`（1955×785，dpi=300，`Software=Matplotlib version3.11.2`）、`wave17d.png` |
| PIL 手绘证据 | `tools/plot_q9.py` 头注释「为《大学物理学》第九章习题解析绘制示意图（PIL 手绘 + 4x 超采样）」，`S = 4`、`PPU = 160`、`CN = "C:/Windows/Fonts/msyh.ttc"` |
| **无 Prism / SPSS 证据** | `.pzfx` / `.sav` / `.spv` / `.sps` = 0；169 个 docx 解包搜 `方差分析|信度|Cronbach|回归系数|显著性|三线表|p<0.0|SPSS|Prism|Origin` 命中 0 |
| 裁图特征 | 物理各章 `figs/` dpi 集中 400；生化 `images/` dpi 96–477 混杂；`fig9-1-1.png` 2408×2082 无 dpi（教材插图弹簧振子五联图） |
| 日志佐证 | `.workbuddy/memory` 中 `latex` 13 处全部指 `latex2mathml`/`mathml2omml` 链路；`origin` 仅 1 处且为 `origin.qq.com` 网址；`prism`/`spss`/`方差分析`/`信度` 0 命中 |

---

## 2 使用场景分析

### 2.1 chemdraw-automation

- **解决什么问题**：把教材里的结构式、反应式、命名题结构、机理图重画成**可编辑的矢量化学图形**，并给出可直接嵌 HTML 的 PNG。
- **触发条件**：出现结构式/反应式/命名题/机理图的重绘或新增需求；输入是 SMILES、名称、或教材页上要复现的结构；产物要进 `figs/` 并被精讲 html 引用。
- **典型输入**：`第三章 figs/ 那 13 张结构式重新出图`、`用 RDKit 画反式烯烃，加电子转移箭头`、`按 SMILES 出这个结构`。
- **典型产出**（三档，均为产出物实物）：
  1. **三件套**：`c3_01..c3_13.cdxml` + `.png` + `.json`，json 只存图尺寸 `{"w_pt": 309.2, "h_pt": 217.2}`，cdxml 头 `CreationProgram="chemdraw-auto"`。
  2. **仅 PNG + 尺寸 json**：第一、二章 38 幅（21 + 17），`publish.py` 统一打 DPI 236.22、json 存 `w_px/h_px/w_cm/h_cm`，cdxml 中间件留在 `tmp/orgch/out/chN` 且未发布。
  3. **单幅机理图**：`第三章_化学性质复习/figs/c3r_02.png`（2886×517，溴鎓离子→背面进攻→1,2-二溴丙烷，无 dpi）。
- **边界（产出物直接证明）**：
  - **不适用**：轨道、能量曲线、过渡态这类纯示意图 —— 第三章同目录下 20 幅 `fig3-*`（`fig3-3_pi_mo`、`fig3-12_energy`、`fig3-13_hydroboration_ts`…）dpi 466–774，是 `tools/chemdraw/svgfig.py` 的 RDKit + matplotlib 产物，**没有一份 cdxml**。
  - **不适用**：教材页裁图 —— 第一、二章虽有原生出图，但同科目其它章节与物理/生化的 `figs/`、`images/` 共 31 个目录是裁切产物。
  - 不做化学推断（不预测产物、不配平、不判构型）。
- **术语保留**：`cdxml`、`CreationProgram=chemdraw-auto`、`BondLength`、`figs/`、`c3_01..c3_13`、`fig3-*`、`svgfig.py`。

### 2.2 latex-automation

- **解决什么问题**：处理 `.tex` 工程 —— 编译、`.log` 归因、缺包缺字体、版面量化、静态检查与格式化。
- **触发条件**：任务对象是 `.tex` 工程，或明确要求用 TeX 引擎出 PDF。
- **典型输入**：`latex 编译报 overfull hbox 怎么修`、`用 latex 排这份讲义`、`.log 里这个错怎么改`。
- **典型产出**（据 `SKILL.md` 声明）：`latex-out/` 下的 PDF + `build-report.json`（按 `root_cause` 因果排序的诊断）。
- **产出物事实**：**本工作区没有这类任务** —— 0 个 `.tex/.bib`，28 个 PDF 无一份出自 TeX 引擎（25 Word / 2 浏览器打印 / 1 LibreOffice）。所以它的场景是「已声明但未被使用」的能力，而非从产出物观察到的习惯。
- **边界（产出物直接证明）**：HTML / docx 精讲的「排版」「参考文献格式」属于 KaTeX→OMML + html2docx 流水线，**不是** LaTeX 工程；这是原提示词最主要的误触发源（`排版`、`参考文献` 各 1 分，两者同时出现即达阈值 2）。
- **术语保留**：`root_cause`、`overfull/underfull`、`孤行/寡行`、`latexindent`、`chktex`、`latex-out/`、`build-report.json`、`D:/Latex/texlive/2026`。

### 2.3 origin-plot

- **解决什么问题**：用 Origin 2024 出出版级图并存可编辑 `.opju` 工程。
- **触发条件**：明确要 Origin 出图、要改已有 `.opju/.ogw`、要出版级模板。
- **典型输入**：`画个 Origin 风格的出版级折线图`、`把这份 CSV 用 Origin 出图并存 .opju`。
- **典型产出**（据 `SKILL.md`）：`.opju` 工程 + PNG/PDF/TIFF/SVG。
- **产出物事实**：`.opju/.ogw` = 0，`tools/` 无 `originpro` 调用 —— 本工作区的图全部来自 matplotlib / PIL / 裁图，**没有 Origin 产出**。
- **边界（产出物直接证明）**：`出图`、`绘图`、`作图`、`曲线拟合` 在本工作区指向两类完全不同的东西 —— ① matplotlib/PIL 手绘（`wave17.png` 元数据 `Software=Matplotlib version3.11.2`；`tools/plot_q9.py` PIL 手绘；第9章 `figs/` 31 幅）；② 教材页裁图（31 个 `figs/images` 目录）。这两类都不该拉起 Origin。
- **术语保留**：`originpro`、`.opju`、`.ogw`、`D:/origin/Origin64.exe`、`C:/Python314/python.exe`。

### 2.4 prism-analyst-cn

- **解决什么问题**：用 GraphPad Prism 8.0.2 原生引擎出统计结果，避免用 scipy 代算。
- **触发条件**：有 `.pzfx` 工程，且分析类型落在 `templates/registry.json` 已登记的三个模板内。
- **典型输入**：`这批数据用 GraphPad 做个 IC50`、`.pzfx 里跑单因素方差分析加 Tukey`。
- **典型产出**：Prism 原生结果表（统计值取自结果页，不由脚本计算）。
- **能力上限（`registry.json` 实物）**：`ttest_two_group`（别名 t检验 / 两组比较 / 两样本比较）、`anova_tukey_one_way`（单因素方差分析 / 多组比较 / tukey）、`linear_regression`（线性回归 / 拟合直线）；`anova_tukey_one_way` 的 `GoTo R2` 会挂死，只能取 R1。
- **产出物事实**：`.pzfx` = 0，无任何 Prism 结果表 —— 本工作区未使用。
- **边界（产出物直接证明）**：169 个 docx 中 `方差分析|信度|Cronbach|回归系数|三线表` 命中 0，说明「方差分析、回归、t 检验」这些通用说法在本工作区**不是 Prism 需求**；信度/因子分析/中介调节不在 Prism 登记表内，应转 `spss-analyst-cn`。
- **术语保留**：`templates/registry.json`、`ttest_two_group`、`anova_tukey_one_way`、`linear_regression`、`.pzfx`、`RecalcAll`、`IC50/EC50`、`Kaplan-Meier`。

### 2.5 spss-analyst-cn

- **解决什么问题**：把中文实证分析需求翻成 SPSS 语法并执行，产出论文级三线表报告。
- **触发条件**：有 `.sav` 问卷/量表数据，或要求描述统计 / t 检验 / 方差分析 / 相关 / 回归 / logistic / Cronbach / 因子分析 / 聚类 / 卡方 / 中介调节，或「分析这份数据 / 出三线表 / 写结果段落」。
- **典型输入**：`这份 .sav 问卷数据跑个方差分析和信度`、`帮我出三线表`。
- **典型产出**（据 `SKILL.md`）：Markdown 结果表、可复现 `.sps`、`.spv` 原始结果、`spss_chart` 的 1600×1000 PNG、`spss_make_report` 合成的 Word 三线表报告，落 `results/tasks/<任务名>/`。
- **产出物事实**：`.sav/.spv/.sps` = 0，无统计结果表 —— 本工作区未使用。
- **边界（产出物直接证明）**：`描述统计` 在本工作区出现过，但语义是「数这学期各章的图数、表数、公式数」（对应 `整理说明.md` 的统计节与 `*/*/figs` 计数），普通脚本即可，不该拉起 SPSS；只要 Prism 原生曲线（IC50、生存曲线）的转 `prism-analyst-cn`。
- **术语保留**：`spss_chart`、`spss_make_report`、`spss_run_table`、`.sav`、`.sps`、`.spv`、`results/tasks/`、`Cronbach`。

### 2.6 五个技能都不覆盖的第四类（原提示词缺失的边界）

| 日常任务 | 归属 |
| --- | --- |
| `<节号>_<标题>_精讲.html` + `.docx` 成对交付 | html2docx / python-docx 流水线 |
| KaTeX `$...$` → Word 原生 OMML | `tools/h2d.py`（latex2mathml + mathml2omml） |
| 「排版」「参考文献格式统一」 | 精讲流水线 + lint 13 条规则，与 TeX 无关 |
| 教材页裁图 | `tools/figs.py`（窗口 + 正文框掩膜 → 墨迹包围盒 → 外扩 6px + 20px 白边 @400 dpi） |
| matplotlib / PIL 手绘示意图 | `tools/plot_q9.py`、`wave17.png` |
| 组卷、合并、标签配平 | `build.py` / `conv_tbl.py` / `fix_*.py` |
| 「数图数、表数、公式数」 | 计数脚本 |

---

## 3 优化后的提示词（完整、可直接替换）

提示词分三层，均由本插件投递给模型。改后长度全部 ≤ 495 字符 —— 技能目录对 `description` 的展示上限是 500 字符，超长会被截断（实测 `latex-automation` 528 字符时尾部 `latexindent、chktex、tex live。` 被切掉）。

### 3.1 第一层：`skills/<id>/SKILL.md` 的 frontmatter `description`（实际送模型的就是这一层）

**`skills/chemdraw-automation/SKILL.md`**（460 字符）

```
description: 在本机 ChemDraw（Windows COM，ProgID ChemDraw_x64.Application，23.1.1.3）绘制/编辑结构式与反应式，产出可编辑 CDXML/CDX 加预览 PNG/EMF。适用：教材习题与复习讲义的结构式、反应式、命名题、机理题插图（有机化学_第七版 第一、二章 figs/ 38 幅原生出图，仅存 PNG；第三章 figs/ c3_01..c3_13 为 cdxml+png+json 三件套，CreationProgram=chemdraw-auto；第三章_化学性质复习 figs/c3r_02 为溴鎓离子机理图）、按 SMILES 或名称出结构、批量改样式导出。不适用：轨道、能量曲线、过渡态等纯示意图走 tools/chemdraw/svgfig.py（RDKit+matplotlib，第三章 fig3-* 20 幅），教材页裁图走裁切流程。本技能不做化学推断。路由词：chemdraw、cdxml、smiles、结构式、化学结构、分子结构、反应式、画结构、化学式。
```

**`skills/latex-automation/SKILL.md`**（491 字符）

```
description: 在本机 TeX Live（D:/Latex/texlive/2026）上跑 .tex 工程：编译出 PDF、把 .log 解析成按 root_cause 因果排序的诊断、缺包缺字体离线安装命令、有界自动修复、版面量化（overfull/underfull/孤行/寡行）与渲染页视觉检查、chktex 与 latexindent、模板建工程；产物落 latex-out/ 并含 build-report.json。仅在处理 .tex 工程时适用（不联网、不自动装包）。不适用：HTML 或 docx 精讲的排版与参考文献，那属于 KaTeX 转 OMML 加 html2docx 的流水线（outputs/ 下 0 个 .tex/.bib，28 个 PDF 无一份出自 TeX 引擎）。路由词：latex、xelatex、pdflatex、lualatex、latexmk、biber、bibtex、tex、.tex、.log、ctex、编译 pdf、排版、参考文献、论文编译、overfull、underfull、孤行、寡行、latexindent、chktex、tex live。
```

**`skills/origin-plot/SKILL.md`**（413 字符）

```
description: 用 originpro COM 桥驱动本机 Origin 2024（D:/origin/Origin64.exe 加 C:/Python314/python.exe）把 CSV/数据表做成出版级散点、折线、柱状图，批量导出 PNG/PDF/TIFF/SVG 并存可编辑 .opju 工程。适用：要 Origin 出图、要改已有 .opju/.ogw 工程、要出版级模板。不适用：matplotlib 或 PIL 手绘示意图（大学物理学_下册 第9章 figs/ 31 幅、期中模拟卷 wave17.png、tools/plot_q9.py 的 PIL 手绘）与教材页裁图（figs/、images/ 共 31 个目录）——出图、绘图、作图、曲线拟合在本工作区多指这两类。路由词：origin、originlab、opju、ogw、origin 画图、origin绘图、origin 绘图、曲线拟合、拟合曲线、作图、出图、绘图。
```

**`skills/prism-analyst-cn/SKILL.md`**（454 字符）

```
description: 用中文一句话调用本机 GraphPad Prism 8.0.2（执行器 D:/workbuddy/daily use/prism8/prism_runner.py）做统计并出结果：统计值一律取自 Prism 原生结果表，脚本只能 RecalcAll 重算，可用分析取决于 templates/registry.json——当前仅 ttest_two_group（别名 t检验/两组比较/两样本比较）、anova_tukey_one_way（单因素方差分析/多组比较/tukey）、linear_regression（线性回归/拟合直线）。适用：.pzfx 工程内的上述三类分析、剂量-反应 IC50/EC50、Kaplan-Meier 生存曲线与 Prism 出图。不适用：无 .pzfx 工程，或信度 Cronbach、因子分析、中介调节等未登记分析——改用 spss-analyst-cn。路由词：prism、graphpad、pzfx、剂量反应、剂量-反应、ic50、ec50、生存曲线、kaplan。
```

**`skills/spss-analyst-cn/SKILL.md`**（495 字符）

```
description: 用本机 IBM SPSS Statistics 25（C:/Program Files/IBM/SPSS/Statistics/25，MCP 服务 spss）把中文需求翻成 SPSS 语法并执行，产出论文级产物：Markdown 结果表、可复现 .sps、.spv 原始结果、spss_chart 的 1600x1000 PNG、spss_make_report 合成的 Word 三线表报告，落 results/tasks/<任务名>/。适用：读写 .sav 问卷/量表数据，描述统计、t 检验、方差分析、相关、回归、logistic、信度 Cronbach、因子分析/主成分、聚类、卡方、中介调节，以及「分析这份数据 / 出三线表 / 写结果段落」。不适用：只要 Prism 原生曲线的 IC50 与生存曲线（改用 prism-analyst-cn）；仅数图表个数这类计数用普通脚本。路由词：spss、.sav、sav 文件、方差分析、回归分析、线性回归、logistic、信度、cronbach、因子分析、主成分、聚类分析、卡方、t 检验、t检验、描述统计、相关分析、问卷数据、量表。
```

### 3.2 第二层：`lib/core.mjs` 的 `SKILL_DEFAULTS[*].description`（SKILL.md 读不到时的回退）

```js
'chemdraw-automation': {
  title: 'ChemDraw 结构式自动化',
  description:
    '在本机 ChemDraw（Windows COM，ProgID ChemDraw_x64.Application，23.1.1.3）绘制/编辑结构式与反应式，产出可编辑 CDXML/CDX 加预览 PNG/EMF；适用于教材习题与讲义的结构式、反应式、命名题、机理题插图（有机化学_第七版 第一、二、三章 figs/，第三章 c3_01..c3_13 为 cdxml+png+json 三件套）；轨道、能量曲线、过渡态等纯示意图走 tools/chemdraw/svgfig.py，教材页裁图走裁切流程；本技能不做化学推断。',
},
'latex-automation': {
  title: 'LaTeX 编译与排错',
  description:
    '在本机 TeX Live（D:/Latex/texlive/2026）上跑 .tex 工程：编译出 PDF、把 .log 解析成按 root_cause 排序的诊断、缺包缺字体离线安装命令、有界修复、版面量化与渲染页检查、chktex/latexindent、模板建工程，产物落 latex-out/ 含 build-report.json；仅处理 .tex 工程（不联网不装包），不适用 HTML 或 docx 精讲的排版与参考文献（那是 KaTeX 转 OMML 加 html2docx 的流水线，outputs/ 下 0 个 .tex/.bib）。',
},
'origin-plot': {
  title: 'Origin 绘图',
  description:
    '用 originpro COM 桥驱动本机 Origin 2024（D:/origin/Origin64.exe 加 C:/Python314/python.exe）把 CSV/数据表做成出版级散点、折线、柱状图，批量导出 PNG/PDF/TIFF/SVG 并存可编辑 .opju；适用于要 Origin 出图、改 .opju/.ogw 工程、出版级模板；matplotlib 或 PIL 手绘示意图与教材页裁图不属于本技能（出图、绘图、作图、曲线拟合在本工作区多指那两类）。',
},
'prism-analyst-cn': {
  title: 'GraphPad Prism 统计分析',
  description:
    '用中文一句话调用本机 GraphPad Prism 8.0.2（D:/workbuddy/daily use/prism8/prism_runner.py）做统计：统计值一律取自 Prism 原生结果表，脚本只能 RecalcAll，可用分析取决于 templates/registry.json（当前仅 ttest_two_group、anova_tukey_one_way、linear_regression）；适用于 .pzfx 工程内这三类分析与 Prism 出图，不适用信度、因子分析、中介调节等未登记分析（改用 spss-analyst-cn）。',
},
'spss-analyst-cn': {
  title: 'SPSS 统计分析',
  description:
    '用本机 IBM SPSS Statistics 25（C:/Program Files/IBM/SPSS/Statistics/25，MCP 服务 spss）把中文需求翻成 SPSS 语法并执行，产出 Markdown 结果表、可复现 .sps、.spv 原始结果、spss_chart 的 1600x1000 PNG、spss_make_report 的 Word 三线表报告，落 results/tasks/<任务名>/；适用于 .sav 问卷/量表数据的描述统计、t 检验、方差分析、相关、回归、logistic、信度 Cronbach、因子分析、聚类、卡方、中介调节，不适用只要 Prism 原生曲线的 IC50 与生存曲线（改用 prism-analyst-cn）。',
},
```

### 3.3 第三层：`index.js` 的 `lab_skills` 工具描述

```js
description:
  'Inspect or change which local lab skills are available in this conversation. chemdraw-automation: ChemDraw COM (ChemDraw_x64.Application 23.x) drawing/editing structures and reaction schemes into editable CDXML/CDX plus PNG/EMF preview — 有机化学_第七版 第一、二章 figs/ (PNG only) and 第三章 figs/c3_01..c3_13 (cdxml+png+json); not for orbitals, energy curves or transition-state sketches (tools/chemdraw/svgfig.py), not for textbook-page crops, and it does no chemistry inference. latex-automation: TeX Live (D:/Latex/texlive/2026) .tex projects — build, root_cause-ordered .log diagnosis, offline package/font fixes, layout metrics, chktex/latexindent; not for HTML/docx 精讲 layout or bibliography (KaTeX→OMML + html2docx pipeline), and outputs/ holds no .tex at all. origin-plot: Origin 2024 via originpro (.opju projects, publication figures) — not for matplotlib/PIL sketches such as 大学物理学_下册 第9章 figs/ or tools/plot_q9.py, not for textbook-page crops. prism-analyst-cn: GraphPad Prism 8.0.2 native result tables; only the analyses registered in templates/registry.json (ttest_two_group, anova_tukey_one_way, linear_regression) — reliability, factor analysis and mediation belong to spss-analyst-cn. spss-analyst-cn: IBM SPSS Statistics 25 — .sav survey/scale data, descriptives, t test, ANOVA, correlation, regression, logistic, Cronbach, factor/principal components, clustering, chi-square, mediation, plus spss_chart PNG and spss_make_report Word three-line tables. The plugin routes them from the first user message; use this tool to inspect the decision, force a skill on/off for this session, or toggle the automatic router.',
```

---

## 4 与场景的逐条对应

| 场景要素 | 落在提示词哪一句 | 技能 |
| --- | --- | --- |
| 结构式 / 反应式 / 命名题 / 机理题重绘 | 「教材习题与复习讲义的结构式、反应式、命名题、机理题插图（…）」 | chemdraw |
| 三件套产出形态 | 「第三章 figs/ c3_01..c3_13 为 cdxml+png+json 三件套，CreationProgram=chemdraw-auto」 | chemdraw |
| 仅 PNG 的产出形态 | 「第一、二章 figs/ 38 幅原生出图，仅存 PNG」 | chemdraw |
| 单幅机理图 | 「第三章_化学性质复习 figs/c3r_02 为溴鎓离子机理图」 | chemdraw |
| 轨道/能量曲线/过渡态改走 svgfig | 「不适用：轨道、能量曲线、过渡态等纯示意图走 tools/chemdraw/svgfig.py（… 第三章 fig3-* 20 幅）」 | chemdraw |
| 不做化学推断 | 「本技能不做化学推断」 | chemdraw |
| `.tex` 工程编译与 `.log` 归因 | 「编译出 PDF、把 .log 解析成按 root_cause 因果排序的诊断」 | latex |
| 缺包缺字体、有界修复 | 「缺包缺字体离线安装命令、有界自动修复」 | latex |
| 版面量化与视觉检查 | 「版面量化（overfull/underfull/孤行/寡行）与渲染页视觉检查」 | latex |
| 静态检查与格式化 | 「chktex 与 latexindent」 | latex |
| 产物位置 | 「产物落 latex-out/ 并含 build-report.json」 | latex |
| HTML/docx 排版与参考文献不是 LaTeX | 「不适用：HTML 或 docx 精讲的排版与参考文献，那属于 KaTeX 转 OMML 加 html2docx 的流水线（… 28 个 PDF 无一份出自 TeX 引擎）」 | latex |
| Origin 出图与 `.opju` 工程 | 「把 CSV/数据表做成出版级散点、折线、柱状图…存可编辑 .opju 工程」 | origin |
| matplotlib / PIL / 裁图不是 Origin | 「不适用：matplotlib 或 PIL 手绘示意图（… wave17.png、tools/plot_q9.py 的 PIL 手绘）与教材页裁图（figs/、images/ 共 31 个目录）」 | origin |
| Prism 只有三个登记分析 | 「可用分析取决于 templates/registry.json——当前仅 ttest_two_group…、anova_tukey_one_way…、linear_regression…」 | prism |
| 统计值取自原生结果表 | 「统计值一律取自 Prism 原生结果表，脚本只能 RecalcAll 重算」 | prism |
| IC50/EC50、生存曲线 | 「剂量-反应 IC50/EC50、Kaplan-Meier 生存曲线」 | prism |
| 信度/因子/中介转 SPSS | 「不适用：…信度 Cronbach、因子分析、中介调节等未登记分析——改用 spss-analyst-cn」 | prism → spss |
| `.sav` 问卷/量表 | 「读写 .sav 问卷/量表数据」 | spss |
| 论文级产物清单 | 「Markdown 结果表、可复现 .sps、.spv 原始结果、spss_chart 的 1600x1000 PNG、spss_make_report 合成的 Word 三线表报告，落 results/tasks/<任务名>/」 | spss |
| 计数类需求不用 SPSS | 「不适用：…仅数图表个数这类计数用普通脚本」 | spss |

---

## 5 删减与合并依据

| 改动 | 原内容 | 依据 |
| --- | --- | --- |
| **删掉「触发词：…」长列表** | 原文以 `触发词：` 列 20+ 个词（如 latex 的「触发词：LaTeX、latex、TeX…渲染页面、LaTeX 自动化」） | 这些词与实际打分用的 `SKILL_DEFAULTS.keywords` **不是同一份**（原文含「缺包」「修复编译错误」「渲染页面」等不在 keywords 里的词），会误导模型以为触发面更宽。改为「路由词：」并**逐字对齐** `lib/core.mjs` 的实际关键词，使描述与实际打分一致 |
| **合并「能做什么」与「什么时候用」** | 原文只有能力罗列 | 每个技能统一改成 `能力 → 适用 → 不适用 → 路由词` 四段式，让边界与能力同权重出现 |
| **新增「不适用」段** | 原文无 | 产出物证据：`排版`/`参考文献` 误命中 latex、`出图`/`绘图` 误命中 origin、`描述统计` 误命中 spss（打分探针实测） |
| **chemdraw 删掉「在 DeepSeek Harness 的 bash 工具里直接执行」** | 原文有此句 | 该句描述执行环境而非能力边界，且与 `lab_skills` 工具描述重复；改由工具描述统一说明 |
| **latex 删掉「Linux/macOS 上同样可用」** | 原文 compatibility 字段含此句 | 本机场景为 Windows + `D:/Latex/texlive/2026`，保留双平台说法会稀释「.tex 工程」这一核心判据；平台信息已在 description 里以具体路径表达 |
| **origin 由英文改中文** | 原文为英文 `Automate Origin 2024 (OriginLab) on this machine…` | 同一插件内其余四条均为中文，统一语种；英文术语 `originpro`/`.opju`/`.ogw` 原样保留 |
| **spss 补 `results/tasks/<任务名>/`** | 原文只说「产出…报告」 | 产出物体例要求落盘路径明确（`outputs/整理说明.md` 的分级体例同理） |
| **prism 补三个模板的别名** | 原文只说「统计值全部来自 Prism 原生引擎」 | `templates/registry.json` 实物登记了别名（t检验/两组比较/两样本比较 等），写明后模型才能把中文口语对上模板 |
| **五条全部压到 500 字符内** | latex 原 528 字符 | 实测技能目录对 description 的展示上限为 500 字符，超长尾部被截断（`latexindent、chktex、tex live。` 丢失） |
| **未改动** | `keywords`、`threshold`、打分函数、provider、`lab_skills` 的 action 集合、`client.js` 设置页 | 用户约束：不改技能划分、开关与路由机制 |

---

## 6 验证记录

- `node --check index.js`、`node --check lib/core.mjs`、`node test/smoke.mjs`（`lab-skills smoke: all checks passed`）、`node test/client-api-base.mjs`（`lab-skills client: all checks passed`）。
- 路由未变：`test/tmp/score-probe2.mjs` 11 条真实语料命中与改动前完全一致 —— `这批问卷数据帮我做个信度分析`→spss:3、`画个 Origin 风格的出版级折线图`→origin:2、`帮我用 latex 排一下这份讲义`→latex:2、`这批数据用 GraphPad 做个 IC50`→prism:4、`latex 编译报 overfull hbox 怎么修`→latex:4，figs/HTML/lint/KaTeX/三线表/PDF 提取类全为 `(none)`。
- 热重载后 `GET /api/lab-skills/state` 返回五条新 description，长度 460 / 491 / 413 / 454 / 495。
- 子代理实测（两个全新会话）：`lab_skills {"action":"catalog"}` → `registry: complete=true total=15`，五条均 `provider=lab-skills source=custom model=yes user=yes`；`<available_skills>` 中五条 description 均为新版且**无截断**；`disable spss-analyst-cn, prism-analyst-cn` 后这两条从目录整体移除；`reset` 后五个全部移除、`active: (none)`，下一条用户消息重新按 threshold=2 判定。
