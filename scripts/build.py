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
build.py — 更新三方组件 + 编译 OpenWork 桌面应用（Windows）或 musl-linux 主程序

用法:
    python scripts/build.py                   # 完整流程（Windows 桌面安装包）
    python scripts/build.py --skip-update     # 跳过 sidecar 版本更新
    python scripts/build.py --update-only     # 只更新版本，不编译
    python scripts/build.py --debug           # Debug 模式（快，包大）
    python scripts/build.py --musl-linux      # 编译 musl-linux-x64 主程序（无界面）

完整流程:
    1. 查询 GitHub 获取 opencode 最新版本
    2. 更新 packages/desktop/package.json 的 opencodeVersion
    3. pnpm install（锁定依赖）
    4. tauri build（含 beforeBuildCommand: prepare-sidecar + vite build）
    5. 汇报安装包路径

输出产物:
    packages/desktop/src-tauri/target/release/bundle/  (桌面安装包)
        nsis/  OpenWork_x.x.x_x64-setup.exe
        msi/   OpenWork_x.x.x_x64_en-US.msi
    dist/linux-musl/  (musl-linux 主程序)
        openwork-bun-linux-x64-musl
        openwork-server-bun-linux-x64-musl
        opencode-router-bun-linux-x64-musl
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
# opencode 是唯一一个从 GitHub 独立追踪的第三方组件。
# opencode-router / openwork-server / orchestrator 是内部 workspace 包，版本由
# `pnpm bump:*` 统一管理，不应独立上抠 GitHub 最新 release。
SIDECAR_SOURCES = {
    "opencode": {
        "repo":    "anomalyco/opencode",
        "pkg_key": "opencodeVersion",
    },
}

# workspace 内部包：desktop/package.json 的 opencodeRouterVersion 必须和
# packages/opencode-router/package.json 的 version 保持一致。
OPENCODE_ROUTER_PKG = REPO_ROOT / "packages" / "opencode-router" / "package.json"


def _sync_opencode_router_version(desktop_pkg: dict) -> bool:
    """
    如果 desktop/package.json 的 opencodeRouterVersion 与 workspace 内部包不一致，
    自动将 desktop/package.json 的字段回改为 workspace 内部包的实际版本。
    返回 True 表示有修正。
    """
    if not OPENCODE_ROUTER_PKG.exists():
        return False
    router_ver = read_json(OPENCODE_ROUTER_PKG).get("version", "").lstrip("v")
    desktop_ver = str(desktop_pkg.get("opencodeRouterVersion", "")).lstrip("v")
    if router_ver and desktop_ver != router_ver:
        warn(f"  opencodeRouterVersion 不一致: desktop={desktop_ver}, workspace={router_ver} → 修正为 {router_ver}")
        desktop_pkg["opencodeRouterVersion"] = router_ver
        return True
    return False


