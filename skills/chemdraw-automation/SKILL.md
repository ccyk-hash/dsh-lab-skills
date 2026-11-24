---
name: chemdraw-automation
description: 在本机 ChemDraw（Windows COM，ProgID ChemDraw_x64.Application，23.1.1.3）绘制/编辑结构式与反应式，产出可编辑 CDXML/CDX 加预览 PNG/EMF。适用：教材习题与复习讲义的结构式、反应式、命名题、机理题插图（有机化学_第七版 第一、二章 figs/ 38 幅原生出图，仅存 PNG；第三章 figs/ c3_01..c3_13 为 cdxml+png+json 三件套，CreationProgram=chemdraw-auto；第三章_化学性质复习 figs/c3r_02 为溴鎓离子机理图）、按 SMILES 或名称出结构、批量改样式导出。不适用：轨道、能量曲线、过渡态等纯示意图走 tools/chemdraw/svgfig.py（RDKit+matplotlib，第三章 fig3-* 20 幅），教材页裁图走裁切流程。本技能不做化学推断。路由词：chemdraw、cdxml、cdx、smiles、inchi、molfile、结构式、结构式图、化学结构、分子结构、反应式、画结构、化学式、命名题、机理、机理图、骨架结构。
license: MIT
compatibility: Windows only（MSYS bash 下调用）。需要本机已安装并授权的桌面 ChemDraw 23.x（ProgID ChemDraw_x64.Application），以及一个装了 rdkit + pywin32 + lxml 的 Python 3.10–3.13。COM 自动化在 WSL/Linux/无桌面会话中不可用。
allowed-tools: Read Write Edit Bash Glob Grep
metadata:
  version: "0.2-dsh"
  last-reviewed: "2026-11-18"
  skill-author: adapted for DeepSeek Harness from the WorkBuddy skill chemdraw-automation
  upstream: C:\Users\pgc\.workbuddy\skills\chemdraw-automation
  verified-on: "DSH bash + ChemDraw Professional 23.1.1.3 + Python 3.12.14 + RDKit 2026.09.2"
disable-model-invocation: true
---

# chemdraw-automation：在 DSH 里驱动本机 ChemDraw 出图

把 SMILES / InChI / molfile / 名称变成**可编辑的 ChemDraw 文档**（CDXML/CDX），附带 PNG/EMF 预览；
也支持反应式、批量网格，以及对已有 CDXML/CDX 的原子/键/文本编辑。

本 skill 是 WorkBuddy 版 `chemdraw-automation` 的 DSH 适配版。代码与算法一致，**改的是执行入口、
输出落点和文档里的命令语法**。差异清单见 `README-DSH.md`。

## 唯一入口（先看这条）

```bash
bash "C:/Users/pgc/.dsh/skills/chemdraw-automation/chemdraw-auto.sh" doctor
```

约定 `SKILL_DIR` = 本 skill 根目录（本机为 `C:\Users\pgc\.dsh\skills\chemdraw-automation`）。
后续示例一律写成 `bash "$SKILL_DIR/chemdraw-auto.sh" <子命令> ...`。

包装脚本负责四件事，不要绕开它直接点 `chemdraw-auto.exe`：

1. 挑一个**同时装好 rdkit + pywin32 + lxml** 的 Python 3.10–3.13（顺序：`$CHEMDRAW_PYTHON` →
   本 skill `.venv` → 上游 WorkBuddy `.venv` → uv 的 3.12 → PATH 上的 `python`）；都不可用时
   直接返回 `{"ok": false, ... "EnvironmentError"}`。
2. 把 `SKILL_DIR` 放到模块搜索首位，保证运行的是**本 skill 里的源码**。
3. 给 `draw/reaction/grid/edit/export` 自动补 `--out`：缺省 `$PWD/chemdraw-out`（会话工作区内），
   相对 `--out` 按**调用者当前目录**解析成绝对路径。
4. `--input / --patch / --mol-file` 若是调用者目录下真实存在的相对路径，转成绝对路径再交给 Python
   （`--patch` 仍支持内联 JSON）。

## DSH 环境下的硬约束

1. **产物必须落在会话工作区**。DSH 默认 `workspace-write`：写 `D:\workbuddy\...`、`C:\Users\...`
   之类工作区外的路径会被沙箱拒绝（`Permission denied`）。默认输出 `./chemdraw-out/` 就是为此设的；
   要换目录请给工作区内的绝对路径。
2. **命令用 bash 语法**，不是 PowerShell：不要 `& $cd`、不要反引号续行；路径用 `"C:/Users/..."`。
3. **不碰用户正在编辑的文档**，任何情况下不调用 `App.Quit()`。`--keep-open` 也是新开文档。
4. **不要调用 `Objects.Clean`**（代码里也没调）：它移动分子却不移动标注，会毁版面。
5. `--name` 会走 PubChem（需要出网）。DSH 的 shell 网络受策略代理约束，不通时改用 SMILES/InChI，
   不要把网络失败当成 ChemDraw 故障。

