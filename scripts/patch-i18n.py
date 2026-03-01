#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import io as _io, sys as _sys
# Windows GBK 控制台强制 UTF-8
_enc = getattr(_sys.stdout, 'encoding', '') or ''
if _enc.lower().replace('-','') not in ('utf8','utf-8'):
    try:
        _sys.stdout = _io.TextIOWrapper(_sys.stdout.buffer, encoding='utf-8', errors='replace')
        _sys.stderr = _io.TextIOWrapper(_sys.stderr.buffer, encoding='utf-8', errors='replace')
    except Exception: pass
"""
patch-i18n.py — 自动同步 en.ts 新增 key 到 zh.ts

用法:
    python3 scripts/patch-i18n.py [REPO_ROOT]

行为:
    1. 解析 packages/app/src/i18n/locales/en.ts，提取所有 key+value
    2. 解析 packages/app/src/i18n/locales/zh.ts，提取所有已有 key
    3. 找出 en.ts 有但 zh.ts 没有的 key（新增 key）
    4. 将新 key 追加到 zh.ts，按所属 section 分组，附英文原文作注针
    5. 输出统计：新增 N 个 key，[TODO] 标记待人工翻译

不翻译的专业术语（保持英文）:
    Skills, Plugins, Commands, Sessions, OpenCode, OpenWork,
    OpenPackage, MCPs, Soul, Inbox, Worker

[TODO] 标记: 所有自动补丁的 key 值都保留英文原文并添加 [TODO] 前缀，
提示维护者人工确认翻译。
"""

import re
import sys
from pathlib import Path
from typing import OrderedDict

# ── 不翻译的专业术语 ───────────────────────────────────────────────────────────
PRESERVE_TERMS = {
    "Skills", "Skill", "Plugins", "Plugin", "Commands", "Command",
    "Sessions", "Session", "OpenCode", "OpenWork", "OpenPackage",
    "MCPs", "MCP", "Soul", "Inbox", "Worker", "workers",
    "Alpha", "Beta", "GitHub", "Telegram", "WhatsApp", "Slack",
}

