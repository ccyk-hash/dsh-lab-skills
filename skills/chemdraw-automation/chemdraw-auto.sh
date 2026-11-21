#!/usr/bin/env bash
# chemdraw-auto — DSH (MSYS bash) launcher
#
# 目标：在 DeepSeek Harness 的 bash 工具里直接调用本 skill 的 ChemDraw 执行器，
#      不依赖 PowerShell、不依赖 PATH 里的 chemdraw-auto.exe、不把产物写到工作区之外。
#
# 用法：
#   bash <SKILL_DIR>/chemdraw-auto.sh doctor
#   bash <SKILL_DIR>/chemdraw-auto.sh draw --smiles "CC(=O)Oc1ccccc1C(=O)O" --stem aspirin --formats cdxml,png
#
# 行为：
#   * 自动挑选一个同时装了 rdkit + pywin32 + lxml 的 Python 3.10–3.13（优先本 skill 内 .venv，
#     其次上游 workbuddy 的 .venv，其次 uv 的 3.12，最后 PATH 上的 python）；
#   * 把本 skill 目录放到模块搜索首位，保证跑的永远是这份源码；
#   * draw/reaction/grid/edit/export 缺 --out 时注入 "$PWD/chemdraw-out"（会话工作区内），
#     相对 --out 一律按调用者当前目录解析成绝对路径 —— 因为随后会 cd 到 skill 目录；
#   * 其余参数原样透传，stdout 仍是纯 JSON。
#
# 环境变量：
#   CHEMDRAW_PYTHON   指定解释器绝对路径，优先级最高
#   CHEMDRAW_OUT      缺省输出目录（绝对路径），覆盖 $PWD/chemdraw-out

set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIG_PWD="$PWD"

# ---------------------------------------------------------------- 路径工具
to_win() { # /d/a/b -> D:/a/b
  local p="$1"
  if [[ "$p" == /[a-zA-Z]/* ]]; then
    local drive="${p:1:1}"
    local rest="${p:3}"
    printf '%s:/%s' "${drive^^}" "$rest"
  else
    printf '%s' "$p"
  fi
}

is_abs() {
  case "$1" in
    /* | [a-zA-Z]:[\\/]*) return 0 ;;
    *) return 1 ;;
  esac
}

# ------------------------------------------------------------ 解释器挑选
have_deps() {
  "$1" -c 'import sys, rdkit, win32com.client, lxml; sys.exit(0 if sys.version_info[:2] >= (3,10) and sys.version_info[:2] <= (3,14) else 3)' \
    >/dev/null 2>&1
}

pick_python() {
  local candidates=()
  [[ -n "${CHEMDRAW_PYTHON:-}" ]] && candidates+=("$CHEMDRAW_PYTHON")
  candidates+=("$SKILL_DIR/.venv/Scripts/python.exe")
  candidates+=("/c/Users/pgc/.workbuddy/skills/chemdraw-automation/.venv/Scripts/python.exe")
  candidates+=("/c/Users/pgc/AppData/Roaming/uv/python/cpython-3.12.14-windows-x86_64-none/python.exe")
  candidates+=("$(command -v python 2>/dev/null || true)")
  candidates+=("$(command -v python3 2>/dev/null || true)")

  local py
  for py in "${candidates[@]}"; do
    [[ -z "$py" || ! -e "$py" ]] && continue
    if have_deps "$py"; then
      printf '%s' "$py"
      return 0
    fi
  done
  return 1
}

PY="$(pick_python)" || {
  printf '%s\n' '{"ok": false, "error": "no Python 3.10-3.13 with rdkit+pywin32+lxml found; set CHEMDRAW_PYTHON to such an interpreter", "type": "EnvironmentError"}'
  exit 3
}

# ------------------------------------------------------------- 参数规范化
args=("$@")
command_name="${args[0]:-}"
needs_out=0
case "$command_name" in
  draw | reaction | grid | edit | export) needs_out=1 ;;
esac

norm_args=()
has_out=0
i=0
n=${#args[@]}
while (( i < n )); do
  a="${args[i]}"
  # 输入类参数：只有确实指向调用者目录下的文件时才转绝对路径（--patch 允许内联 JSON）
  if [[ "$a" == "--input" || "$a" == "--patch" || "$a" == "--mol-file" ]] && (( i + 1 < n )); then
    v="${args[i + 1]}"
    if ! is_abs "$v" && [[ -e "$ORIG_PWD/$v" ]]; then
      v="$(to_win "$ORIG_PWD/$v")"
    fi
    norm_args+=("$a" "$v")
    i=$((i + 2))
    continue
  fi
  if [[ "$a" == "--out" ]] && (( i + 1 < n )); then
    v="${args[i + 1]}"
    is_abs "$v" || v="$ORIG_PWD/$v"
    norm_args+=("--out" "$(to_win "$v")")
    has_out=1
    i=$((i + 2))
    continue
  fi
  if [[ "$a" == --out=* ]]; then
    v="${a#--out=}"
    is_abs "$v" || v="$ORIG_PWD/$v"
    norm_args+=("--out=$(to_win "$v")")
    has_out=1
    i=$((i + 1))
    continue
  fi
  norm_args+=("$a")
  i=$((i + 1))
done

if (( needs_out == 1 && has_out == 0 )); then
  out_dir="${CHEMDRAW_OUT:-$ORIG_PWD/chemdraw-out}"
  is_abs "$out_dir" || out_dir="$ORIG_PWD/$out_dir"
  norm_args+=("--out" "$(to_win "$out_dir")")
fi

# ------------------------------------------------------------------ 启动
cd "$SKILL_DIR" || exit 3
export PYTHONPATH="$SKILL_DIR${PYTHONPATH:+:$PYTHONPATH}"
export PYTHONIOENCODING="${PYTHONIOENCODING:-utf-8}"
export PYTHONUTF8=1

exec "$PY" -m chemdraw_auto "${norm_args[@]}"