## 核心事实（勿违背）

| 事实 | 说明 |
|---|---|
| 仅 Windows | 通过 COM 连接已安装、已授权的桌面 ChemDraw（ProgID `ChemDraw_x64.Application`，本机 **23.1.1.3**） |
| 产物是可编辑文档 | CDXML/CDX 是主产物；PNG/EMF 只是预览 |
| 不做化学推断 | 不预测产物、不配平；反应式必须显式给 `reactants>agents>products`，条件与产率只是文本 |
| 无 SVG/PDF | 23.1.1 的 COM `SaveAs` 只暴露 CDX/CDXML/PNG/TIFF/JPEG/GIF/BMP/EMF；矢量请用 `emf` |
| 布局 | RDKit **CoordGen**，键长 14.4 pt；不要用 `Objects.Clean` 重排 |
| 颜色 | 未显式 `color="0"` 的元素会用调色板索引 1（白色），在白底上等于隐形 |

## 环境事实（本机实测 2026-11-18，DSH 内）

| 项 | 值 |
|---|---|
| skill 根 | `C:\Users\pgc\.dsh\skills\chemdraw-automation` |
| 执行器 | `chemdraw-auto.sh` → `python -m chemdraw_auto` |
| Python（实测） | 3.12.14（`C:\Users\pgc\.workbuddy\skills\chemdraw-automation\.venv\Scripts\python.exe`，被包装脚本自动复用） |
| 依赖 | RDKit 2026.09.2、pywin32 33x、lxml、Pillow、pytest |
| ChemDraw | ChemDraw Professional 23.1.1.3，`doctor` 返回 `ok: true` |
| 默认输出 | `<调用者 cwd>/chemdraw-out/` |

若包装脚本报 `EnvironmentError`（找不到合格解释器），在工作区内重建环境：

```bash
cd "$SKILL_DIR"
"/c/Users/pgc/AppData/Roaming/uv/python/cpython-3.12.14-windows-x86_64-none/python.exe" -m venv .venv
"./.venv/Scripts/python.exe" -m pip install -e . 
```

（Python 3.10–3.13；**不要用 3.14**，RDKit/pywin32 轮子不全。）

## 标准流程

1. `doctor`：确认 `ok: true` 且 `chemdraw` 带版本号。失败先排查 ChemDraw 是否启动/授权。
2. 选输入：**优先 SMILES**（离线可靠）；名称仅在有网时用，失败就退回 SMILES。
3. 调 `draw` / `reaction` / `grid` / `edit`，产物写进工作区。
4. 需要核对时调 `inspect`（原子数、元素组成、片段、箭头、文本），或用 `read_image` 看一眼 PNG。
5. 汇报：产物路径 + 结构/反应摘要 + 可直接在 ChemDraw 继续编辑。

## 命令

```bash
SKILL_DIR="C:/Users/pgc/.dsh/skills/chemdraw-automation"
CD() { bash "$SKILL_DIR/chemdraw-auto.sh" "$@"; }

# 0) 体检
$CD doctor

# 1) 单分子：SMILES / InChI / 名称 / molfile
$CD draw --smiles "CC(=O)Oc1ccccc1C(=O)O" --title "Aspirin" --stem aspirin \
  --formats cdxml,cdx,png --dpi 300

$CD draw --name "caffeine" --title "Caffeine" --stem caffeine --formats cdxml,png

# 2) 反应式：reactants>agents>products（点号分隔多组分，agents 可留空）
$CD reaction \
  --reaction "O=C(O)c1ccccc1O.CC(=O)OC(C)=O>Ac2O>CC(=O)Oc1ccccc1C(=O)O.CC(=O)O" \
  --conditions "H2SO4 (cat.), rt, 2 h" --yield "85%" --title "Aspirin synthesis" \
  --stem aspirin_synthesis --formats cdxml,cdx,png --dpi 300

# 3) 批量网格（JSON: [{"smiles":"...","caption":"..."}]）
$CD grid --input "$SKILL_DIR/examples/items.json" --columns 3 --stem scope --formats cdxml,png

# 4) 编辑已有 CDXML/CDX（patch 见下；也给 JSON 文件路径）
$CD edit --input figure.cdxml --patch '{"texts":[{"id":77,"text":"Revised title"}]}' \
  --stem figure_v2 --formats cdxml,png

# 5) 检查 / 仅导出
$CD inspect --input figure.cdxml
$CD export --input figure.cdx --stem figure_png --formats png,cdxml

# 6) 留在 ChemDraw 里继续编辑（新开文档，不碰用户文档）
$CD draw --smiles "CCO" --stem ethanol --keep-open
```

