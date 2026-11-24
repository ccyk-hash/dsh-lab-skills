# 触发词（路由词）优化记录

对象：`@local/dsh-lab-skills` 五个技能的触发词表。

- 词表真身：`lib/core.mjs` 的 `SKILL_DEFAULTS[*].keywords`。
- 送模型的说明文本：`skills/<id>/SKILL.md` frontmatter 的 `description`，末尾「路由词：」段与上面逐字一致。
- 运行时生效值：`C:\Users\pgc\.dsh\dsh-lab-skills\state.json` 的 `skills[*].keywords`（状态文件优先于默认值，`index.js:114`）。

三处必须同步；本记录描述的是同步后的最终状态。

## 0. 打分规则（未改动）

| 项 | 规则 |
| --- | --- |
| 权重 | `keywordWeight(k) = normalizeText(k).length >= 4 ? 2 : 1`（CJK 按字符数：4 字=2 分，3 字及以下=1 分） |
| 匹配 | 纯 ASCII 且形如 `^[a-z0-9][a-z0-9 ._+-]*$` 走词边界正则 `(?<![a-z0-9])kw(?![a-z0-9])`；含 CJK 走 `includes` |
| 阈值 | `threshold = 2`，即单条消息累计 ≥2 分才点亮该技能 |
| 决策时机 | 每个会话首条实质消息定一次，其后 6 条内只做并集追加，从不撤销 |

因为阈值是 2、单字/三字词只值 1 分，**一个短词单独出现无法点亮技能**，这是本次多处「加词但不生效」与「删词收益大」的根本原因。

## 1. chemdraw-automation

现有（9）：`chemdraw`、`cdxml`、`smiles`、`结构式`、`化学结构`、`分子结构`、`反应式`、`画结构`、`化学式`

调整后（17）：`chemdraw`、`cdxml`、`cdx`、`smiles`、`inchi`、`molfile`、`结构式`、`结构式图`、`化学结构`、`分子结构`、`反应式`、`画结构`、`化学式`、`命名题`、`机理`、`机理图`、`骨架结构`

| 动作 | 词 | 理由 |
| --- | --- | --- |
| 增 | `cdx` | 技能产物是 CDXML/CDX 两种格式，原文只说 cdxml；`导出 cdx` 这类说法此前落空。 |
| 增 | `inchi` | SKILL.md 首段声明「把 SMILES / InChI / molfile / 名称变成可编辑的 ChemDraw 文档」，InChI 是已声明的输入格式但不在词表。 |
| 增 | `molfile` | 同上，已声明的第三种输入格式。 |
| 增 | `结构式图` | 本机实际表述（`第三章 13 张结构式图重新出图`）用「结构式图」而非「结构式」；4 字=2 分，可单独点亮。 |
| 增 | `命名题` | 第三章习题配图的图注原文即「第（一）题：命名题的六个结构」，是本机真实任务类别。 |
| 增 | `机理` | outputs 的 HTML 里「机理」出现 608 次，是本机高频术语；`机理图` 与 `机理` 叠加才够 2 分（单用 `机理` 只有 1 分）。 |
| 增 | `机理图` | `第三章_化学性质复习/figs/c3r_02` 就是溴鎓离子机理图，本机确有该类出图任务。 |
| 增 | `骨架结构` | `把 c2_01 那个拼版图里的 16 个骨架结构重画一遍` 是真实漏触发案例；4 字=2 分，可单独点亮。 |
| 删 | — | 无删减。 |

未采纳：`命名`（2 字=1 分，单独仍不够阈值，且会与「命名规则」等普通表述混淆）、`化学`（过宽，会命中所有化学类消息）。

## 2. latex-automation

现有（23）：`latex`、`xelatex`、`pdflatex`、`lualatex`、`latexmk`、`biber`、`bibtex`、`tex`、`.tex`、`.log`、`ctex`、`编译 pdf`、`编译pdf`、`排版`、`参考文献`、`论文编译`、`overfull`、`underfull`、`孤行`、`寡行`、`latexindent`、`chktex`、`tex live`

调整后（21）：`latex`、`xelatex`、`pdflatex`、`lualatex`、`latexmk`、`biber`、`bibtex`、`tex`、`.tex`、`.bib`、`ctex`、`tex live`、`编译 pdf`、`编译pdf`、`论文编译`、`overfull`、`underfull`、`孤行`、`寡行`、`latexindent`、`chktex`

