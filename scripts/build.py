#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import io as _io, sys as _sys
_enc = getattr(_sys.stdout, 'encoding', '') or ''
if _enc.lower().replace('-', '') not in ('utf8', 'utf-8'):
    try:
        _sys.stdout = _io.TextIOWrapper(_sys.stdout.buffer, encoding='utf-8', errors='replace')
        _sys.stderr = _io.TextIOWrapper(_sys.stderr.buffer, encoding='utf-8', errors='replace')
    except Exception:
        pass

"""
build.py — 编译 OpenWork 桌面应用（Windows）

用法:
    python scripts/build.py              # 完整编译（install + tauri build）
    python scripts/build.py --install    # 只安装依赖
    python scripts/build.py --ui         # 只编译前端（vite build）
    python scripts/build.py --tauri      # 只编译 tauri（跳过 install）
    python scripts/build.py --debug      # Debug 模式（速度更快，包更大）

输出产物:
    packages/desktop/src-tauri/target/release/bundle/
        nsis/   → OpenWork_x.x.x_x64-setup.exe  (安装包)
        msi/    → OpenWork_x.x.x_x64_en-US.msi  (MSI)
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

# ── 路径 ───────────────────────────────────────────────────────────────────────
REPO_ROOT    = Path(__file__).resolve().parent.parent
DESKTOP_DIR  = REPO_ROOT / "packages" / "desktop"
APP_DIR      = REPO_ROOT / "packages" / "app"
BUNDLE_DIR   = DESKTOP_DIR / "src-tauri" / "target" / "release" / "bundle"
BUNDLE_DEBUG = DESKTOP_DIR / "src-tauri" / "target" / "debug" / "bundle"

# ── ANSI 颜色 ─────────────────────────────────────────────────────────────────
try:
    import ctypes
    ctypes.windll.kernel32.SetConsoleMode(
        ctypes.windll.kernel32.GetStdHandle(-11), 7
    )
    _COLOR = True
except Exception:
    _COLOR = False

def _c(code: str, text: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _COLOR else text

def info(msg: str)  -> None: print(_c("34",  f"[build] {msg}"))
def ok(msg: str)    -> None: print(_c("32",  f"[ok]    {msg}"))
def warn(msg: str)  -> None: print(_c("33",  f"[warn]  {msg}"))
def step(msg: str)  -> None: print(_c("36",  f"\n{'─'*50}\n  {msg}\n{'─'*50}"))
def die(msg: str)   -> None:
    print(_c("31", f"[error] {msg}"), file=sys.stderr)
    sys.exit(1)

# ── 工具 ───────────────────────────────────────────────────────────────────────
IS_WINDOWS = sys.platform == "win32"

def run(cmd: list[str], cwd: Path = REPO_ROOT, env: dict | None = None) -> None:
    """运行命令，实时输出，失败则 die。Windows 上用 shell=True 支持 .cmd 脚本。"""
    info(f"$ {' '.join(cmd)}")
    merged_env = {**os.environ, **(env or {})}
    result = subprocess.run(
        cmd, cwd=cwd, env=merged_env,
        shell=IS_WINDOWS,  # Windows: pnpm/cargo 等都是 .cmd，需要 shell
    )
    if result.returncode != 0:
        die(f"命令失败（退出码 {result.returncode}）: {' '.join(cmd)}")

def elapsed(start: float) -> str:
    s = int(time.time() - start)
    return f"{s // 60}m{s % 60}s"

def get_version() -> str:
    conf = DESKTOP_DIR / "src-tauri" / "tauri.conf.json"
    return json.loads(conf.read_text(encoding="utf-8")).get("version", "unknown")

def find_artifacts(debug: bool) -> list[Path]:
    base = BUNDLE_DEBUG if debug else BUNDLE_DIR
    if not base.exists():
        return []
    exts = (".exe", ".msi", ".dmg", ".deb", ".rpm", ".AppImage")
    found = []
    for p in base.rglob("*"):
        if p.is_file() and p.suffix in exts and "fragment" not in p.name:
            found.append(p)
    return sorted(found)

# ── 步骤 ───────────────────────────────────────────────────────────────────────
def do_install() -> None:
    step("安装依赖 (pnpm install)")
    run(["pnpm", "install", "--frozen-lockfile"], cwd=REPO_ROOT)
    ok("依赖安装完成")

def do_ui_build() -> None:
    step("编译前端 (vite build)")
    run(["pnpm", "--filter", "@different-ai/openwork-ui", "build"], cwd=REPO_ROOT)
    ok("前端编译完成")

def do_tauri_build(debug: bool) -> None:
    mode = "debug" if debug else "release"
    step(f"编译 Tauri ({mode})")
    cmd = ["pnpm", "exec", "tauri", "build"]
    if debug:
        cmd.append("--debug")
    # beforeBuildCommand 在 tauri.conf.json 里已配置：
    #   pnpm prepare:sidecar + pnpm build:ui
    # 所以直接跑 tauri build 即可
    run(cmd, cwd=DESKTOP_DIR)
    ok(f"Tauri 编译完成（{mode}）")

# ── 主流程 ────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="编译 OpenWork 桌面应用",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--install", action="store_true", help="只安装依赖")
    parser.add_argument("--ui",      action="store_true", help="只编译前端")
    parser.add_argument("--tauri",   action="store_true", help="只编译 tauri（跳过 install）")
    parser.add_argument("--debug",   action="store_true", help="Debug 模式")
    args = parser.parse_args()

    t0 = time.time()
    version = get_version()
    info(f"OpenWork v{version}  |  模式: {'debug' if args.debug else 'release'}")

    # 单步模式
    if args.install:
        do_install()
        ok(f"完成 ({elapsed(t0)})")
        return

    if args.ui:
        do_ui_build()
        ok(f"完成 ({elapsed(t0)})")
        return

    if args.tauri:
        do_tauri_build(args.debug)
    else:
        # 完整流程
        do_install()
        do_tauri_build(args.debug)  # beforeBuildCommand 里已含 UI 编译

    # 汇报产物
    artifacts = find_artifacts(args.debug)
    if artifacts:
        print()
        ok("构建产物:")
        for a in artifacts:
            size_mb = a.stat().st_size / 1024 / 1024
            rel = a.relative_to(REPO_ROOT)
            print(f"  {_c('32','✓')}  {rel}  ({size_mb:.1f} MB)")
    else:
        warn("未找到构建产物，请检查 bundle 配置")

    print()
    ok(f"{'='*44}")
    ok(f"  编译完成！版本 v{version}  耗时 {elapsed(t0)}")
    ok(f"{'='*44}")


if __name__ == "__main__":
    main()