成功输出：

```json
{"ok": true, "files": ["...cdxml", "...png"], "cdxml": "...cdxml", "meta": {...}, "error": null}
```

失败时 `ok: false`，`error` 给出原因，退出码 1（找不到解释器是 3）。**把 `error` 原样告诉用户，
不要假装成功。**

## 定位原子/键/文本 id

`inspect` 只给汇总，不给逐个 id。需要精确 id 时直接读文档：

```bash
grep -oE '<(n|b|t)[^>]*id="[0-9]+"' figure.cdxml | head
```

或解析文本节点（CDXML 的属性会换行，需按 XML 解析而不是行匹配）：

```bash
"$SKILL_DIR/.venv/Scripts/python.exe" - <<'PY'
from lxml import etree
t = etree.parse("figure.cdxml")
for el in t.getroot().iter():
    if etree.QName(el).localname == "t" and el.get("id"):
        print(el.get("id"), "".join(el.itertext()).strip())
PY
```

## 编辑 patch 格式

```json
{
  "atoms": [{"id": 3, "element": 17, "charge": -1, "isotope": 13, "num_hydrogens": 0}],
  "bonds": [{"id": 16, "order": 2, "display": "WedgeBegin"}],
  "texts": [{"id": 77, "text": "Revised title"}]
}
```

- `display` 取值：`WedgeBegin`、`WedgedHashBegin`、`Solid`、`Dash`、`Bold`、`Wavy`。
- 改键级不会自动补氢；需要时同时设置相关原子的 `num_hydrogens`。
- id 不存在会返回 `ok: false, error: "text id N not found"`，先列 id 再改。

## 输入与产物

- 结构输入：SMILES、InChI、molfile（`--mol-file` 文件或文本）。
- 反应输入：`reactants>agents>products`；`.` 分隔多组分；agents 可空。
- 产物格式：`cdxml`、`cdx`、`png`、`emf`、`tiff`、`jpg`、`bmp`、`gif`。
- 布局：RDKit CoordGen，统一键长 14.4 pt。
- 条件文本自动把 `H2SO4` 这类化学式排成下标（H₂SO₄）；箭头会按标注宽度自动加长。

## 故障排查

| 现象 | 处理 |
|---|---|
| `no Python 3.10-3.13 with rdkit+pywin32+lxml found` | 设 `CHEMDRAW_PYTHON` 指向合格解释器，或在 skill 内建 `.venv` |
| `Permission denied` 写盘 | 输出跑到了工作区外；改用工作区绝对路径或默认 `./chemdraw-out` |
| `cannot connect to ChemDraw via COM` | 启动 ChemDraw 并确认已授权；确认是 64 位版本 |
| `ChemDraw did not respond to automation` | ChemDraw 里有模态框或正在编辑文本；按 Esc 后重试 |
| 名称解析失败 | PubChem 不可达（DSH 网络策略）或名称不认识；改 SMILES |
| 结构不可见 | 检查 `<n>/<b>/<graphic>` 是否缺 `color="0"` |
| 立体键没显示 | 哈希楔形必须用 `Display="WedgedHashBegin"`，不是 `HashBegin` |
| 输出 JSON 里 `files` 是 `\\` 混合分隔符 | 正常现象（ChemDraw 返回 Windows 路径）；用 `files[0]` 直接当路径即可 |

## 已验证（DSH 会话内实测 2026-11-18）

- `doctor`：`ok: true`，ChemDraw Professional 23.1.1.3，RDKit 2026.09.2，Python 3.12.14。
- `draw`：阿司匹林（SMILES）、咖啡因（SMILES）→ CDXML + PNG，写进会话工作区。
- `reaction`：阿司匹林合成，箭头/条件/产率/<step> 反应语义正确（PNG 目检通过）。
- `grid`：6 个分子 3 列布局（阿司匹林、咖啡因、L-亮氨酸、L-苯丙氨酸、青霉素 G、华法林），手性楔形正常。
- `edit`：改 `<t id="77">` 标题成功，`changed.texts = 1`，回读文本一致。
- `export`：CDXML → EMF + CDX。

## 上游同步

源码在本 skill 与 `C:\Users\pgc\.workbuddy\skills\chemdraw-automation\chemdraw_auto` 各有一份。
改上游后同步：

```bash
cp -r "C:/Users/pgc/.workbuddy/skills/chemdraw-automation/chemdraw_auto/." "$SKILL_DIR/chemdraw_auto/"
```

`chemdraw-auto.sh` 是本 skill 独有，上游没有，同步时不要覆盖。
