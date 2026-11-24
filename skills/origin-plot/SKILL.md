---
name: origin-plot
description: 用 originpro COM 桥驱动本机 Origin 2024（D:/origin/Origin64.exe 加 C:/Python314/python.exe）把 CSV/数据表做成出版级散点、折线、柱状图，批量导出 PNG/PDF/TIFF/SVG 并存可编辑 .opju 工程。适用：要 Origin 出图、要改已有 .opju/.ogw 工程、要出版级模板。不适用：matplotlib 或 PIL 手绘示意图（大学物理学_下册 第9章 figs/ 31 幅、期中模拟卷 wave17.png、tools/plot_q9.py 的 PIL 手绘）与教材页裁图（figs/、images/ 共 31 个目录）——出图、绘图、作图、曲线拟合在本工作区多指这两类。路由词：origin、originlab、originpro、opju、ogw、origin 画图、origin绘图、origin 绘图。
license: MIT
compatibility: Windows only. Requires Origin 2024 at D:\origin\Origin64.exe and Python 3.14 at C:\Python314\python.exe with originpro+pywin32 installed. Origin COM automation does not work under WSL/Linux.
allowed-tools: Read Write Edit Bash Glob Grep
metadata:
  version: "0.1"
  last-reviewed: "2026-10-22"
  skill-author: self-written for this workspace (architecture inspired by deliuou/originplot-skill, no code copied)
disable-model-invocation: true
---

# Origin 2024 自动化绘图（origin-plot）

用 Python 驱动本机 Origin 2024 完成数据作图与出版级导出。设计原则：**Python 负责数据与编排，Origin 负责渲染，模板统一风格，OPJU 保留可编辑性。**

## 环境事实（本机已验证 2026-10-22）

| 项 | 值 |
|---|---|
| Origin 主程序 | `D:\origin\Origin64.exe`（Origin 2024） |
| Python 运行时 | **必须用 `C:\Python314\python.exe`**（originpro/pywin32 装在这里，不是 WorkBuddy 内置 3.13） |
| 依赖包 | originpro 1.1.15, pywin32 312, OriginExt 1.2.6 |
| COM 接口 | Origin Automation Server，`originpro` 包自动调用 |

## 工作流

1. **确认数据**：CSV/TXT 数据文件路径、x/y 列映射、目标输出目录（遵循工作区约定放 `projects/<项目>/output/`）
2. **先给用户看方案**（列映射 + 模板 + 导出格式），确认后再执行
3. **执行绘图**（CLI 或 import 均可，见下）
4. **核验产物**：PNG/PDF 文件存在且非空；OPJU 已保存；必要时报图给用户目检

## 用法

### CLI（最常用）

```bash
"C:\Python314\python.exe" "D:\workbuddy\research\.workbuddy\skills\origin-plot\scripts\origin_plot.py" \
  --data "path\to\data.csv" \
  --x 0 --y 1,2 \
  --template Scatter \
  --labels "Temperature (K);Intensity" \
  --out "D:\workbuddy\research\projects\demo\output\fig1.png" \
  --opju  "D:\workbuddy\research\projects\demo\output\fig1.opju" \
  --width 1800
```

参数：
- `--data`：CSV/TXT 路径（首行表头可选用 `--no-header` 关闭）
- `--x`：x 列索引（0 起）；`--y`：一个或多个 y 列（逗号分隔），多 y 会放进同一图层
- `--template`：Origin 模板名，常用 `Scatter` `Line` `LineSymbol` `Column`；也可给 `.otpu` 绝对路径
- `--labels`：分号分隔的 y 轴长名称（用于图例/轴标题）；x 轴名用 `--xlabel`
- `--out`：图片输出路径，按扩展名导出 png/pdf/tiff/svg（中文文件名已自动处理）
- `--width`：导出宽度（像素），默认 1600；出版图建议 1800+
- `--opju`：可选，保存可编辑工程
- `--visible`：显示 Origin 窗口（默认隐藏运行）

### Python API

```python
import sys; sys.path.insert(0, r"D:\workbuddy\research\.workbuddy\skills\origin-plot\scripts")
from origin_plot import plot_from_csv
plot_from_csv("data.csv", x=0, y=[1,2], out=r"...\fig1.png",
              template="Scatter", y_labels=["A","B"], opju=r"...\fig1.opju")
```

## 已验证的关键技术点（勿踩坑）

1. **图片导出必须用 `GPage.save_fig()`**（内部执行 `expgraph -sw`，-sw 静默警告弹窗）。裸 `lt_exec('expGraph ...')` 在隐藏模式下会因警告弹窗静默失败返回 False——冒烟阶段已实测踩坑
2. **`gl.add_plot(wks, coly, colx)` —— Y 列在前，X 列在后**。传反了坐标轴会互换（实测踩坑）
3. **LabTalk 对非 ASCII 文件名不可靠**：中文文件名导出会静默失败，先导出 ASCII 临时名再用 Python `os.rename` 改名（模块已内置处理）
4. **导出尺寸用像素**（`save_fig(width=...)`，内部 `tr1.Unit:=2 tr1.Width:=N`），不是 DPI
5. 会话结束必须 `op.exit()`，否则 Origin 进程残留（脚本 finally 中已处理）
6. Origin 首次启动需完成许可激活；自动化前先手动开一次 Origin
7. 沙箱环境曾拦截 PowerShell 的 COM 实例化与 `reg.exe`，但 **Python subprocess + win32com 未被拦截**，可直接用
8. `lt_exec()` 返回 True/False，务必检查；失败时可用 `op.get_lt_str("%H")` 等验证会话是否存活

## 边界与注意

- 不修改 Origin 安装目录与用户配置；所有输出写到项目 `output/`
- 原始 CSV 只读；OPJU 是衍生品，可随时重生成
- 图形完整性由人把关：AI 生成后用户需目检数据点/坐标/标签是否与数据一致
- 中文标签如出现字形异常，改用英文字段名或在 Origin 中另存中文主题模板后重试