def do_update_versions() -> dict[str, tuple[str, str]]:
    """
    查询每个第三方 sidecar 的最新版本，更新 desktop/package.json。
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

    # 检查并修復 opencodeRouterVersion 与 workspace 内部包的一致性
    if _sync_opencode_router_version(pkg):
        changes.setdefault("opencode-router-sync", ("", ""))

    if changes:
        write_json(DESKTOP_PKG, pkg)
        ok(f"desktop/package.json 已更新：{', '.join(f'{n} {o}→{v}' for n,(o,v) in changes.items() if o and v)}")
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

# ── musl-linux 主程序编译 ────────────────────────────────────────────────────
MUSL_OUTDIR = REPO_ROOT / "dist" / "linux-musl"
BUN_VERSION_FOR_MUSL = "1.3.10"  # 与 bun --version 保持一致
BUN_MUSL_CACHE = Path.home() / ".bun" / "cross-compile" / "bun-linux-x64-musl"
BUN_MUSL_DOWNLOAD_URL = (
    "https://github.com/oven-sh/bun/releases/download/"
    f"bun-v{BUN_VERSION_FOR_MUSL}/bun-linux-x64-musl.zip"
)

ORCHESTRATOR_DIR = REPO_ROOT / "packages" / "orchestrator"
SERVER_DIR       = REPO_ROOT / "packages" / "server"
ROUTER_DIR       = REPO_ROOT / "packages" / "opencode-router"


def ensure_musl_bun_baseline() -> Path:
    """
    确保 musl bun baseline 可执行文件已缓存。
    Bun 跨平台编译需要目标平台的 bun 可执行文件作为 baseline。
    缓存路径：~/.bun/cross-compile/bun-linux-x64-musl
    """
    import zipfile
    cache = BUN_MUSL_CACHE
    if cache.exists() and cache.stat().st_size > 50 * 1024 * 1024:
        ok(f"musl bun baseline 已缓存: {cache}")
        return cache
    info(f"下载 bun-linux-x64-musl v{BUN_VERSION_FOR_MUSL}...")
    cache.parent.mkdir(parents=True, exist_ok=True)
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        zip_path = Path(tmp) / "bun-linux-x64-musl.zip"
        try:
            urllib.request.urlretrieve(BUN_MUSL_DOWNLOAD_URL, zip_path)
        except Exception as e:
            die(f"下载 bun musl baseline 失败: {e}\n请手动下载并放置到 {cache}")
        with zipfile.ZipFile(zip_path) as zf:
            members = zf.namelist()
            bun_entry = next((m for m in members if m.endswith("/bun") or m == "bun"), None)
            if not bun_entry:
                die(f"zip 中未找到 bun 可执行文件，成员: {members}")
            data = zf.read(bun_entry)
        cache.write_bytes(data)
        ok(f"musl bun baseline 已缓存: {cache}  ({len(data) // 1024 // 1024} MB)")
    return cache


def do_build_musl_linux() -> None:
    """
    编译三个 musl-linux-x64 无界面主程序：
      openwork         (orchestrator, 含 TUI 但无 Tauri 界面)
      openwork-server  (HTTP API server)
      opencode-router  (Slack/Telegram/WhatsApp 路由桥)
    产物输出到 dist/linux-musl/
    """
    baseline = ensure_musl_bun_baseline()
    MUSL_OUTDIR.mkdir(parents=True, exist_ok=True)

    # ── openwork-server（直接 CLI 编译）
    server_out = MUSL_OUTDIR / "openwork-server-bun-linux-x64-musl"
    info("编译 openwork-server...")
    run(
        [
            "bun", "build", "src/cli.ts", "--compile", "--production",
            "--target=bun-linux-x64-musl",
            f"--compile-executable-path={baseline}",
            f"--outfile={server_out}",
        ],
        cwd=SERVER_DIR,
    )
    ok(f"openwork-server → {server_out.relative_to(REPO_ROOT)}")

    # ── opencode-router（直接 CLI 编译）
    router_out = MUSL_OUTDIR / "opencode-router-bun-linux-x64-musl"
    info("编译 opencode-router...")
    run(
        [
            "bun", "build", "src/cli.ts", "--compile", "--production",
            "--target=bun-linux-x64-musl",
            f"--compile-executable-path={baseline}",
            f"--outfile={router_out}",
        ],
        cwd=ROUTER_DIR,
    )
    ok(f"opencode-router → {router_out.relative_to(REPO_ROOT)}")

    # ── openwork orchestrator（Bun.build() API + solidPlugin）
    # orchestrator 的 tui/app.tsx 使用 @opentui/solid JSX transform，
    # 必须通过 solidPlugin 预处理才能交叉编译。
    orch_out = MUSL_OUTDIR / "openwork-bun-linux-x64-musl"
    info("编译 openwork orchestrator (solidPlugin)...")
    # Bun.build() API executablePath 在 Windows 下需要用路径分隔符 '\\' 的 Windows 路径
    win_baseline = str(baseline).replace("\\", "\\\\") if IS_WINDOWS else str(baseline)
    build_script = f'''import solidPlugin from "{ORCHESTRATOR_DIR.as_posix()}/node_modules/@opentui/solid/scripts/solid-plugin";
import {{ mkdirSync }} from "node:fs";
const result = await Bun.build({{
  tsconfig: "{ORCHESTRATOR_DIR.as_posix()}/tsconfig.json",
  plugins: [solidPlugin],
  entrypoints: ["{ORCHESTRATOR_DIR.as_posix()}/src/cli.ts"],
  define: {{ __OPENWORK_ORCHESTRATOR_VERSION__: JSON.stringify((await Bun.file("{ORCHESTRATOR_DIR.as_posix()}/package.json").json()).version) }},
  compile: {{
    target: "bun-linux-x64-musl",
    outfile: "{orch_out.as_posix()}",
    executablePath: "{win_baseline}",
  }},
}});
if (!result.success) {{ result.logs.forEach(l => console.error(l)); process.exit(1); }}
console.log("Built:", "{orch_out.as_posix()}");
'''
    import tempfile
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".ts", delete=False, encoding="utf-8"
    ) as f:
        f.write(build_script)
        script_path = f.name
    try:
        run(["bun", script_path], cwd=ORCHESTRATOR_DIR)
    finally:
        Path(script_path).unlink(missing_ok=True)
    ok(f"openwork → {orch_out.relative_to(REPO_ROOT)}")

    # ── 报告产物
    print()
    ok("musl-linux 产物:")
    for p in sorted(MUSL_OUTDIR.iterdir()):
        if p.is_file():
            mb = p.stat().st_size / 1024 / 1024
            print(f"  {_c('32', chr(10003))}  {p.relative_to(REPO_ROOT)}  ({mb:.1f} MB)")


# ── 主流程 ────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="更新三方组件并编译 OpenWork（桌面安装包或 musl-linux 主程序）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--skip-update",   action="store_true", help="跳过 sidecar 版本更新")
    parser.add_argument("--update-only",   action="store_true", help="只更新版本，不编译")
    parser.add_argument("--force-sidecar", action="store_true", help="强制重建本地 sidecar（openwork-server/orchestrator）")
    parser.add_argument("--debug",         action="store_true", help="Debug 模式（跳过代码签名，速度快）")
    parser.add_argument("--musl-linux",    action="store_true", help="编译 musl-linux-x64 主程序（openwork/server/router），跳过桌面 Tauri 构建")
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

    # musl-linux 主程序模式（跳过 Tauri 桌面构建）
    if args.musl_linux:
        do_build_musl_linux()
        print()
        ok(f"{'='*50}")
        ok(f"  musl-linux 编译完成！  v{version}  耗时 {elapsed(t0)}")
        ok(f"{'='*50}")
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