# ── 简易翻译表（常见 UI 词汇，无需 LLM） ────────────────────────────────────────
SIMPLE_TRANSLATIONS: dict[str, str] = {
    # 通用动词
    "Cancel": "取消",
    "Confirm": "确认",
    "Save": "保存",
    "Delete": "删除",
    "Remove": "移除",
    "Add": "添加",
    "Edit": "编辑",
    "Close": "关闭",
    "Open": "打开",
    "Create": "创建",
    "Update": "更新",
    "Submit": "提交",
    "Reset": "重置",
    "Retry": "重试",
    "Refresh": "刷新",
    "Search": "搜索",
    "Filter": "筛选",
    "Sort": "排序",
    "Copy": "复制",
    "Paste": "粘贴",
    "Upload": "上传",
    "Download": "下载",
    "Install": "安装",
    "Uninstall": "卸载",
    "Enable": "启用",
    "Disable": "禁用",
    "Connect": "连接",
    "Disconnect": "断开连接",
    "Login": "登录",
    "Logout": "退出登录",
    "Sign in": "登录",
    "Sign out": "退出",
    "Loading": "加载中",
    "Loading...": "加载中...",
    "Saving": "保存中",
    "Saving...": "保存中...",
    "Processing": "处理中",
    "Processing...": "处理中...",
    "Done": "完成",
    "Success": "成功",
    "Error": "错误",
    "Warning": "警告",
    "Info": "信息",
    "Back": "返回",
    "Next": "下一步",
    "Previous": "上一步",
    "Continue": "继续",
    "Skip": "跳过",
    "Finish": "完成",
    "Apply": "应用",
    "Preview": "预览",
    "Share": "分享",
    "Export": "导出",
    "Import": "导入",
    "Send": "发送",
    "Sent": "已发送",
    "Rename": "重命名",
    "Duplicate": "复制",
    "Move": "移动",
    "Archive": "归档",
    "Restore": "恢复",
    "Stop": "停止",
    "Pause": "暂停",
    "Resume": "恢复",
    "Restart": "重启",
    "Run": "运行",
    "Start": "开始",
    # 通用名词
    "Name": "名称",
    "Title": "标题",
    "Description": "描述",
    "Type": "类型",
    "Status": "状态",
    "Date": "日期",
    "Time": "时间",
    "Size": "大小",
    "Version": "版本",
    "Settings": "设置",
    "Config": "配置",
    "Configuration": "配置",
    "Options": "选项",
    "Preferences": "偏好设置",
    "Profile": "个人资料",
    "Account": "账户",
    "Password": "密码",
    "Email": "邮箱",
    "Username": "用户名",
    "Home": "主页",
    "Dashboard": "主页",
    "Overview": "概览",
    "Details": "详情",
    "Summary": "摘要",
    "History": "历史记录",
    "Logs": "日志",
    "Log": "日志",
    "Files": "文件",
    "File": "文件",
    "Folder": "文件夹",
    "Directory": "目录",
    "Path": "路径",
    "URL": "链接",
    "Link": "链接",
    "Tag": "标签",
    "Tags": "标签",
    "Category": "分类",
    "Language": "语言",
    "Theme": "主题",
    "Color": "颜色",
    "Icon": "图标",
    "Image": "图片",
    "Text": "文本",
    "Message": "消息",
    "Messages": "消息",
    "Notification": "通知",
    "Notifications": "通知",
    "Alert": "提示",
    "Confirm": "确认",
    "Note": "备注",
    "New": "新建",
    "List": "列表",
    "Table": "表格",
    "Grid": "网格",
    "View": "视图",
    "Mode": "模式",
    "Menu": "菜单",
    "Sidebar": "侧边栏",
    "Panel": "面板",
    "Dialog": "对话框",
    "Modal": "弹窗",
    "Popup": "弹出",
    "Tooltip": "提示",
    "Badge": "徽标",
    "Button": "按钮",
    "Input": "输入",
    "Output": "输出",
    "Result": "结果",
    "Results": "结果",
    "Response": "响应",
    "Request": "请求",
    "Action": "操作",
    "Actions": "操作",
    "Task": "任务",
    "Tasks": "任务",
    "Job": "作业",
    "Jobs": "作业",
    "Project": "项目",
    "Projects": "项目",
    "Workspace": "工作区",
    "Workspaces": "工作区",
    "Team": "团队",
    "User": "用户",
    "Users": "用户",
    "Role": "角色",
    "Permission": "权限",
    "Permissions": "权限",
    "Token": "令牌",
    "Key": "密钥",
    "Secret": "密钥",
    "API": "API",
    "Model": "模型",
    "Models": "模型",
    "Provider": "提供商",
    "Providers": "提供商",
    "Agent": "助手",
    "Agents": "助手",
    "Tools": "工具",
    "Tool": "工具",
    "Step": "步骤",
    "Steps": "步骤",
    "Runs": "运行",
    "Run": "运行",
    "Output": "输出",
    "Connected": "已连接",
    "Disconnected": "已断开",
    "Connecting": "连接中",
    "Online": "在线",
    "Offline": "离线",
    "Active": "活跃",
    "Inactive": "未激活",
    "Enabled": "已启用",
    "Disabled": "已禁用",
    "Required": "必填",
    "Optional": "可选",
    "Default": "默认",
    "Advanced": "高级",
    "Basic": "基本",
    "Custom": "自定义",
    "Local": "本地",
    "Remote": "远程",
    "Busy": "忙碌",
    "Idle": "空闲",
    "Ready": "就绪",
    "Failed": "失败",
    "Pending": "等待中",
    "Unknown": "未知",
    "None": "无",
    "All": "全部",
    "More": "更多",
    "Less": "收起",
    "Show": "显示",
    "Hide": "隐藏",
    "Expand": "展开",
    "Collapse": "收起",
    "Yes": "是",
    "No": "否",
    "OK": "确定",
    "Okay": "确定",
    "Agree": "同意",
    "Disagree": "不同意",
    "Accept": "接受",
    "Reject": "拒绝",
    "Approve": "批准",
    "Deny": "拒绝",
    "Revoke": "撤销",
    "Grant": "授权",
}


def parse_ts_locale(content: str) -> tuple[list[tuple[str, str, str | None]], list[str]]:
    """
    解析 TypeScript locale 文件，返回:
      entries: [(key, value, section_comment_or_None), ...]
      raw_lines: 原始行列表（用于重建文件）

    支持格式:
      "some.key": "Some value",
      // ===== Section =====
    """
    entries: list[tuple[str, str, str | None]] = []
    current_section: str | None = None

    # 匹配 key-value 对
    kv_re = re.compile(r'^\s*"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$')
    # 匹配 section 注释
    section_re = re.compile(r'^\s*//\s*={3,}\s*(.+?)\s*={0,}\s*$')

    for line in content.splitlines():
        section_m = section_re.match(line)
        if section_m:
            current_section = section_m.group(1).strip("= \t")
            continue
        kv_m = kv_re.match(line)
        if kv_m:
            entries.append((kv_m.group(1), kv_m.group(2), current_section))

    return entries, content.splitlines()


