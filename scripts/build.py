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
build.py — 更新三方组件 + 编译 OpenWork 桌面应用（Windows）

用法:
    python scripts/build.py                   # 完整流程
    python scripts/build.py --skip-update     # 跳过 sidecar 版本更新
    python scripts/build.py --update-only     # 只更新版本，不编译
    python scripts/build.py --debug           # Debug 模式（快，包大）

完整流程:
    1. 查询 GitHub 获取 opencode 最新版本
    2. 更新 packages/desktop/package.json 的 opencodeVersion
    3. pnpm install（锁定依赖）
    4. tauri build（含 beforeBuildCommand: prepare-sidecar + vite build）
    5. 汇报安装包路径

输出产物:
    packages/desktop/src-tauri/target/release/bundle/
        nsis/  OpenWork_x.x.x_x64-setup.exe
        msi/   OpenWork_x.x.x_x64_en-US.msi
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

IS_WINDOWS = sys.platform == "win32"
REPO_ROOT   = Path(__file__).resolve().parent.parent
DESKTOP_DIR = REPO_ROOT / "packages" / "desktop"
APP_DIR     = REPO_ROOT / "packages" / "app"
DESKTOP_PKG = DESKTOP_DIR / "package.json"
TAURI_CONF  = DESKTOP_DIR / "src-tauri" / "tauri.conf.json"
SIDECARS    = DESKTOP_DIR / "src-tauri" / "sidecars"

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

def info(msg: str)  -> None: print(_c("34", f"[build] {msg}"))
def ok(msg: str)    -> None: print(_c("32", f"[ok]    {msg}"))
def warn(msg: str)  -> None: print(_c("33", f"[warn]  {msg}"))
def step(n: int, total: int, msg: str) -> None:
    print(_c("36", f"\n{'─'*52}\n  [{n}/{total}] {msg}\n{'─'*52}"))
def die(msg: str) -> None:
    print(_c("31", f"\n[error] {msg}"), file=sys.stderr)
    sys.exit(1)

# ── Shell 执行 ────────────────────────────────────────────────────────────────
def run(cmd: list[str], cwd: Path = REPO_ROOT, strip_ci: bool = False,
        extra_env: dict[str, str] | None = None) -> None:
    """运行命令，实时输出。Windows 用 shell=True 支持 .cmd 可执行文件。"""
    info(f"$ {' '.join(cmd)}")
    env = {**os.environ}
    if strip_ci:
        # tauri build 不兼容 CI=1，会把它解析为 --ci 1 而报错
        env.pop("CI", None)
        env.pop("CONTINUOUS_INTEGRATION", None)
    if extra_env:
        env.update(extra_env)
    result = subprocess.run(
        cmd, cwd=cwd,
        env=env,
        shell=IS_WINDOWS,
    )
    if result.returncode != 0:
        die(f"命令失败（退出码 {result.returncode}）: {' '.join(cmd)}")

def elapsed(start: float) -> str:
    s = int(time.time() - start)
    return f"{s // 60}m{s % 60}s"

# ── JSON 读写 ─────────────────────────────────────────────────────────────────
def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))

def write_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

# ── GitHub API ────────────────────────────────────────────────────────────────
def github_latest_tag(repo: str) -> str | None:
    """获取 GitHub repo 的最新 release tag，失败返回 None。"""
    url = f"https://api.github.com/repos/{repo}/releases/latest"
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "openwork-build-script",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            tag = data.get("tag_name", "")
            return tag.lstrip("v") if tag else None
    except Exception as e:
        warn(f"GitHub API 请求失败 ({repo}): {e}")
        return None

# ── 版本更新 ──────────────────────────────────────────────────────────────────
SIDECAR_SOURCES = {
    "opencode": {
        "repo":    "anomalyco/opencode",
        "pkg_key": "opencodeVersion",
    },
    "opencode-router": {
        "repo":    "different-ai/openwork",
        "pkg_key": "opencodeRouterVersion",
    },
}

def do_update_versions() -> dict[str, tuple[str, str]]:
    """
    查询每个 sidecar 的最新版本，更新 desktop/package.json。
    返回 {name: (old, new)} 的变更字典。
    """
    pkg = read_json(DESKTOP_PKG)
    changes: dict[str, tuple[str, str]] = {}

    for name, cfg in SIDECAR_SOURCES.items():
        key = cfg["pkg_key"]
        old = str(pkg.get(key, "")).lstrip("v")
        info(f"查询 {name} 最新版本 ({cfg['repo']})...")
        new = github_latest_tag(cfg["repo"])
        if not new:
            warn(f"  无法获取 {name} 最新版，保持当前版本 {old}")
            continue
        if old == new:
            ok(f"  {name} 已是最新 v{new}")
        else:
            info(f"  {name}: {old} → {new}")
            pkg[key] = new
            changes[name] = (old, new)

    if changes:
        write_json(DESKTOP_PKG, pkg)
        ok(f"desktop/package.json 已更新：{', '.join(f'{n} {o}→{v}' for n,(o,v) in changes.items())}")
    else:
        ok("所有 sidecar 已是最新版本")

    return changes

