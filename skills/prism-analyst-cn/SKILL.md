---
name: prism-analyst-cn
description: 用中文一句话调用本机 GraphPad Prism 8.0.2 做统计分析并输出结果。触发词：Prism、GraphPad、t检验、ANOVA、方差分析、线性回归、拟合、出版级图、三线表报告。执行器已通过 P0/P1 验证，统计值全部来自 Prism 原生引擎。
disable-model-invocation: true
---

# prism-analyst-cn：调用本机 GraphPad Prism 8 做分析

## 核心事实（勿违背）

1. **统计值一律来自 Prism 原生结果表**。禁止用 Python/scipy 算出 p 值冒充 Prism 结果。
2. Prism 脚本**不能新建分析**，只能重算模板里已有的分析（RecalcAll）。
   → 能做什么分析 = `templates/registry.json` 里登记了几个模板。
3. 模板数据注入有两条路，**执行器按模板内容自动选择**，不要手动指定：
   - 二进制 `.pzf`（PCFFGRA4 开头）→ ClearTable + Import（Column 表）
   - XML 内容（`<?xml` 开头，即 pzfx）→ 直接改 `<d>` 注入（XY 表；Import 会挂死）
4. `ExportPNG` 不带 DPI 参数；`GoTo R n`/`GoTo G n` 序号不存在时会**隐形弹窗挂死**——
   执行器有看门狗（默认 120s）与进程归属清理，超时即报错并杀掉本次启动的 Prism。
5. Prism 正在被用户打开时执行器会拒绝运行（防 Exit 丢用户未保存工作）。
   遇到 ERROR"Prism 已在运行"，请用户关闭 Prism 后重试，**不要**主动加 --allow-existing。

## 环境

- 执行器：`D:\workbuddy\daily use\prism8\prism_runner.py`
- 模板注册表：`D:\workbuddy\daily use\prism8\templates\registry.json`
- 报告生成：`D:\workbuddy\daily use\prism8\make_report.py`（python-docx 已装）
- **Python 必须用 `C:\Python314\python.exe`**（bash 默认 python=3.13，无 pywin32）
- 输出根目录：`D:\workbuddy\daily use\prism8_results\<任务名-时间戳>\`
- 运行隔离目录：`C:\prism8_run\runs\`（ASCII，Prism 只接触这里）

## 标准流程

1. 用户给出数据文件（CSV）+ 分析意图。
2. 查 registry.json 匹配模板（按 aliases）。**匹配不到就如实告知当前支持哪些分析**，
   不要硬套。
3. 检查数据：列数与模板组数一致、数值列无异常文本。
4. 执行（一行命令）：

```powershell
C:\Python314\python.exe "D:\workbuddy\daily use\prism8\prism_runner.py" run ^
  --template <registry中的template> --data <csv> ^
  --out "D:\workbuddy\daily use\prism8_results" --name <任务名> ^
  --graph-index 1 --formats png,pdf
```

   成功标志：`RESULT=ok`；结果表预览直接打印在 [4] 段。
5. 生成 Word 报告：

```powershell
C:\Python314\python.exe "D:\workbuddy\daily use\prism8\make_report.py" ^
  --run-dir <上一步输出的任务目录>
```

6. 向用户汇报：P 值/统计量结论 + 产物路径（report.docx、figure、results.csv、project.pzf）。

## 当前支持的分析（2026-10-31）

| 意图 | 模板 | 数据格式 | 结果页 |
|---|---|---|---|
| 两组比较 / t 检验 | ttest_two_group | 2 列，一列一组 | R1（P值/t/df/均值/CI） |
| 单因素 ANOVA + Tukey | anova_tukey_one_way | 3+ 列，一列一组 | R1（Tukey 两两比较+调整后P） |
| 线性回归 | linear_regression | 2 列 X,Y | R1（斜率/截距/R²/F检验） |

新增分析类型：用户在 Prism GUI 建模板（见 `prism8\模板制作单.md`）→ 自测 → 在 registry.json 登记。

## 常见故障

| 现象 | 处置 |
|---|---|
| RESULT=partial + _done.txt 缺失 | 脚本中途出错。查 run.pzc 与产物清单定位；常见是 GoTo 序号越界或模板结构变了 |
| ERROR: Prism 已在运行 | 请用户关闭 Prism；绝不擅自 --allow-existing |
| 执行超时（>120s） | 多为隐形模态弹窗。看门狗已杀进程；检查模板是否被手工改动 |
| XML 注入失败（列数/组数不一致） | 数据与模板不匹配，向用户说明模板要求 |
| 结果表全是空值 | 分析未重算。确认走的是注入模式（日志第 [1] 行）而非 Import |
| results.csv 中文乱码 | 强制按 UTF-8 读（执行器已是 utf-8-sig） |

## 边界承诺

不移动/删除/改写用户原始数据；不修改 Prism 安装目录与授权；模板在 GUI 中建立；
统计结论必须能在 results.csv 中找到原文依据，解读时不得外推模板未包含的检验。
