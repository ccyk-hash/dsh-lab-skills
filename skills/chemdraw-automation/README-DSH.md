# DSH 适配说明（chemdraw-automation）

本目录是 WorkBuddy skill `chemdraw-automation` 在 **DeepSeek Harness** 下的适配版。
上游：`C:\Users\pgc\.workbuddy\skills\chemdraw-automation`（同机保留，未改动）。

## 一句话

**代码零改动**（`chemdraw_auto/` 与上游逐字一致），只新增一个 bash 启动器 `chemdraw-auto.sh`，
并把 SKILL.md 的命令、路径与失败模式改写为 DSH 语境。

## 逐项差异

| 维度 | 上游（WorkBuddy） | 本版（DSH） | 原因 |
|---|---|---|---|
| 调用入口 | PowerShell `& $cd draw ...`，`$cd` 指 `.venv\Scripts\chemdraw-auto.exe` | `bash <SKILL_DIR>/chemdraw-auto.sh draw ...` | DSH 的 shell 是 Windows 上的 MSYS bash，无 PowerShell 语法；且 `.exe` 走 editable 安装会绑定上游路径 |
| 解释器 | 文档写死 `.venv\Scripts\...`，靠上游目录存在 | 启动器按优先级探测：`$CHEMDRAW_PYTHON` → 本 skill `.venv` → 上游 `.venv` → uv 3.12 → PATH `python`，并校验 `rdkit+win32com+lxml` 可导入 | skill 可搬迁、可重建环境，不再因为目录改名就整体失效 |
| 模块来源 | editable install 的 egg-link 指向上游源码 | 启动器 `cd` 到 `SKILL_DIR` 并前置 `PYTHONPATH`，`python -m chemdraw_auto` 命中本目录源码 | 保证运行的就是 skill 里这份代码，便于单独升级/回滚 |
| 默认输出 | 文档约定 `D:\workbuddy\daily use\chemdraw-out\` | `<调用者 cwd>/chemdraw-out/`，缺 `--out` 时由启动器注入 | DSH 默认 `workspace-write` 沙箱，写工作区外会被拒 |
| 相对路径 | PowerShell 下 cwd 不变，相对 `--out` 自然生效 | 启动器先把相对 `--out` 转绝对，再 `cd` 到 skill 目录 | 启动器要 `cd`，不转就会把产物写进 skill 目录 |
| 输入路径 | — | `--input/--patch/--mol-file` 若在调用者目录下真实存在则转绝对（`--patch` 保持支持内联 JSON） | 同一 `cd` 问题的另一面 |
| frontmatter | `name` + `description` | 增补 `license`、`compatibility`、`allowed-tools`、`metadata`、`disable-model-invocation` | DSH skill 目录的登记约定（对齐本机 `origin-plot`） |
| 故障表 | 6 条 ChemDraw 侧问题 | 增补：找不到解释器、沙箱 `Permission denied`、PubChem 走 DSH 代理失败 | DSH 特有的失败面 |
| `.venv` | 自带（含 rdkit/pywin32） | **不复制**，默认复用上游 venv | 体积大且依赖与上游完全相同；真的需要独立环境时按 SKILL.md 里两行命令自建 |

## 仍然成立的上游硬事实

- 仅 Windows；COM ProgID `ChemDraw_x64.Application`（本机 23.1.1.3）。
- 不调用 `App.Quit()`；不动用户正在编辑的文档。
- 不调用 `Objects.Clean`（会移动分子、留下标注）。
- 23.1.1 的 COM 不支持 SVG/PDF，矢量用 `emf`。
- 不做产物预测/配平，反应式必须显式给出。

## 安装位置与验收

安装位置：`C:\Users\pgc\.dsh\skills\chemdraw-automation`

验收命令（在任意会话工作区内）：

```bash
CD="bash C:/Users/pgc/.dsh/skills/chemdraw-automation/chemdraw-auto.sh"
$CD doctor
$CD draw --smiles "CC(=O)Oc1ccccc1C(=O)O" --stem aspirin --formats cdxml,png
$CD inspect --input chemdraw-out/aspirin.cdxml
```

`doctor` 期望 `ok: true` 且 `chemdraw` 带版本号；`draw` 期望在 `./chemdraw-out/` 下出现
`.cdxml` 与 `.png`，且 `ok: true`。

## 同步上游

```bash
cp -r "C:/Users/pgc/.workbuddy/skills/chemdraw-automation/chemdraw_auto/." \
      "C:/Users/pgc/.dsh/skills/chemdraw-automation/chemdraw_auto/"
```

`chemdraw-auto.sh` 为本版独有，不会被上游覆盖；`SKILL.md` 与 `README-DSH.md` 也是本版独有，
上游更新后需要人工合并其中的事实条目（版本号、已知限制）。