def translate_value(en_value: str) -> str:
    """
    简单翻译：精确匹配 SIMPLE_TRANSLATIONS，否则标记 [TODO]
    保留 {placeholder} 变量。
    """
    # 精确匹配
    if en_value in SIMPLE_TRANSLATIONS:
        return SIMPLE_TRANSLATIONS[en_value]

    # 检查是否全是专业术语（保持英文）
    words = re.findall(r'\b\w+\b', en_value)
    if all(w in PRESERVE_TERMS for w in words if w):
        return en_value

    # 否则标记 TODO，保留英文原文
    return f"[TODO] {en_value}"


def build_patch_lines(
    missing: list[tuple[str, str, str | None]]
) -> list[str]:
    """将缺失的 key 按 section 分组，生成要插入的行。"""
    if not missing:
        return []

    lines: list[str] = []
    current_section: str | None = object()  # sentinel

    lines.append("")
    lines.append("  // ==================== 自动补丁 (patch-i18n.py) ====================")

    last_section: str | None = object()  # sentinel
    for key, en_val, section in missing:
        if section != last_section:
            sec_label = section if section else "其他"
            lines.append(f"  // --- {sec_label} ---")
            last_section = section
        zh_val = translate_value(en_val)
        lines.append(f'  "{key}": "{zh_val}",  // EN: {en_val}')

    return lines


def patch_zh(repo_root: Path) -> int:
    en_path = repo_root / "packages/app/src/i18n/locales/en.ts"
    zh_path = repo_root / "packages/app/src/i18n/locales/zh.ts"

    if not en_path.exists():
        print(f"[error] 找不到 en.ts: {en_path}", file=sys.stderr)
        return 1
    if not zh_path.exists():
        print(f"[error] 找不到 zh.ts: {zh_path}", file=sys.stderr)
        return 1

    # newline='' 保留原始行尾（Windows CRLF 不被归一化）
    en_content = en_path.read_text(encoding="utf-8", errors="replace")
    zh_raw = zh_path.read_bytes()
    # 检测原始行尾格式
    zh_crlf = b"\r\n" in zh_raw
    zh_content = zh_raw.decode("utf-8", errors="replace")

    en_entries, _ = parse_ts_locale(en_content)
    zh_entries, zh_lines = parse_ts_locale(zh_content)

    en_keys = [e[0] for e in en_entries]
    zh_keys = set(e[0] for e in zh_entries)

    # 按 en.ts 顺序找出缺失的 key
    missing = [(k, v, s) for k, v, s in en_entries if k not in zh_keys]

    print(f"[patch-i18n] en.ts 共 {len(en_keys)} 个 key")
    print(f"[patch-i18n] zh.ts 已有 {len(zh_keys)} 个 key")
    print(f"[patch-i18n] 缺失 {len(missing)} 个 key 需要补丁")

    if not missing:
        print("[patch-i18n] 无需更新，zh.ts 已完整")
        return 0

    # 找到 zh.ts 末尾的 "} as const;" 行并在其前插入
    closing_re = re.compile(r'^\s*\}\s*as\s*const\s*;?\s*$')
    insert_before: int | None = None
    for i, line in enumerate(zh_lines):
        if closing_re.match(line):
            insert_before = i
            break

    if insert_before is None:
        print("[error] 无法找到 zh.ts 末尾的 '} as const;'", file=sys.stderr)
        return 1

    patch_lines = build_patch_lines(missing)
    new_lines = zh_lines[:insert_before] + patch_lines + zh_lines[insert_before:]
    new_content = "\n".join(new_lines) + "\n"
    # 恢复原始行尾格式，避免 git 把 CRLF 当作内容变更
    if zh_crlf:
        new_content = new_content.replace("\n", "\r\n")
    zh_path.write_bytes(new_content.encode("utf-8"))

    todo_count = sum(1 for _, v, _ in missing if translate_value(v).startswith("[TODO]"))
    auto_count = len(missing) - todo_count

    print(f"[patch-i18n] 已写入 zh.ts:")
    print(f"  自动翻译: {auto_count} 个")
    print(f"  [TODO] 待翻译: {todo_count} 个 (搜索 '[TODO]' 确认)")
    return 2  # 出口码 2 = 有新 key 已写入（shell 脚本用此判断是否提交）


if __name__ == "__main__":
    repo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
    sys.exit(patch_zh(repo_root))