| 动作 | 词 | 理由 |
| --- | --- | --- |
| 增 | `.bib` | biber/bibtex 已声明，但 `.bib` 文件本身不在词表；`参考文献` 删除后需要一个指向真实参考文献文件的后缀词。 |
| 删 | `排版` | 本工作区的「排版」几乎全指 HTML/docx 精讲流水线（python-docx + KaTeX→OMML），与 TeX 无关。实测两例误触发：`这份精讲排版有点问题…编译成 pdf`、`第二章_烷烃和环烷烃_全章整理.html 的排版…`，删后均归 `(none)`。 |
| 删 | `参考文献` | 同上，指精讲里统一参考文献格式（docx 侧），不是 .bib/BibTeX。两条误触发案例各含 `参考文献`，是主要致误词。 |
| 删 | `.log` | `batch4_convert.log 里图片数是多少` 属于 html2docx 转档日志，被误判为 LaTeX 编译日志。真正的 LaTeX 日志场景仍由 `latex`/`tex`/`overfull`/`ctex` 等词覆盖（`.tex 工程编译不过，帮我看看 log` 实测仍命中 3 分）。 |

保留说明：`tex` 是 3 字 1 分，但配合 `latex`/`.tex` 等总能达标；`排版`/`参考文献` 删除后，`帮我用 latex 排一下这份讲义` 仍由 `latex` 单独 2 分命中，未损失正例。

## 3. origin-plot

现有（12）：`origin`、`originlab`、`opju`、`ogw`、`origin 画图`、`origin绘图`、`origin 绘图`、`曲线拟合`、`拟合曲线`、`作图`、`出图`、`绘图`

调整后（8）：`origin`、`originlab`、`originpro`、`opju`、`ogw`、`origin 画图`、`origin绘图`、`origin 绘图`

| 动作 | 词 | 理由 |
| --- | --- | --- |
| 增 | `originpro` | 技能的实现方式就是 originpro COM 桥（SKILL.md 首段「用 Python 驱动本机 Origin 2024…」），`originpro` 是本机环境里真实存在的包名/术语。 |
| 删 | `曲线拟合` | 本工作区的曲线拟合/拟合直线都是脚本侧（scipy/Prism linear_regression），不是 Origin 工程；4 字词值 2 分，误触发威力最大。 |
| 删 | `拟合曲线` | 同上。 |
| 删 | `作图` | 泛词，物理/生化侧作图全走 PIL/matplotlib；2 字=1 分但常与其它词叠加致误。 |
| 删 | `出图` | 泛词。`这批教材页裁图出图尺寸不一致`、`第三章 13 张结构式图重新出图` 都被它拉到 origin:1，叠加其它词后可能翻过阈值。 |
| 删 | `绘图` | 泛词。`把 wave17.png 这张波形图重新绘图` 是 matplotlib 任务，此前被判 origin:1。 |

删除后 origin 只剩「品牌/工程/产物格式」类强特征词，`origin` 本身 6 字=2 分仍可单独点亮（`画个 Origin 风格的出版级折线图` 实测 2 分，未变）。

## 4. prism-analyst-cn

现有（10）：`prism`、`graphpad`、`pzfx`、`剂量反应`、`剂量-反应`、`ic50`、`ec50`、`生存曲线`、`kaplan`、`graphpad prism`

调整后（11）：`prism`、`graphpad`、`graphpad prism`、`pzfx`、`剂量反应`、`剂量-反应`、`ic50`、`ec50`、`生存曲线`、`kaplan`、`tukey`

| 动作 | 词 | 理由 |
| --- | --- | --- |
| 增 | `tukey` | `templates/registry.json` 里 `anova_tukey_one_way` 的 aliases 明确含 `tukey`；本机真实说法「Prism 里跑个单因素 ANOVA 加 Tukey」此前只有 `prism` 一项 2 分，加 `tukey` 后 4 分，指向更确定。 |
| 删 | — | 无删减。`剂量反应`/`生存曲线` 等虽是统计术语，但只有 Prism 侧声明支持这类原生曲线（spss 侧不登记），保留不会与 spss 冲突。 |

未采纳：`anova`、`anova_tukey_one_way`、`单因素方差分析` —— 这些是 spss 与 prism 的共有说法，加进 prism 会抢走 spss 的正例；`tukey` 才是 Prism 模板里的专属别名。

## 5. spss-analyst-cn

现有（19）：`spss`、`.sav`、`sav 文件`、`方差分析`、`回归分析`、`线性回归`、`logistic`、`信度`、`cronbach`、`因子分析`、`主成分`、`聚类分析`、`卡方`、`t 检验`、`t检验`、`描述统计`、`相关分析`、`问卷数据`、`量表`

调整后（20）：`spss`、`.sav`、`sav 文件`、`方差分析`、`回归分析`、`线性回归`、`logistic`、`信度`、`cronbach`、`因子分析`、`主成分`、`聚类分析`、`卡方`、`t 检验`、`t检验`、`相关分析`、`问卷数据`、`量表`、`中介调节`、`三线表`