# ── 编译步骤 ──────────────────────────────────────────────────────────────────
def do_install() -> None:
    run(["pnpm", "install", "--frozen-lockfile"], cwd=REPO_ROOT)
    ok("依赖安装完成")

def do_tauri_build(debug: bool, force_sidecar: bool = False) -> None:
    cmd = ["pnpm", "exec", "tauri", "build"]
    if debug:
        cmd.append("--debug")
    # Windows 显式指定 nsis，确保生成安装包
    cmd += ["--bundles", "nsis"]
    # 本地构建跳过代码签名
    cmd.append("--no-sign")
    # 强制重建本地 sidecar（openwork-server/orchestrator 是 bun build，有缓存则跳过）
    extra_env: dict[str, str] = {}
    if force_sidecar:
        extra_env["OPENWORK_SIDECAR_FORCE_BUILD"] = "1"
        info("强制重建本地 sidecar（OPENWORK_SIDECAR_FORCE_BUILD=1）")
    run(cmd, cwd=DESKTOP_DIR, strip_ci=True, extra_env=extra_env)

# ── 产物报告 ──────────────────────────────────────────────────────────────────
def report_artifacts(debug: bool) -> None:
    bundle_base = DESKTOP_DIR / "src-tauri" / "target"
    bundle = bundle_base / ("debug" if debug else "release") / "bundle"

    if not bundle.exists():
        warn(f"未找到 bundle 目录: {bundle}")
        warn("tauri build 可能失败或 bundle.active 未开启")
        return

    exts = (".exe", ".msi", ".dmg", ".deb", ".rpm", ".AppImage")
    artifacts = sorted(
        p for p in bundle.rglob("*")
        if p.is_file() and p.suffix in exts and "fragment" not in p.name
    )

    if not artifacts:
        warn("bundle 目录存在但未找到安装包文件")
        return

    print()
    ok("构建产物:")
    for a in artifacts:
        mb = a.stat().st_size / 1024 / 1024
        rel = a.relative_to(REPO_ROOT)
        print(f"  {_c('32','✓')}  {rel}  ({mb:.1f} MB)")

# ── 主流程 ────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="更新三方组件并编译 OpenWork 桌面应用",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--skip-update",   action="store_true", help="跳过 sidecar 版本更新")
    parser.add_argument("--update-only",   action="store_true", help="只更新版本，不编译")
    parser.add_argument("--force-sidecar", action="store_true", help="强制重建本地 sidecar（openwork-server/orchestrator）")
    parser.add_argument("--debug",         action="store_true", help="Debug 模式（跳过代码签名，速度快）")
    args = parser.parse_args()

    t0 = time.time()
    version = read_json(TAURI_CONF).get("version", "unknown")
    mode = "debug" if args.debug else "release"
    info(f"OpenWork v{version}  |  目标: {mode}")

    total_steps = sum([
        not args.skip_update,          # step: update versions
        not args.update_only,          # step: install
        not args.update_only,          # step: tauri build
    ])
    n = 0

    # 1. 更新 sidecar 版本
    if not args.skip_update:
        n += 1
        step(n, total_steps, "更新三方组件版本")
        version_changes = do_update_versions()
        if version_changes and not args.update_only:
            info("版本已更新，重新安装依赖以同步 lockfile...")

    if args.update_only:
        print()
        ok(f"完成（只更新版本，未编译）  耗时 {elapsed(t0)}")
        return

    # 2. 安装依赖
    n += 1
    step(n, total_steps, "安装依赖 (pnpm install)")
    do_install()

    # 3. Tauri build
    n += 1
    step(n, total_steps, f"编译桌面应用 (tauri build --{mode})")
    info("tauri 将自动执行: prepare-sidecar → vite build → Rust 编译 → 打包安装程序")
    # 有版本变更时自动强制重建，或用户显式传了 --force-sidecar
    # 有版本变更时自动强制重建，或用户显式传了 --force-sidecar
    force = args.force_sidecar or bool(version_changes)
    do_tauri_build(args.debug, force_sidecar=force)

    # 4. 报告
    report_artifacts(args.debug)

    print()
    ok(f"{'='*50}")
    ok(f"  编译完成！  v{version}  耗时 {elapsed(t0)}")
    ok(f"{'='*50}")


if __name__ == "__main__":
    main()