| 动作 | 词 | 理由 |
| --- | --- | --- |
| 增 | `中介调节` | SKILL.md 的适用清单里已声明「中介调节」，且明确「未登记分析改用 spss」；`做个中介调节检验` 此前完全不命中。 |
| 增 | `三线表` | `spss_make_report` 的产物就是 Word 三线表，是本技能最独特的交付物形态；`出三线表` 此前不命中。 |
| 删 | `描述统计` | 本工作区的「描述统计」是「数各章图数、表数、公式数」这类计数，普通脚本即可，不是 SPSS 描述统计。实测该例删后归 `(none)`。 |

## 6. 验证

### 6.1 语料对比探针

`test/tmp/probe_final.mjs` 对 34 条真实语料（从 `D:\workbuddy\sutdy\outputs` 的任务表述与既有误/漏触发案例中整理）分别用新旧词表各跑一遍：

```
fixed=7  regressed=0  stillBad=1  total=34
```

修复项（旧 → 新）：

| 语料 | 旧 | 新 |
| --- | --- | --- |
| `这份精讲排版有点问题，参考文献格式统一一下，然后编译成 pdf 交给我` | latex:3[排版\|参考文献] | `(none)` |
| `第二章_烷烃和环烷烃_全章整理.html 的排版和参考文献要按模板统一` | latex:3 | `(none)` |
| `batch4_convert.log 里图片数是多少` | latex:2[.log] | `(none)` |
| `统计一下这学期各章的图数、表数、公式数，做个描述统计` | spss:2[描述统计] | `(none)` |
| `把 c2_01 那个拼版图里的 16 个骨架结构重画一遍` | `(none)` | chemdraw:2[骨架结构] |
| `画个溴鎓离子机理图` | `(none)` | chemdraw:2[机理\|机理图] |
| `做个中介调节检验，出三线表` | `(none)` | spss:3[中介调节\|三线表] |

增强项（不改变归属，只提高把握度）：`Prism 里跑个单因素 ANOVA 加 Tukey` prism:2→4；`第三章 13 张结构式图重新出图，导出 png 和 cdxml` chemdraw:3→5。

回归项：0。latex 正例（`latex 编译报 overfull hbox 怎么修`=4、`这个 .tex 工程编译不过，帮我看看 log`=3、`帮我用 latex 排一下这份讲义`=2、`overfull 警告太多，版面量化一下`=2、`论文编译失败，缺 ctex 宏包`=4）、prism 正例、spss 正例全部保持原分值；origin 的四个反例（`这批教材页裁图出图尺寸不一致`、`把 wave17.png 这张波形图重新绘图`、`第9章 figs 那 31 幅图 dpi 不对`、`用 PIL 重画这张示意图`）在新旧词表下均为 `(none)`。

### 6.2 未修复项（已知边界）

`这道命名题的六个结构画出来` 仍为 `(none)`：`命名题` 3 字 = 1 分，单独出现达不到 threshold=2。把 `命名`（2 字 = 1 分）也加进去仍只有 1 分（两词不重复计分），且会误伤「命名规则」等普通表述，故不做。可行的绕法是让这类任务带上格式词（`结构式`、`cdxml`）或直接 `lab_skills {"action":"enable","skills":["chemdraw-automation"]}`。

### 6.3 会话实测

两个独立子代理（= 两个全新会话）：

- `把 c2_01 那个拼版图里的 16 个骨架结构重画一遍` → `active: chemdraw-automation`，`chemdraw-automation: ON score=2 (骨架结构)`，其余四个 off；该会话技能目录里 `-automation`/`-plot` 类只有 `chemdraw-automation`。
- 只调 `lab_skills status`（无任务语料）→ 五个全 ON，每项 score=2，命中词分别是各自的品牌名（`chemdraw`/`latex`/`origin`/`prism`/`spss`）——这是探针提示词里逐字列了五个技能名的结果，属预期行为，不是误触发。

### 6.4 一致性校验

```
chemdraw-automation descLen=499 listed=17 defaults=17 SAME <=500
latex-automation    descLen=489 listed=21 defaults=21 SAME <=500
origin-plot         descLen=404 listed=8  defaults=8  SAME <=500
prism-analyst-cn    descLen=475 listed=11 defaults=11 SAME <=500
spss-analyst-cn     descLen=499 listed=20 defaults=20 SAME <=500
ALL CONSISTENT
```

`description` 上限 500 字符（技能目录展示会截断，实测 528 字符被切到 500），五条均在限内。

`node --check index.js`、`node --check lib/core.mjs`、`node test/smoke.mjs`（`all checks passed`）、`node test/client-api-base.mjs`（`all checks passed`）全绿。

`curl -s http://127.0.0.1:5972/api/lab-skills/state` 返回五组新词表与对应 description 长度（499/489/404/475/499），`auto=true`、`threshold=2`、五个 `forceOn=false`。

## 7. 未改动项

技能划分、provider 注册与层级、rank、`threshold`、打分函数、开关语义（`modelInvocable`）、`lab_skills` 工具动作、Web 设置页与 API 一律未动。`description` 除末尾「路由词：」段外，正文（适用/不适用范围）逐字保留。
