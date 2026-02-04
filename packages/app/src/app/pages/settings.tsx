import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

import { formatBytes, formatRelativeTime, isTauriRuntime } from "../utils";

import Button from "../components/button";
import LanguagePickerModal from "../components/language-picker-modal";
import TextInput from "../components/text-input";
import SettingsKeybinds, { type KeybindSetting } from "../components/settings-keybinds";
import { HardDrive, MessageCircle, PlugZap, RefreshCcw, Shield, Smartphone, X } from "lucide-solid";
import type { OpencodeConnectStatus, ProviderListItem, SettingsTab, StartupPreference } from "../types";
import { createOpenworkServerClient } from "../lib/openwork-server";
import type {
  OpenworkAuditEntry,
  OpenworkServerCapabilities,
  OpenworkServerDiagnostics,
  OpenworkServerSettings,
  OpenworkServerStatus,
} from "../lib/openwork-server";
import type {
  EngineInfo,
  OpenwrkBinaryInfo,
  OpenwrkStatus,
  OpenworkServerInfo,
  OwpenbotInfo,
  OwpenbotStatus,
  OwpenbotPairingRequest,
} from "../lib/tauri";
import { LANGUAGE_OPTIONS, currentLocale, setLocale, t } from "../../i18n";
import {
  getOwpenbotStatus,
  getOwpenbotStatusDetailed,
  getOwpenbotQr,
  setOwpenbotDmPolicy,
  setOwpenbotAllowlist,
  setOwpenbotTelegramToken,
  getOwpenbotPairingRequests,
  approveOwpenbotPairing,
  denyOwpenbotPairing,
  owpenbotRestart,
  owpenbotStop,
  getOwpenbotGroupsEnabled,
  setOwpenbotGroupsEnabled,
} from "../lib/tauri";

export type SettingsViewProps = {
  startupPreference: StartupPreference | null;
  baseUrl: string;
  headerStatus: string;
  busy: boolean;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  providers: ProviderListItem[];
  providerConnectedIds: string[];
  providerAuthBusy: boolean;
  openProviderAuthModal: () => Promise<void>;
  openworkServerStatus: OpenworkServerStatus;
  openworkServerUrl: string;
  openworkServerSettings: OpenworkServerSettings;
  openworkServerHostInfo: OpenworkServerInfo | null;
  openworkServerCapabilities: OpenworkServerCapabilities | null;
  openworkServerDiagnostics: OpenworkServerDiagnostics | null;
  openworkServerWorkspaceId: string | null;
  clientConnected: boolean;
  canReloadWorkspace: boolean;
  openworkAuditEntries: OpenworkAuditEntry[];
  openworkAuditStatus: "idle" | "loading" | "error";
  openworkAuditError: string | null;
  opencodeConnectStatus: OpencodeConnectStatus | null;
  engineInfo: EngineInfo | null;
  openwrkStatus: OpenwrkStatus | null;
  owpenbotInfo: OwpenbotInfo | null;
  reloadWorkspaceEngine: () => Promise<void>;
  reloadBusy: boolean;
  reloadError: string | null;
  updateOpenworkServerSettings: (next: OpenworkServerSettings) => void;
  resetOpenworkServerSettings: () => void;
  testOpenworkServerConnection: (next: OpenworkServerSettings) => Promise<boolean>;
  developerMode: boolean;
  toggleDeveloperMode: () => void;
  stopHost: () => void;
  keybindItems: KeybindSetting[];
  onOverrideKeybind: (id: string, keybind: string | null) => void;
  onResetKeybind: (id: string) => void;
  onResetAllKeybinds: () => void;
  engineSource: "path" | "sidecar";
  setEngineSource: (value: "path" | "sidecar") => void;
  engineRuntime: "direct" | "openwrk";
  setEngineRuntime: (value: "direct" | "openwrk") => void;
  isWindows: boolean;
  defaultModelLabel: string;
  defaultModelRef: string;
  openDefaultModelPicker: () => void;
  showThinking: boolean;
  toggleShowThinking: () => void;
  modelVariantLabel: string;
  editModelVariant: () => void;
  themeMode: "light" | "dark" | "system";
  setThemeMode: (value: "light" | "dark" | "system") => void;
  updateAutoCheck: boolean;
  toggleUpdateAutoCheck: () => void;
  updateStatus: {
    state: string;
    lastCheckedAt?: number | null;
    version?: string;
    date?: string;
    notes?: string;
    totalBytes?: number | null;
    downloadedBytes?: number;
    message?: string;
  } | null;
  updateEnv: { supported?: boolean; reason?: string | null } | null;
  appVersion: string | null;
  checkForUpdates: () => void;
  downloadUpdate: () => void;
  installUpdateAndRestart: () => void;
  anyActiveRuns: boolean;
  onResetStartupPreference: () => void;
  openResetModal: (mode: "onboarding" | "all") => void;
  resetModalBusy: boolean;
  pendingPermissions: unknown;
  events: unknown;
  safeStringify: (value: unknown) => string;
  repairOpencodeCache: () => void;
  cacheRepairBusy: boolean;
  cacheRepairResult: string | null;
  notionStatus: "disconnected" | "connecting" | "connected" | "error";
  notionStatusDetail: string | null;
  notionError: string | null;
  notionBusy: boolean;
  connectNotion: () => void;
  engineDoctorVersion: string | null;
};

// Owpenbot Settings Component
function OwpenbotSettings(props: {
  busy: boolean;
  openworkServerStatus: OpenworkServerStatus;
  openworkServerUrl: string;
  openworkServerSettings: OpenworkServerSettings;
  openworkServerWorkspaceId: string | null;
  openworkServerHostInfo: OpenworkServerInfo | null;
  developerMode: boolean;
}) {
  const [owpenbotStatus, setOwpenbotStatus] = createSignal<OwpenbotStatus | null>(null);
  const [qrCode, setQrCode] = createSignal<string | null>(null);
  const [qrLoading, setQrLoading] = createSignal(false);
  const [pairingRequests, setPairingRequests] = createSignal<OwpenbotPairingRequest[]>([]);
  const [telegramToken, setTelegramToken] = createSignal("");
  const [telegramTokenVisible, setTelegramTokenVisible] = createSignal(false);
  const [newAllowlistEntry, setNewAllowlistEntry] = createSignal("");
  const [savingPolicy, setSavingPolicy] = createSignal(false);
  const [savingAllowlist, setSavingAllowlist] = createSignal(false);
  const [savingTelegram, setSavingTelegram] = createSignal(false);
  const [groupsEnabled, setGroupsEnabled] = createSignal<boolean | null>(null);
  const [savingGroups, setSavingGroups] = createSignal(false);
  const [telegramCheckState, setTelegramCheckState] = createSignal<
    "idle" | "checking" | "success" | "warning" | "error"
  >("idle");
  const [telegramCheckMessage, setTelegramCheckMessage] = createSignal<string | null>(null);
  const [telegramCheckDetail, setTelegramCheckDetail] = createSignal<string | null>(null);
  const translate = (key: string) => t(key, currentLocale());
  const openworkServerClient = createMemo(() => {
    const baseUrl = props.openworkServerUrl.trim();
    const localBaseUrl = props.openworkServerHostInfo?.baseUrl?.trim() ?? "";
    const hostToken = props.openworkServerHostInfo?.hostToken?.trim() ?? "";
    const clientToken = props.openworkServerHostInfo?.clientToken?.trim() ?? "";
    const settingsToken = props.openworkServerSettings.token?.trim() ?? "";
    // Use clientToken only when connecting to the local server; use settingsToken for remote
    const isLocalServer = localBaseUrl && baseUrl === localBaseUrl;
    const token = isLocalServer ? (clientToken || settingsToken) : (settingsToken || clientToken);
    if (!baseUrl || !token || !props.openworkServerWorkspaceId) return null;
    return createOpenworkServerClient({ baseUrl, token, hostToken: isLocalServer ? hostToken : undefined });
  });
  const debugOwpenbot = (message: string, data?: Record<string, unknown>) => {
    if (!props.developerMode) return;
    const payload = data ? ` ${JSON.stringify(data)}` : "";
    console.debug(`[owpenbot] ${message}${payload}`);
  };

  // Load owpenbot status on mount
  onMount(async () => {
    await refreshStatus();
    await refreshPairingRequests();
    await refreshGroupsEnabled();
  });

  const refreshGroupsEnabled = async () => {
    const enabled = await getOwpenbotGroupsEnabled();
    setGroupsEnabled(enabled);
  };

  const handleGroupsToggle = async () => {
    if (savingGroups()) return;
    const current = groupsEnabled();
    const newValue = current === null ? true : !current;
    setSavingGroups(true);
    try {
      const result = await setOwpenbotGroupsEnabled(newValue);
      if (result.ok) {
        setGroupsEnabled(newValue);
      }
    } finally {
      setSavingGroups(false);
    }
  };

  const refreshStatus = async () => {
    const status = await getOwpenbotStatus();
    setOwpenbotStatus(status);
  };

  const refreshPairingRequests = async () => {
    const requests = await getOwpenbotPairingRequests();
    setPairingRequests(requests);
  };

  const setTelegramFeedback = (
    state: "checking" | "success" | "warning" | "error",
    message: string,
    detail?: string | null,
  ) => {
    setTelegramCheckState(state);
    setTelegramCheckMessage(message);
    setTelegramCheckDetail(detail ?? null);
  };

  const resetTelegramFeedback = () => {
    setTelegramCheckState("idle");
    setTelegramCheckMessage(null);
    setTelegramCheckDetail(null);
  };

  const normalizeTelegramError = (raw: string) =>
    raw.replace(/^Error:\s*/i, "").replace(/^Failed to [^:]+:\s*/i, "").trim();

  const formatTelegramError = (raw: string) => {
    const cleaned = normalizeTelegramError(raw);
    const lower = cleaned.toLowerCase();
    if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("token is wrong")) {
      return {
        summary: translate("settings.messaging.telegram.error.token_rejected"),
        detail: translate("settings.messaging.telegram.error.token_rejected_detail"),
      };
    }
    if (lower.includes("409") || lower.includes("conflict") || lower.includes("getupdates")) {
      return {
        summary: translate("settings.messaging.telegram.error.instance_running"),
        detail: translate("settings.messaging.telegram.error.instance_running_detail"),
      };
    }
    const detail = cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
    return {
      summary: translate("settings.messaging.telegram.error.check_failed"),
      detail: detail || null,
    };
  };

  const showQrCode = async () => {
    setQrLoading(true);
    try {
      const qr = await getOwpenbotQr();
      if (qr) {
        setQrCode(qr.qr);
      }
    } finally {
      setQrLoading(false);
    }
  };

  const hideQrCode = () => {
    setQrCode(null);
  };

  const handleDmPolicyChange = async (policy: OwpenbotStatus["whatsapp"]["dmPolicy"]) => {
    setSavingPolicy(true);
    try {
      await setOwpenbotDmPolicy(policy);
      await refreshStatus();
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleAddAllowlistEntry = async () => {
    const entry = newAllowlistEntry().trim();
    if (!entry) return;
    
    setSavingAllowlist(true);
    try {
      const current = owpenbotStatus()?.whatsapp.allowFrom || [];
      if (!current.includes(entry)) {
        await setOwpenbotAllowlist([...current, entry]);
        await refreshStatus();
      }
      setNewAllowlistEntry("");
    } finally {
      setSavingAllowlist(false);
    }
  };

  const handleRemoveAllowlistEntry = async (entry: string) => {
    setSavingAllowlist(true);
    try {
      const current = owpenbotStatus()?.whatsapp.allowFrom || [];
      await setOwpenbotAllowlist(current.filter((e) => e !== entry));
      await refreshStatus();
    } finally {
      setSavingAllowlist(false);
    }
  };

  const handleSaveTelegramToken = async () => {
    const token = telegramToken().trim();
    if (!token || savingTelegram()) return;

    setSavingTelegram(true);
    try {
      const latestStatus = await getOwpenbotStatus();
      if (latestStatus) {
        setOwpenbotStatus(latestStatus);
      }
      const serverClient = openworkServerClient();
      const workspaceId = props.openworkServerWorkspaceId;
      const useRemote = Boolean(serverClient && workspaceId);
      debugOwpenbot("save-token:start", {
        connection: props.openworkServerHostInfo ? "local" : "remote",
        tauri: isTauriRuntime(),
        useRemote,
        openworkServerStatus: props.openworkServerStatus,
        openworkServerUrl: props.openworkServerUrl,
        openworkServerWorkspaceId: props.openworkServerWorkspaceId,
        owpenbotHealthPort: latestStatus?.healthPort ?? owpenbotStatus()?.healthPort ?? null,
        hasToken: Boolean(
          (props.openworkServerHostInfo?.clientToken?.trim() || props.openworkServerSettings.token?.trim()) ?? false,
        ),
      });
      if (useRemote && serverClient && workspaceId) {
        if (props.openworkServerStatus === "disconnected") {
          setTelegramFeedback(
            "error",
            translate("settings.messaging.telegram.server_disconnected"),
            translate("settings.messaging.telegram.server_disconnected_detail"),
          );
          debugOwpenbot("save-token:remote-missing-client", {
            openworkServerStatus: props.openworkServerStatus,
            openworkServerUrl: props.openworkServerUrl,
            openworkServerWorkspaceId: props.openworkServerWorkspaceId,
          });
          return;
        }

        setTelegramFeedback("checking", translate("settings.messaging.telegram.saving_host"));
        try {
          await serverClient.setOwpenbotTelegramToken(
            workspaceId,
            token,
            latestStatus?.healthPort ?? owpenbotStatus()?.healthPort ?? null,
          );
          debugOwpenbot("save-token:remote-success");
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          setTelegramFeedback("error", translate("settings.messaging.telegram.save_failed"), detail || null);
          debugOwpenbot("save-token:remote-error", { detail });
          return;
        }

        setTelegramFeedback("success", translate("settings.messaging.telegram.token_saved"));
        setTelegramToken("");
        return;
      }

      setTelegramFeedback("checking", translate("settings.messaging.telegram.saving_verifying"));
      const result = await setOwpenbotTelegramToken(token);
      if (!result.ok) {
        const detail = normalizeTelegramError(result.stderr || "");
        setTelegramFeedback("error", translate("settings.messaging.telegram.save_failed"), detail || null);
        debugOwpenbot("save-token:local-error", { detail });
        return;
      }

      const statusResult = await getOwpenbotStatusDetailed();
      if (!statusResult.ok) {
        const parsed = formatTelegramError(statusResult.error || translate("settings.messaging.telegram.verify_failed"));
        setOwpenbotStatus(null);
        setTelegramFeedback("error", parsed.summary, parsed.detail);
        return;
      }

      const status = statusResult.status;
      setOwpenbotStatus(status);

      if (!status.telegram.configured) {
        setTelegramFeedback(
          "error",
          translate("settings.messaging.telegram.saved_unconfigured"),
          translate("settings.messaging.telegram.check_token"),
        );
        return;
      }
      if (!status.running) {
        setTelegramFeedback(
          "warning",
          translate("settings.messaging.telegram.bridge_offline"),
          translate("settings.messaging.telegram.start_openwork"),
        );
        return;
      }
      if (!status.telegram.enabled) {
        setTelegramFeedback(
          "warning",
          translate("settings.messaging.telegram.saved_disabled"),
          translate("settings.messaging.telegram.enable_bot"),
        );
        return;
      }

      setTelegramFeedback("success", translate("settings.messaging.telegram.connected"));
      setTelegramToken("");
    } finally {
      setSavingTelegram(false);
    }
  };

  const handleApprovePairing = async (code: string) => {
    await approveOwpenbotPairing(code);
    await refreshPairingRequests();
  };

  const handleDenyPairing = async (code: string) => {
    await denyOwpenbotPairing(code);
    await refreshPairingRequests();
  };

  const bridgeStatusStyle = createMemo(() => {
    if (owpenbotStatus()?.running) {
      return "bg-green-7/10 text-green-11 border-green-7/20";
    }
    return "bg-gray-4/60 text-gray-11 border-gray-7/50";
  });

  const whatsappStatusStyle = createMemo(() => {
    if (owpenbotStatus()?.whatsapp.linked) {
      return "text-green-11";
    }
    return "text-gray-9";
  });

  const telegramStatusStyle = createMemo(() => {
    if (owpenbotStatus()?.telegram.configured) {
      return "text-green-11";
    }
    return "text-gray-9";
  });

  const telegramCheckStyle = createMemo(() => {
    switch (telegramCheckState()) {
      case "success":
        return "bg-green-7/10 text-green-11 border-green-7/20";
      case "warning":
        return "bg-amber-7/10 text-amber-11 border-amber-7/20";
      case "error":
        return "bg-red-7/10 text-red-11 border-red-7/20";
      case "checking":
        return "bg-gray-4/60 text-gray-11 border-gray-7/50";
      default:
        return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    }
  });

  const dmPolicyOptions: { value: OwpenbotStatus["whatsapp"]["dmPolicy"]; label: string; description: string }[] = [
    {
      value: "pairing",
      label: translate("settings.messaging.dm_policy.pairing"),
      description: translate("settings.messaging.dm_policy.pairing_description"),
    },
    {
      value: "allowlist",
      label: translate("settings.messaging.dm_policy.allowlist"),
      description: translate("settings.messaging.dm_policy.allowlist_description"),
    },
    {
      value: "open",
      label: translate("settings.messaging.dm_policy.open"),
      description: translate("settings.messaging.dm_policy.open_description"),
    },
    {
      value: "disabled",
      label: translate("settings.messaging.dm_policy.disabled"),
      description: translate("settings.messaging.dm_policy.disabled_description"),
    },
  ];

  return (
    <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <MessageCircle size={16} class="text-gray-11" />
            <div class="text-sm font-medium text-gray-12">{translate("settings.messaging.title")}</div>
          </div>
          <div class="text-xs text-gray-10 mt-1">{translate("settings.messaging.subtitle")}</div>
        </div>
        <div class={`text-xs px-2 py-1 rounded-full border ${bridgeStatusStyle()}`}>
          {owpenbotStatus()?.running ? translate("settings.status.running") : translate("settings.status.offline")}
        </div>
      </div>

      {/* Telegram Section */}
      <div class="bg-gray-1 rounded-xl border border-gray-6 p-4 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-blue-7/20 flex items-center justify-center">
              <span class="text-xs">T</span>
            </div>
            <span class="text-sm font-medium text-gray-12">Telegram</span>
          </div>
          <span class={`text-xs ${telegramStatusStyle()}`}>
            {owpenbotStatus()?.telegram.configured
              ? translate("settings.messaging.telegram.configured")
              : translate("settings.messaging.telegram.not_configured")}
          </span>
        </div>

        <div class="space-y-2">
          <div class="text-xs font-medium text-gray-11">{translate("settings.messaging.telegram.bot_token")}</div>
          <div class="flex gap-2">
            <div class="flex-1 flex items-center gap-2">
              <input
                type={telegramTokenVisible() ? "text" : "password"}
                value={telegramToken()}
                onInput={(e) => {
                  setTelegramToken(e.currentTarget.value);
                  if (telegramCheckState() !== "idle") {
                    resetTelegramFeedback();
                  }
                }}
                placeholder={translate("settings.messaging.telegram.placeholder")}
                class="flex-1 rounded-lg bg-gray-2/60 px-3 py-2 text-sm text-gray-12 placeholder:text-gray-10 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] focus:outline-none focus:ring-2 focus:ring-gray-6/20"
                disabled={props.busy || savingTelegram()}
              />
              <Button
                variant="outline"
                class="text-xs h-9 px-3 shrink-0"
                onClick={() => setTelegramTokenVisible((prev) => !prev)}
              >
                {telegramTokenVisible() ? translate("common.hide") : translate("common.show")}
              </Button>
            </div>
            <Button
              variant="secondary"
              class="text-xs h-9 px-3"
              onClick={handleSaveTelegramToken}
              disabled={props.busy || savingTelegram() || !telegramToken().trim()}
            >
              {savingTelegram() ? translate("settings.messaging.saving") : translate("common.save")}
            </Button>
          </div>
          <Show when={telegramCheckState() !== "idle"}>
            <div class={`text-[11px] px-2 py-1 rounded-lg border ${telegramCheckStyle()}`}>
              {telegramCheckMessage()}
            </div>
            <Show when={telegramCheckDetail()}>
              <div class="text-[11px] text-gray-9">{telegramCheckDetail()}</div>
            </Show>
          </Show>
          <div class="text-[11px] text-gray-8">
            {translate("settings.messaging.telegram.help")}
          </div>
        </div>

        <Show when={owpenbotStatus()?.telegram.configured}>
          <div class="flex items-center justify-between bg-gray-2/50 rounded-lg p-3">
            <div class="text-xs text-gray-11">
              {owpenbotStatus()?.telegram.enabled
                ? translate("settings.messaging.telegram.enabled")
                : translate("settings.messaging.telegram.disabled")}
            </div>
          </div>
        </Show>
      </div>

      {/* WhatsApp Section */}
      <div class="bg-gray-1 rounded-xl border border-gray-6 p-4 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-green-7/20 flex items-center justify-center">
              <span class="text-xs">W</span>
            </div>
            <span class="text-sm font-medium text-gray-12">WhatsApp</span>
            <span class="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-7/10 text-amber-11 border border-amber-7/30">
              {translate("settings.messaging.alpha")}
            </span>
          </div>
          <span class={`text-xs ${whatsappStatusStyle()}`}>
            {owpenbotStatus()?.whatsapp.linked
              ? translate("settings.messaging.whatsapp.linked")
              : translate("settings.messaging.whatsapp.not_linked")}
          </span>
        </div>

        <div class="text-[11px] text-amber-11">
          {translate("settings.messaging.whatsapp.help")}
        </div>

        {/* QR Code Section */}
        <Show when={!owpenbotStatus()?.whatsapp.linked}>
          <div class="space-y-3">
            <Show
              when={qrCode()}
              fallback={
                <Button
                  variant="secondary"
                  class="w-full"
                  onClick={showQrCode}
                  disabled={props.busy || qrLoading()}
                >
                  {qrLoading()
                    ? translate("settings.messaging.whatsapp.loading_qr")
                    : translate("settings.messaging.whatsapp.show_qr")}
                </Button>
              }
            >
              <div class="relative">
                <div class="flex justify-center p-4 bg-white rounded-lg">
                  <img
                    src={`data:image/png;base64,${qrCode()}`}
                    alt="WhatsApp QR Code"
                    class="w-48 h-48"
                  />
                </div>
                <button
                  class="absolute top-2 right-2 p-1 rounded-full bg-gray-12/80 text-gray-1 hover:bg-gray-12"
                  onClick={hideQrCode}
                >
                  <X size={14} />
                </button>
                <div class="text-xs text-gray-10 text-center mt-2">
                  {translate("settings.messaging.whatsapp.scan_hint")}
                </div>
              </div>
            </Show>
          </div>
        </Show>

        {/* DM Policy */}
        <div class="space-y-2">
          <div class="text-xs font-medium text-gray-11">{translate("settings.messaging.dm_policy.title")}</div>
          <div class="grid grid-cols-2 gap-2">
            <For each={dmPolicyOptions}>
              {(option) => (
                <button
                  class={`px-3 py-2 rounded-lg text-left transition-colors ${
                    owpenbotStatus()?.whatsapp.dmPolicy === option.value
                      ? "bg-gray-4 border border-gray-7"
                      : "bg-gray-2/60 border border-gray-6/50 hover:bg-gray-3"
                  }`}
                  onClick={() => handleDmPolicyChange(option.value)}
                  disabled={props.busy || savingPolicy()}
                >
                  <div class="text-xs font-medium text-gray-12">{option.label}</div>
                  <div class="text-[11px] text-gray-10">{option.description}</div>
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Allowlist Editor */}
        <Show when={owpenbotStatus()?.whatsapp.dmPolicy === "allowlist"}>
          <div class="space-y-2">
            <div class="text-xs font-medium text-gray-11">{translate("settings.messaging.allowlist.title")}</div>
            <div class="flex gap-2">
              <input
                type="text"
                value={newAllowlistEntry()}
                onInput={(e) => setNewAllowlistEntry(e.currentTarget.value)}
                placeholder="+1234567890"
                class="flex-1 rounded-lg bg-gray-2/60 px-3 py-2 text-sm text-gray-12 placeholder:text-gray-10 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] focus:outline-none focus:ring-2 focus:ring-gray-6/20"
                disabled={props.busy || savingAllowlist()}
              />
              <Button
                variant="secondary"
                class="text-xs h-9 px-3"
                onClick={handleAddAllowlistEntry}
                disabled={props.busy || savingAllowlist() || !newAllowlistEntry().trim()}
              >
                {translate("settings.messaging.allowlist.add")}
              </Button>
            </div>
            <Show when={(owpenbotStatus()?.whatsapp.allowFrom || []).length > 0}>
              <div class="flex flex-wrap gap-2 mt-2">
                <For each={owpenbotStatus()?.whatsapp.allowFrom || []}>
                  {(entry) => (
                    <span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-3 border border-gray-6 text-xs text-gray-12">
                      {entry}
                      <button
                        class="p-0.5 rounded hover:bg-gray-4"
                        onClick={() => handleRemoveAllowlistEntry(entry)}
                        disabled={props.busy || savingAllowlist()}
                      >
                        <X size={12} class="text-gray-10" />
                      </button>
                    </span>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Groups Settings */}
      <div class="bg-gray-1 rounded-xl border border-gray-6 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm font-medium text-gray-12">{translate("settings.messaging.groups.title")}</div>
            <div class="text-xs text-gray-10">{translate("settings.messaging.groups.subtitle")}</div>
          </div>
          <Button
            variant={groupsEnabled() ? "secondary" : "outline"}
            class="text-xs h-8 py-0 px-3"
            onClick={handleGroupsToggle}
            disabled={props.busy || savingGroups() || groupsEnabled() === null}
          >
            {savingGroups()
              ? translate("settings.messaging.saving")
              : groupsEnabled()
                ? translate("settings.messaging.enabled")
                : translate("settings.messaging.disabled")}
          </Button>
        </div>
      </div>

      {/* Pairing Requests */}
      <Show when={pairingRequests().length > 0}>
        <div class="bg-gray-1 rounded-xl border border-amber-7/30 p-4 space-y-3">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-amber-9 animate-pulse" />
            <span class="text-sm font-medium text-gray-12">{translate("settings.messaging.pairing.title")}</span>
          </div>
          <div class="divide-y divide-gray-6/50">
            <For each={pairingRequests()}>
              {(request) => (
                <div class="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div class="min-w-0">
                    <div class="text-sm text-gray-12 truncate">{request.peerId}</div>
                    <div class="text-[11px] text-gray-9">
                      {request.platform === "whatsapp"
                        ? translate("settings.messaging.pairing.whatsapp")
                        : translate("settings.messaging.pairing.telegram")}
                      · {formatRelativeTime(request.timestamp)}
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <Button
                      variant="secondary"
                      class="text-xs h-8 py-0 px-3"
                      onClick={() => handleApprovePairing(request.code)}
                      disabled={props.busy}
                    >
                      {translate("settings.messaging.pairing.approve")}
                    </Button>
                    <Button
                      variant="ghost"
                      class="text-xs h-8 py-0 px-3"
                      onClick={() => handleDenyPairing(request.code)}
                      disabled={props.busy}
                    >
                      {translate("settings.messaging.pairing.deny")}
                    </Button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Info Note */}
      <div class="text-[11px] text-gray-8">
        {translate("settings.messaging.note")}
      </div>
    </div>
  );
}

export default function SettingsView(props: SettingsViewProps) {
  const [languageModalOpen, setLanguageModalOpen] = createSignal(false);
  const translate = (key: string) => t(key, currentLocale());
  const currentLanguageOption = createMemo(() =>
    LANGUAGE_OPTIONS.find((option) => option.value === currentLocale()),
  );
  const currentLanguageLabel = createMemo(() => currentLanguageOption()?.nativeName ?? currentLocale());

  const updateState = () => props.updateStatus?.state ?? "idle";
  const updateNotes = () => props.updateStatus?.notes ?? null;
  const updateVersion = () => props.updateStatus?.version ?? null;
  const updateDate = () => props.updateStatus?.date ?? null;
  const updateLastCheckedAt = () => props.updateStatus?.lastCheckedAt ?? null;
  const updateDownloadedBytes = () => props.updateStatus?.downloadedBytes ?? null;
  const updateTotalBytes = () => props.updateStatus?.totalBytes ?? null;
  const updateErrorMessage = () => props.updateStatus?.message ?? null;

  const isMacToolbar = createMemo(() => {
    if (props.isWindows) return false;
    if (typeof navigator === "undefined") return false;
    const platform =
      typeof (navigator as any).userAgentData?.platform === "string"
        ? (navigator as any).userAgentData.platform
        : typeof navigator.platform === "string"
          ? navigator.platform
          : "";
    const ua = typeof navigator.userAgent === "string" ? navigator.userAgent : "";
    return /mac/i.test(platform) || /mac/i.test(ua);
  });

  const showUpdateToolbar = createMemo(() => {
    if (!isTauriRuntime()) return false;
    if (props.updateEnv && props.updateEnv.supported === false) return false;
    return isMacToolbar();
  });

  const updateToolbarTone = createMemo(() => {
    switch (updateState()) {
      case "available":
        return "bg-amber-7/10 text-amber-11 border-amber-7/20";
      case "ready":
        return "bg-green-7/10 text-green-11 border-green-7/20";
      case "error":
        return "bg-red-7/10 text-red-11 border-red-7/20";
      case "checking":
      case "downloading":
        return "bg-gray-4/60 text-gray-11 border-gray-7/50";
      default:
        return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    }
  });

  const updateToolbarSpinning = createMemo(() => updateState() === "checking" || updateState() === "downloading");

  const updateToolbarLabel = createMemo(() => {
    const state = updateState();
    const version = updateVersion();
    if (state === "available") {
      return translate("settings.update_available").replace(
        "{version}",
        version ? `v${version}` : "",
      );
    }
    if (state === "ready") {
      return translate("settings.update_ready").replace(
        "{version}",
        version ? `v${version}` : "",
      );
    }
    if (state === "downloading") {
      const downloaded = updateDownloadedBytes() ?? 0;
      const total = updateTotalBytes();
      const progress = total != null ? `${formatBytes(downloaded)} / ${formatBytes(total)}` : formatBytes(downloaded);
      return translate("settings.update_downloading").replace("{progress}", progress);
    }
    if (state === "checking") {
      return translate("settings.update_checking");
    }
    if (state === "error") {
      return translate("settings.update_failed");
    }
    return translate("settings.update_uptodate");
  });

  const updateToolbarActionLabel = createMemo(() => {
    const state = updateState();
    if (state === "available") return translate("settings.download_update");
    if (state === "ready") return translate("settings.install_update");
    if (state === "error") return translate("common.retry");
    if (state === "idle") return translate("settings.check_update");
    return null;
  });

  const updateToolbarDisabled = createMemo(() => {
    const state = updateState();
    if (state === "checking" || state === "downloading") return true;
    if (state === "ready" && props.anyActiveRuns) return true;
    return props.busy;
  });

  const handleUpdateToolbarAction = () => {
    if (updateToolbarDisabled()) return;
    const state = updateState();
    if (state === "available") {
      props.downloadUpdate();
      return;
    }
    if (state === "ready") {
      props.installUpdateAndRestart();
      return;
    }
    props.checkForUpdates();
  };

  const notionStatusLabel = () => {
    switch (props.notionStatus) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Reload required";
      case "error":
        return "Connection failed";
      default:
        return "Not connected";
    }
  };

  const notionStatusStyle = () => {
    if (props.notionStatus === "connected") {
      return "bg-green-7/10 text-green-11 border-green-7/20";
    }
    if (props.notionStatus === "error") {
      return "bg-red-7/10 text-red-11 border-red-7/20";
    }
    if (props.notionStatus === "connecting") {
      return "bg-amber-7/10 text-amber-11 border-amber-7/20";
    }
    return "bg-gray-4/60 text-gray-11 border-gray-7/50";
  };

  const [providerConnectError, setProviderConnectError] = createSignal<string | null>(null);
  const providerConnectedCount = createMemo(() => (props.providerConnectedIds ?? []).length);
  const providerAvailableCount = createMemo(() => (props.providers ?? []).length);
  const providerStatusLabel = createMemo(() => {
    if (!providerAvailableCount()) return translate("settings.providers_status_unavailable");
    if (!providerConnectedCount()) return translate("settings.providers_status_disconnected");
    return translate("settings.providers_status_connected").replace(
      "{count}",
      String(providerConnectedCount()),
    );
  });
  const providerStatusStyle = createMemo(() => {
    if (!providerAvailableCount()) return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    if (!providerConnectedCount()) return "bg-amber-7/10 text-amber-11 border-amber-7/20";
    return "bg-green-7/10 text-green-11 border-green-7/20";
  });
  const providerSummary = createMemo(() => {
    if (!providerAvailableCount()) return translate("settings.providers_status_hint");
    const connected = providerConnectedCount();
    const available = providerAvailableCount();
    if (!connected) {
      return translate("settings.providers_available_only").replace("{count}", String(available));
    }
    return translate("settings.providers_connected_summary")
      .replace("{connected}", String(connected))
      .replace("{available}", String(available));
  });

  const handleOpenProviderAuth = async () => {
    if (props.busy || props.providerAuthBusy) return;
    setProviderConnectError(null);
    try {
      await props.openProviderAuthModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : translate("settings.providers_open_failed");
      setProviderConnectError(message);
    }
  };

  const [openworkUrl, setOpenworkUrl] = createSignal("");
  const [openworkToken, setOpenworkToken] = createSignal("");
  const [openworkTokenVisible, setOpenworkTokenVisible] = createSignal(false);
  const [openworkTestState, setOpenworkTestState] = createSignal<"idle" | "testing" | "success" | "error">("idle");
  const [openworkTestMessage, setOpenworkTestMessage] = createSignal<string | null>(null);
  const [clientTokenVisible, setClientTokenVisible] = createSignal(false);
  const [hostTokenVisible, setHostTokenVisible] = createSignal(false);
  const [copyingField, setCopyingField] = createSignal<string | null>(null);
  let copyTimeout: number | undefined;

  createEffect(() => {
    setOpenworkUrl(props.openworkServerSettings.urlOverride ?? "");
    setOpenworkToken(props.openworkServerSettings.token ?? "");
  });

  createEffect(() => {
    openworkUrl();
    openworkToken();
    setOpenworkTestState("idle");
    setOpenworkTestMessage(null);
  });

  const openworkStatusLabel = createMemo(() => {
    switch (props.openworkServerStatus) {
      case "connected":
        return translate("settings.remote_status_connected");
      case "limited":
        return translate("settings.remote_status_limited");
      default:
        return translate("settings.remote_status_disconnected");
    }
  });

  const openworkStatusStyle = createMemo(() => {
    switch (props.openworkServerStatus) {
      case "connected":
        return "bg-green-7/10 text-green-11 border-green-7/20";
      case "limited":
        return "bg-amber-7/10 text-amber-11 border-amber-7/20";
      default:
        return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    }
  });

  const reloadAvailabilityReason = createMemo(() => {
    if (!props.clientConnected) return translate("settings.remote_reload_requires_connection");
    if (!props.canReloadWorkspace) {
      return translate("settings.remote_reload_requires_local");
    }
    return null;
  });

  const reloadButtonLabel = createMemo(() =>
    props.reloadBusy ? translate("settings.remote_reloading") : translate("settings.remote_reload_engine"),
  );
  const reloadButtonTone = createMemo(() => (props.anyActiveRuns ? "danger" : "secondary"));
  const reloadButtonDisabled = createMemo(() => props.reloadBusy || Boolean(reloadAvailabilityReason()));

  const engineStatusLabel = createMemo(() => {
    if (!isTauriRuntime()) return "Unavailable";
    return props.engineInfo?.running ? "Running" : "Offline";
  });

  const engineStatusStyle = createMemo(() => {
    if (!isTauriRuntime()) return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    return props.engineInfo?.running
      ? "bg-green-7/10 text-green-11 border-green-7/20"
      : "bg-gray-4/60 text-gray-11 border-gray-7/50";
  });

  const opencodeConnectStatusLabel = createMemo(() => {
    const status = props.opencodeConnectStatus?.status;
    if (!status) return "Idle";
    if (status === "connected") return "Connected";
    if (status === "connecting") return "Connecting";
    return "Failed";
  });

  const opencodeConnectStatusStyle = createMemo(() => {
    const status = props.opencodeConnectStatus?.status;
    if (!status) return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    if (status === "connected") return "bg-green-7/10 text-green-11 border-green-7/20";
    if (status === "connecting") return "bg-amber-7/10 text-amber-11 border-amber-7/20";
    return "bg-red-7/10 text-red-11 border-red-7/20";
  });

  const opencodeConnectTimestamp = createMemo(() => {
    const at = props.opencodeConnectStatus?.at;
    if (!at) return null;
    return formatRelativeTime(at);
  });

  const owpenbotStatusLabel = createMemo(() => {
    if (!isTauriRuntime()) return "Unavailable";
    return props.owpenbotInfo?.running ? "Running" : "Offline";
  });

  const owpenbotStatusStyle = createMemo(() => {
    if (!isTauriRuntime()) return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    return props.owpenbotInfo?.running
      ? "bg-green-7/10 text-green-11 border-green-7/20"
      : "bg-gray-4/60 text-gray-11 border-gray-7/50";
  });

  const [owpenbotRestarting, setOwpenbotRestarting] = createSignal(false);
  const [owpenbotRestartError, setOwpenbotRestartError] = createSignal<string | null>(null);

  const handleOwpenbotRestart = async () => {
    if (owpenbotRestarting()) return;
    const workspacePath = props.owpenbotInfo?.workspacePath?.trim() || props.engineInfo?.projectDir?.trim();
    const opencodeUrl = props.owpenbotInfo?.opencodeUrl?.trim() || props.engineInfo?.baseUrl?.trim();
    const opencodeUsername = props.engineInfo?.opencodeUsername?.trim() || undefined;
    const opencodePassword = props.engineInfo?.opencodePassword?.trim() || undefined;
    if (!workspacePath) {
      setOwpenbotRestartError("No workspace path available");
      return;
    }
    setOwpenbotRestarting(true);
    setOwpenbotRestartError(null);
    try {
      await owpenbotRestart({
        workspacePath,
        opencodeUrl: opencodeUrl || undefined,
        opencodeUsername,
        opencodePassword,
      });
    } catch (e) {
      setOwpenbotRestartError(e instanceof Error ? e.message : String(e));
    } finally {
      setOwpenbotRestarting(false);
    }
  };

  const handleOwpenbotStop = async () => {
    if (owpenbotRestarting()) return;
    setOwpenbotRestarting(true);
    setOwpenbotRestartError(null);
    try {
      await owpenbotStop();
    } catch (e) {
      setOwpenbotRestartError(e instanceof Error ? e.message : String(e));
    } finally {
      setOwpenbotRestarting(false);
    }
  };

  const openwrkStatusLabel = createMemo(() => {
    if (!props.openwrkStatus) return translate("settings.status.unavailable");
    return props.openwrkStatus.running
      ? translate("settings.status.running")
      : translate("settings.status.offline");
  });

  const openwrkStatusStyle = createMemo(() => {
    if (!props.openwrkStatus) return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    return props.openwrkStatus.running
      ? "bg-green-7/10 text-green-11 border-green-7/20"
      : "bg-gray-4/60 text-gray-11 border-gray-7/50";
  });

  const openworkAuditStatusLabel = createMemo(() => {
    if (!props.openworkServerWorkspaceId) return translate("settings.status.unavailable");
    if (props.openworkAuditStatus === "loading") return translate("settings.status.loading");
    if (props.openworkAuditStatus === "error") return translate("settings.status.error");
    return translate("settings.status.ready");
  });

  const openworkAuditStatusStyle = createMemo(() => {
    if (!props.openworkServerWorkspaceId) return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    if (props.openworkAuditStatus === "loading") return "bg-amber-7/10 text-amber-11 border-amber-7/20";
    if (props.openworkAuditStatus === "error") return "bg-red-7/10 text-red-11 border-red-7/20";
    return "bg-green-7/10 text-green-11 border-green-7/20";
  });

  const isLocalEngineRunning = createMemo(() => Boolean(props.engineInfo?.running));
  const isLocalPreference = createMemo(() => props.startupPreference === "local");
  const startupLabel = createMemo(() => {
    if (props.startupPreference === "local") return translate("settings.startup_local");
    if (props.startupPreference === "server") return translate("settings.startup_server");
    return translate("settings.startup_unset");
  });

  const tabLabel = (tab: SettingsTab) => {
    switch (tab) {
      case "model":
        return translate("settings.tab_model");
      case "keybinds":
        return translate("settings.tab_keybinds");
      case "advanced":
        return translate("settings.tab_advanced");
      case "remote":
        return translate("settings.tab_remote");
      case "messaging":
        return translate("settings.tab_messaging");
      case "debug":
        return translate("settings.tab_debug");
      default:
        return translate("settings.tab_general");
    }
  };

  const availableTabs = createMemo<SettingsTab[]>(() => {
    const tabs: SettingsTab[] = ["general", "model", "keybinds", "messaging", "remote", "advanced"];
    if (props.developerMode) tabs.push("debug");
    return tabs;
  });

  const activeTab = createMemo<SettingsTab>(() => {
    const tabs = availableTabs();
    return tabs.includes(props.settingsTab) ? props.settingsTab : "general";
  });

  createEffect(() => {
    if (props.settingsTab !== activeTab()) {
      props.setSettingsTab(activeTab());
    }
  });

  const formatActor = (entry: OpenworkAuditEntry) => {
    const actor = entry.actor;
    if (!actor) return translate("settings.actor.unknown");
    if (actor.type === "host") return translate("settings.actor.host");
    if (actor.type === "remote") {
      return actor.clientId
        ? translate("settings.actor.remote_with_id").replace("{id}", actor.clientId)
        : translate("settings.actor.remote");
    }
    return translate("settings.actor.unknown");
  };

  const formatCapability = (cap?: { read?: boolean; write?: boolean; source?: string }) => {
    if (!cap) return translate("settings.capability.unavailable");
    const parts = [cap.read ? translate("settings.capability.read") : null, cap.write ? translate("settings.capability.write") : null]
      .filter(Boolean)
      .join(" / ");
    const label = parts || translate("settings.capability.none");
    return cap.source ? `${label} · ${cap.source}` : label;
  };

  const engineStdout = () => {
    if (!isTauriRuntime()) return translate("settings.logs.desktop_only");
    return props.engineInfo?.lastStdout?.trim() || translate("settings.logs.no_stdout");
  };

  const engineStderr = () => {
    if (!isTauriRuntime()) return translate("settings.logs.desktop_only");
    return props.engineInfo?.lastStderr?.trim() || translate("settings.logs.no_stderr");
  };

  const openworkStdout = () => {
    if (!props.openworkServerHostInfo) return translate("settings.logs.host_only");
    return props.openworkServerHostInfo.lastStdout?.trim() || translate("settings.logs.no_stdout");
  };

  const openworkStderr = () => {
    if (!props.openworkServerHostInfo) return translate("settings.logs.host_only");
    return props.openworkServerHostInfo.lastStderr?.trim() || translate("settings.logs.no_stderr");
  };

  const owpenbotStdout = () => {
    if (!isTauriRuntime()) return translate("settings.logs.desktop_only");
    return props.owpenbotInfo?.lastStdout?.trim() || translate("settings.logs.no_stdout");
  };

  const owpenbotStderr = () => {
    if (!isTauriRuntime()) return translate("settings.logs.desktop_only");
    return props.owpenbotInfo?.lastStderr?.trim() || translate("settings.logs.no_stderr");
  };

  const formatOpenwrkBinary = (binary?: OpenwrkBinaryInfo | null) => {
    if (!binary) return translate("settings.debug.binary_unavailable");
    const version = binary.actualVersion || binary.expectedVersion || translate("settings.debug.unknown");
    return `${binary.source} · ${version}`;
  };

  const formatOpenwrkBinaryVersion = (binary?: OpenwrkBinaryInfo | null) => {
    if (!binary) return "—";
    return binary.actualVersion || binary.expectedVersion || "—";
  };

  const openwrkBinaryPath = () => props.openwrkStatus?.binaries?.opencode?.path ?? "—";
  const openwrkSidecarSummary = () => {
    const info = props.openwrkStatus?.sidecar;
    if (!info) return translate("settings.debug.sidecar_unavailable");
    const source = info.source ?? translate("settings.debug.auto");
    const target = info.target ?? translate("settings.debug.unknown");
    return `${source} · ${target}`;
  };

  const appVersionLabel = () => (props.appVersion ? `v${props.appVersion}` : "—");
  const opencodeVersionLabel = () => {
    const fromOpenwrk = formatOpenwrkBinaryVersion(props.openwrkStatus?.binaries?.opencode ?? null);
    if (fromOpenwrk !== "—") return fromOpenwrk;
    return props.engineDoctorVersion ?? "—";
  };
  const openworkServerVersionLabel = () => props.openworkServerDiagnostics?.version ?? "—";
  const owpenbotVersionLabel = () => props.owpenbotInfo?.version ?? "—";
  const openwrkVersionLabel = () => props.openwrkStatus?.cliVersion ?? "—";

  const formatUptime = (uptimeMs?: number | null) => {
    if (!uptimeMs) return "—";
    return formatRelativeTime(Date.now() - uptimeMs);
  };

  const buildOpenworkSettings = () => ({
    ...props.openworkServerSettings,
    urlOverride: openworkUrl().trim() || undefined,
    token: openworkToken().trim() || undefined,
  });

  const hasOpenworkChanges = createMemo(() => {
    const currentUrl = props.openworkServerSettings.urlOverride ?? "";
    const currentToken = props.openworkServerSettings.token ?? "";
    return openworkUrl().trim() !== currentUrl || openworkToken().trim() !== currentToken;
  });

  const hostInfo = createMemo(() => props.openworkServerHostInfo);
  const hostStatusLabel = createMemo(() => {
    if (!hostInfo()?.running) return translate("settings.remote_status_offline");
    return translate("settings.remote_status_available");
  });
  const hostStatusStyle = createMemo(() => {
    if (!hostInfo()?.running) return "bg-gray-4/60 text-gray-11 border-gray-7/50";
    return "bg-green-7/10 text-green-11 border-green-7/20";
  });
  const hostConnectUrl = createMemo(() => {
    const info = hostInfo();
    return info?.connectUrl ?? info?.mdnsUrl ?? info?.lanUrl ?? info?.baseUrl ?? "";
  });
  const hostConnectUrlUsesMdns = createMemo(() => hostConnectUrl().includes(".local"));

  const handleCopy = async (value: string, field: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyingField(field);
      if (copyTimeout !== undefined) {
        window.clearTimeout(copyTimeout);
      }
      copyTimeout = window.setTimeout(() => {
        setCopyingField(null);
        copyTimeout = undefined;
      }, 2000);
    } catch {
      // ignore
    }
  };

  onCleanup(() => {
    if (copyTimeout !== undefined) {
      window.clearTimeout(copyTimeout);
    }
  });


  return (
    <section class="space-y-6">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-2xl border border-gray-6/40 bg-gray-1/40 px-3 py-2">
        <div class="flex flex-wrap gap-2">
          <For each={availableTabs()}>
            {(tab) => (
              <button
                class={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                  activeTab() === tab
                    ? "bg-gray-12/10 text-gray-12 border-gray-6/30"
                    : "text-gray-10 border-gray-6/50 hover:text-gray-12 hover:bg-gray-2/40"
                }`}
                onClick={() => props.setSettingsTab(tab)}
              >
                {tabLabel(tab)}
              </button>
            )}
          </For>
        </div>
        <Show when={showUpdateToolbar()}>
          <div class="flex flex-wrap items-center gap-2">
            <div
              class={`text-xs px-2 py-1 rounded-full border flex items-center gap-2 ${updateToolbarTone()}`}
              title={updateToolbarLabel()}
            >
              <Show when={updateToolbarSpinning()}>
                <RefreshCcw size={12} class="animate-spin" />
              </Show>
              <span>{updateToolbarLabel()}</span>
            </div>
            <Show when={updateToolbarActionLabel()}>
              <Button
                variant="outline"
                class="text-xs h-8 py-0 px-3"
                onClick={handleUpdateToolbarAction}
                disabled={updateToolbarDisabled()}
                title={
                  updateState() === "ready" && props.anyActiveRuns
                    ? translate("settings.stop_active_runs_hint")
                    : ""
                }
              >
                {updateToolbarActionLabel()}
              </Button>
            </Show>
          </div>
        </Show>
      </div>

      <Switch>
        <Match when={activeTab() === "general"}>
          <div class="space-y-6">
            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-3">
              <div class="text-sm font-medium text-gray-12">{translate("settings.connection_title")}</div>
              <div class="text-xs text-gray-10">{props.headerStatus}</div>
              <div class="text-xs text-gray-7 font-mono">{props.baseUrl}</div>
              <div class="pt-2 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={props.toggleDeveloperMode}>
                  <Shield size={16} />
                  {props.developerMode
                    ? translate("settings.disable_developer_mode")
                    : translate("settings.enable_developer_mode")}
                </Button>
                <Show when={isLocalEngineRunning()}>
                  <Button variant="danger" onClick={props.stopHost} disabled={props.busy}>
                    {translate("settings.stop_local_server")}
                  </Button>
                </Show>
                <Show when={!isLocalEngineRunning() && props.openworkServerStatus === "connected"}>
                  <Button variant="outline" onClick={props.stopHost} disabled={props.busy}>
                    {translate("settings.disconnect_server")}
                  </Button>
                </Show>
              </div>
            </div>

            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="flex items-center gap-2">
                    <PlugZap size={16} class="text-gray-11" />
                    <div class="text-sm font-medium text-gray-12">{translate("settings.providers_title")}</div>
                  </div>
                  <div class="text-xs text-gray-10 mt-1">{translate("settings.providers_hint")}</div>
                </div>
                <div class={`text-xs px-2 py-1 rounded-full border ${providerStatusStyle()}`}>
                  {providerStatusLabel()}
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={handleOpenProviderAuth}
                  disabled={props.busy || props.providerAuthBusy}
                >
                  {props.providerAuthBusy
                    ? translate("settings.providers_loading")
                    : translate("settings.providers_connect")}
                </Button>
                <div class="text-xs text-gray-9">{providerSummary()}</div>
              </div>

              <Show when={providerConnectError()}>
                <div class="rounded-xl border border-red-7/30 bg-red-1/40 px-3 py-2 text-xs text-red-11">
                  {providerConnectError()}
                </div>
              </Show>

              <div class="text-[11px] text-gray-8">
                {translate("settings.providers_footer")}
              </div>
            </div>

            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
              <div>
                <div class="text-sm font-medium text-gray-12">{translate("settings.appearance_title")}</div>
                <div class="text-xs text-gray-10">{translate("settings.appearance_hint")}</div>
              </div>

              <div class="flex flex-wrap gap-2">
                <Button
                  variant={props.themeMode === "system" ? "secondary" : "outline"}
                  class="text-xs h-8 py-0 px-3"
                  onClick={() => props.setThemeMode("system")}
                  disabled={props.busy}
                >
                  {translate("settings.theme_system")}
                </Button>
                <Button
                  variant={props.themeMode === "light" ? "secondary" : "outline"}
                  class="text-xs h-8 py-0 px-3"
                  onClick={() => props.setThemeMode("light")}
                  disabled={props.busy}
                >
                  {translate("settings.theme_light")}
                </Button>
                <Button
                  variant={props.themeMode === "dark" ? "secondary" : "outline"}
                  class="text-xs h-8 py-0 px-3"
                  onClick={() => props.setThemeMode("dark")}
                  disabled={props.busy}
                >
                  {translate("settings.theme_dark")}
                </Button>
              </div>

              <div class="text-xs text-gray-7">
                {translate("settings.theme_system_hint")}
              </div>
            </div>

            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
              <div>
                <div class="text-sm font-medium text-gray-12">{translate("settings.language")}</div>
                <div class="text-xs text-gray-10">{translate("settings.language.description")}</div>
              </div>

              <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                <div class="min-w-0">
                  <div class="text-sm text-gray-12">{currentLanguageLabel()}</div>
                  <Show when={currentLanguageOption()?.label}>
                    <div class="text-xs text-gray-7">{currentLanguageOption()?.label}</div>
                  </Show>
                </div>
                <Button
                  variant="outline"
                  class="text-xs h-8 py-0 px-3 shrink-0"
                  onClick={() => setLanguageModalOpen(true)}
                  disabled={props.busy}
                >
                  {translate("common.change")}
                </Button>
              </div>
            </div>
          </div>
        </Match>

        <Match when={activeTab() === "model"}>
          <div class="space-y-6">
            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
              <div>
                <div class="text-sm font-medium text-gray-12">{translate("settings.model_title")}</div>
                <div class="text-xs text-gray-10">{translate("settings.model_hint")}</div>
              </div>

              <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                <div class="min-w-0">
                  <div class="text-sm text-gray-12 truncate">{props.defaultModelLabel}</div>
                  <div class="text-xs text-gray-7 font-mono truncate">{props.defaultModelRef}</div>
                </div>
                <Button
                  variant="outline"
                  class="text-xs h-8 py-0 px-3 shrink-0"
                  onClick={props.openDefaultModelPicker}
                  disabled={props.busy}
                >
                  {translate("common.change")}
                </Button>
              </div>

              <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                <div class="min-w-0">
                  <div class="text-sm text-gray-12">{translate("settings.thinking_label")}</div>
                  <div class="text-xs text-gray-7">{translate("settings.thinking_hint")}</div>
                </div>
                <Button
                  variant="outline"
                  class="text-xs h-8 py-0 px-3 shrink-0"
                  onClick={props.toggleShowThinking}
                  disabled={props.busy}
                >
                  {props.showThinking ? translate("common.on") : translate("common.off")}
                </Button>
              </div>

              <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                <div class="min-w-0">
                  <div class="text-sm text-gray-12">{translate("settings.model_variant_label")}</div>
                  <div class="text-xs text-gray-7 font-mono truncate">{props.modelVariantLabel}</div>
                </div>
                <Button
                  variant="outline"
                  class="text-xs h-8 py-0 px-3 shrink-0"
                  onClick={props.editModelVariant}
                  disabled={props.busy}
                >
                  {translate("common.edit")}
                </Button>
              </div>
            </div>
          </div>
        </Match>

        <Match when={activeTab() === "keybinds"}>
          <div class="space-y-6">
            <SettingsKeybinds
              items={props.keybindItems}
              onOverride={props.onOverrideKeybind}
              onReset={props.onResetKeybind}
              onResetAll={props.onResetAllKeybinds}
            />
          </div>
        </Match>

        <Match when={activeTab() === "advanced"}>
          <div class="space-y-6">
            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-3">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="text-sm font-medium text-gray-12">{translate("settings.updates_title")}</div>
                  <div class="text-xs text-gray-10">{translate("settings.updates_hint")}</div>
                </div>
                <div class="text-xs text-gray-7 font-mono">{props.appVersion ? `v${props.appVersion}` : ""}</div>
              </div>

              <Show
                when={!isTauriRuntime()}
                fallback={
                  <Show
                    when={props.updateEnv && props.updateEnv.supported === false}
                    fallback={
                      <>
                        <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6">
                          <div class="space-y-0.5">
                            <div class="text-sm text-gray-12">{translate("settings.automatic_checks_label")}</div>
                            <div class="text-xs text-gray-7">{translate("settings.automatic_checks_hint")}</div>
                          </div>
                          <button
                            class={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                              props.updateAutoCheck
                                ? "bg-gray-12/10 text-gray-12 border-gray-6/20"
                                : "text-gray-10 border-gray-6 hover:text-gray-12"
                            }`}
                            onClick={props.toggleUpdateAutoCheck}
                          >
                            {props.updateAutoCheck ? translate("common.on") : translate("common.off")}
                          </button>
                        </div>

                        <div class="flex items-center justify-between gap-3 bg-gray-1 p-3 rounded-xl border border-gray-6">
                          <div class="space-y-0.5">
                            <div class="text-sm text-gray-12">
                              <Switch>
                                <Match when={updateState() === "checking"}>
                                  {translate("settings.update_checking")}
                                </Match>
                                <Match when={updateState() === "available"}>
                                  {translate("settings.update_available").replace(
                                    "{version}",
                                    updateVersion() ? `v${updateVersion()}` : "",
                                  )}
                                </Match>
                                <Match when={updateState() === "downloading"}>
                                  {translate("settings.update_downloading")}
                                </Match>
                                <Match when={updateState() === "ready"}>
                                  {translate("settings.update_ready").replace(
                                    "{version}",
                                    updateVersion() ? `v${updateVersion()}` : "",
                                  )}
                                </Match>
                                <Match when={updateState() === "error"}>
                                  {translate("settings.update_failed")}
                                </Match>
                                <Match when={true}>{translate("settings.update_uptodate")}</Match>
                              </Switch>
                            </div>
                            <Show when={updateState() === "idle" && updateLastCheckedAt()}>
                              <div class="text-xs text-gray-7">
                                {translate("settings.last_checked_time").replace(
                                  "{time}",
                                  formatRelativeTime(updateLastCheckedAt() as number),
                                )}
                              </div>
                            </Show>
                            <Show when={updateState() === "available" && updateDate()}>
                              <div class="text-xs text-gray-7">
                                {translate("settings.published_date").replace("{date}", updateDate() ?? "")}
                              </div>
                            </Show>
                            <Show when={updateState() === "downloading"}>
                              <div class="text-xs text-gray-7">
                                {formatBytes((updateDownloadedBytes() as number) ?? 0)}
                                <Show when={updateTotalBytes() != null}>
                                  {` / ${formatBytes(updateTotalBytes() as number)}`}
                                </Show>
                              </div>
                            </Show>
                            <Show when={updateState() === "error"}>
                              <div class="text-xs text-red-11">{updateErrorMessage()}</div>
                            </Show>
                          </div>

                          <div class="flex items-center gap-2">
                            <Button
                              variant="outline"
                              class="text-xs h-8 py-0 px-3"
                              onClick={props.checkForUpdates}
                              disabled={props.busy || updateState() === "checking" || updateState() === "downloading"}
                            >
                              {translate("settings.check_update")}
                            </Button>

                            <Show when={updateState() === "available"}>
                              <Button
                                variant="secondary"
                                class="text-xs h-8 py-0 px-3"
                                onClick={props.downloadUpdate}
                                disabled={props.busy || updateState() === "downloading"}
                              >
                                {translate("settings.download_update")}
                              </Button>
                            </Show>

                            <Show when={updateState() === "ready"}>
                              <Button
                                variant="secondary"
                                class="text-xs h-8 py-0 px-3"
                                onClick={props.installUpdateAndRestart}
                                disabled={props.busy || props.anyActiveRuns}
                                title={props.anyActiveRuns ? translate("settings.stop_active_runs_hint") : ""}
                              >
                                {translate("settings.install_restart")}
                              </Button>
                            </Show>
                          </div>
                        </div>

                        <Show when={updateState() === "available" && updateNotes()}>
                          <div class="rounded-xl bg-gray-1/20 border border-gray-6 p-3 text-xs text-gray-11 whitespace-pre-wrap max-h-40 overflow-auto">
                            {updateNotes()}
                          </div>
                        </Show>
                      </>
                    }
                  >
                    <div class="rounded-xl bg-gray-1/20 border border-gray-6 p-3 text-sm text-gray-11">
                      {props.updateEnv?.reason ?? translate("settings.updates_not_supported")}
                    </div>
                  </Show>
                }
              >
                <div class="rounded-xl bg-gray-1/20 border border-gray-6 p-3 text-sm text-gray-11">
                  {translate("settings.updates_desktop_only")}
                </div>
              </Show>
            </div>

            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-3">
              <div class="text-sm font-medium text-gray-12">{translate("settings.startup_title")}</div>

              <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6">
                <div class="flex items-center gap-3">
                  <div
                    class={`p-2 rounded-lg ${
                      isLocalPreference() ? "bg-indigo-7/10 text-indigo-11" : "bg-green-7/10 text-green-11"
                    }`}
                  >
                    <Show when={isLocalPreference()} fallback={<Smartphone size={18} />}>
                      <HardDrive size={18} />
                    </Show>
                  </div>
                  <span class="text-sm font-medium text-gray-12">{startupLabel()}</span>
                </div>
                <Button variant="outline" class="text-xs h-8 py-0 px-3" onClick={props.stopHost} disabled={props.busy}>
                  {translate("settings.switch_mode")}
                </Button>
              </div>

              <Button variant="secondary" class="w-full justify-between group" onClick={props.onResetStartupPreference}>
                <span class="text-gray-11">{translate("settings.reset_startup_preference")}</span>
                <RefreshCcw size={14} class="text-gray-10 group-hover:rotate-180 transition-transform" />
              </Button>

              <p class="text-xs text-gray-7">
                {translate("settings.reset_startup_hint")}
              </p>
            </div>

            <Show when={isTauriRuntime() && isLocalPreference()}>
              <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
                <div>
                  <div class="text-sm font-medium text-gray-12">{translate("settings.engine_title")}</div>
                  <div class="text-xs text-gray-10">{translate("settings.engine_hint")}</div>
                </div>

                <div class="space-y-3">
                  <div class="text-xs text-gray-10">{translate("settings.engine_source")}</div>
                  <div class="grid grid-cols-2 gap-2">
                    <Button
                      variant={props.engineSource === "sidecar" ? "secondary" : "outline"}
                      onClick={() => props.setEngineSource("sidecar")}
                      disabled={props.busy}
                    >
                      {translate("settings.engine_source_bundled")}
                    </Button>
                    <Button
                      variant={props.engineSource === "path" ? "secondary" : "outline"}
                      onClick={() => props.setEngineSource("path")}
                      disabled={props.busy}
                    >
                      {translate("settings.engine_source_system")}
                    </Button>
                  </div>
                  <div class="text-[11px] text-gray-7">
                    {translate("settings.engine_source_hint")}
                  </div>
                </div>

                <div class="space-y-3">
                  <div class="text-xs text-gray-10">{translate("settings.engine_runtime")}</div>
                  <div class="grid grid-cols-2 gap-2">
                    <Button
                      variant={props.engineRuntime === "direct" ? "secondary" : "outline"}
                      onClick={() => props.setEngineRuntime("direct")}
                      disabled={props.busy}
                    >
                      {translate("settings.engine_runtime_direct")}
                    </Button>
                    <Button
                      variant={props.engineRuntime === "openwrk" ? "secondary" : "outline"}
                      onClick={() => props.setEngineRuntime("openwrk")}
                      disabled={props.busy}
                    >
                      {translate("settings.engine_runtime_openwrk")}
                    </Button>
                  </div>
                  <div class="text-[11px] text-gray-7">{translate("settings.engine_runtime_hint")}</div>
                </div>
              </div>
            </Show>

            <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
              <div>
                <div class="text-sm font-medium text-gray-12">{translate("settings.reset_title")}</div>
                <div class="text-xs text-gray-10">{translate("settings.reset_hint")}</div>
              </div>

              <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                <div class="min-w-0">
                  <div class="text-sm text-gray-12">{translate("settings.reset_onboarding_label")}</div>
                  <div class="text-xs text-gray-7">{translate("settings.reset_onboarding_description")}</div>
                </div>
                <Button
                  variant="outline"
                  class="text-xs h-8 py-0 px-3 shrink-0"
                  onClick={() => props.openResetModal("onboarding")}
                  disabled={props.busy || props.resetModalBusy || props.anyActiveRuns}
                  title={props.anyActiveRuns ? translate("settings.stop_active_runs_reset_hint") : ""}
                >
                  {translate("settings.reset")}
                </Button>
              </div>

              <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                <div class="min-w-0">
                  <div class="text-sm text-gray-12">{translate("settings.reset_app_data_label")}</div>
                  <div class="text-xs text-gray-7">{translate("settings.reset_app_data_description")}</div>
                </div>
                <Button
                  variant="danger"
                  class="text-xs h-8 py-0 px-3 shrink-0"
                  onClick={() => props.openResetModal("all")}
                  disabled={props.busy || props.resetModalBusy || props.anyActiveRuns}
                  title={props.anyActiveRuns ? translate("settings.stop_active_runs_reset_hint") : ""}
                >
                  {translate("settings.reset")}
                </Button>
              </div>

              <div class="text-xs text-gray-7">
                {translate("settings.reset_warning")}
              </div>
            </div>
          </div>
        </Match>

        <Match when={activeTab() === "remote"}>
          <div class="space-y-6">
            <Show when={hostInfo()}>
              <div class="space-y-4">
                <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
                  <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div class="text-sm font-medium text-gray-12">{translate("settings.remote_sharing_title")}</div>
                      <div class="text-xs text-gray-10">
                        {translate("settings.remote_sharing_hint")}
                      </div>
                    </div>
                    <div class={`text-xs px-2 py-1 rounded-full border ${hostStatusStyle()}`}>
                      {hostStatusLabel()}
                    </div>
                  </div>

                  <div class="grid gap-3">
                    <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                      <div class="min-w-0">
                        <div class="text-xs font-medium text-gray-11">{translate("settings.remote_server_url_label")}</div>
                        <div class="text-xs text-gray-7 font-mono truncate">
                          {hostConnectUrl() || translate("settings.remote_server_url_starting")}
                        </div>
                        <Show when={hostConnectUrl()}>
                          <div class="text-[11px] text-gray-8 mt-1">
                            {hostConnectUrlUsesMdns()
                              ? translate("settings.remote_mdns_hint")
                              : translate("settings.remote_local_ip_hint")}
                          </div>
                        </Show>
                      </div>
                      <Button
                        variant="outline"
                        class="text-xs h-8 py-0 px-3 shrink-0"
                        onClick={() => handleCopy(hostConnectUrl(), "host-url")}
                        disabled={!hostConnectUrl()}
                      >
                        {copyingField() === "host-url"
                          ? translate("settings.remote_copied")
                          : translate("settings.remote_copy")}
                      </Button>
                    </div>

                    <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                      <div class="min-w-0">
                        <div class="text-xs font-medium text-gray-11">{translate("settings.remote_access_token_label")}</div>
                        <div class="text-xs text-gray-7 font-mono truncate">
                          {clientTokenVisible()
                            ? hostInfo()?.clientToken || "—"
                            : hostInfo()?.clientToken
                              ? "••••••••••••"
                              : "—"}
                        </div>
                        <div class="text-[11px] text-gray-8 mt-1">
                          {translate("settings.remote_access_token_hint")}
                        </div>
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          class="text-xs h-8 py-0 px-3"
                          onClick={() => setClientTokenVisible((prev) => !prev)}
                          disabled={!hostInfo()?.clientToken}
                        >
                          {clientTokenVisible() ? translate("common.hide") : translate("common.show")}
                        </Button>
                        <Button
                          variant="outline"
                          class="text-xs h-8 py-0 px-3"
                          onClick={() => handleCopy(hostInfo()?.clientToken ?? "", "client-token")}
                          disabled={!hostInfo()?.clientToken}
                        >
                          {copyingField() === "client-token"
                            ? translate("settings.remote_copied")
                            : translate("settings.remote_copy")}
                        </Button>
                      </div>
                    </div>

                    <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                      <div class="min-w-0">
                        <div class="text-xs font-medium text-gray-11">{translate("settings.remote_server_token_label")}</div>
                        <div class="text-xs text-gray-7 font-mono truncate">
                          {hostTokenVisible()
                            ? hostInfo()?.hostToken || "—"
                            : hostInfo()?.hostToken
                              ? "••••••••••••"
                              : "—"}
                        </div>
                        <div class="text-[11px] text-gray-8 mt-1">
                          {translate("settings.remote_server_token_hint")}
                        </div>
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          class="text-xs h-8 py-0 px-3"
                          onClick={() => setHostTokenVisible((prev) => !prev)}
                          disabled={!hostInfo()?.hostToken}
                        >
                          {hostTokenVisible() ? translate("common.hide") : translate("common.show")}
                        </Button>
                        <Button
                          variant="outline"
                          class="text-xs h-8 py-0 px-3"
                          onClick={() => handleCopy(hostInfo()?.hostToken ?? "", "host-token")}
                          disabled={!hostInfo()?.hostToken}
                        >
                          {copyingField() === "host-token"
                            ? translate("settings.remote_copied")
                            : translate("settings.remote_copy")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </Show>

            <div class="space-y-4">
              <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
                <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div class="text-sm font-medium text-gray-12">{translate("settings.remote_openwork_title")}</div>
                    <div class="text-xs text-gray-10">
                      {translate("settings.remote_openwork_hint")}
                    </div>
                  </div>
                  <div class={`text-xs px-2 py-1 rounded-full border ${openworkStatusStyle()}`}>
                    {openworkStatusLabel()}
                  </div>
                </div>

                <div class="grid gap-3">
                  <TextInput
                    label={translate("settings.remote_openwork_url_label")}
                    value={openworkUrl()}
                    onInput={(event) => setOpenworkUrl(event.currentTarget.value)}
                    placeholder={translate("settings.remote_openwork_url_placeholder")}
                    hint={translate("settings.remote_openwork_url_hint")}
                    disabled={props.busy}
                  />

                  <label class="block">
                    <div class="mb-1 text-xs font-medium text-gray-11">{translate("settings.remote_access_token_label")}</div>
                    <div class="flex items-center gap-2">
                      <input
                        type={openworkTokenVisible() ? "text" : "password"}
                        value={openworkToken()}
                        onInput={(event) => setOpenworkToken(event.currentTarget.value)}
                        placeholder={translate("settings.remote_openwork_token_placeholder")}
                        disabled={props.busy}
                        class="w-full rounded-xl bg-gray-2/60 px-3 py-2 text-sm text-gray-12 placeholder:text-gray-10 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] focus:outline-none focus:ring-2 focus:ring-gray-6/20"
                      />
                      <Button
                        variant="outline"
                        class="text-xs h-9 px-3 shrink-0"
                        onClick={() => setOpenworkTokenVisible((prev) => !prev)}
                        disabled={props.busy}
                      >
                        {openworkTokenVisible() ? translate("common.hide") : translate("common.show")}
                      </Button>
                    </div>
                    <div class="mt-1 text-xs text-gray-10">
                      {translate("settings.remote_openwork_token_hint")}
                    </div>
                  </label>
                </div>

                <div class="text-[11px] text-gray-7 font-mono truncate">
                  {translate("settings.remote_resolved_server")} {openworkUrl().trim() || translate("settings.remote_not_set")}
                </div>

                <div class="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      if (openworkTestState() === "testing") return;
                      const next = buildOpenworkSettings();
                      props.updateOpenworkServerSettings(next);
                      setOpenworkTestState("testing");
                      setOpenworkTestMessage(null);
                      try {
                        const ok = await props.testOpenworkServerConnection(next);
                        setOpenworkTestState(ok ? "success" : "error");
                        setOpenworkTestMessage(
                          ok
                            ? translate("settings.remote_test_success")
                            : translate("settings.remote_test_failed")
                        );
                      } catch (error) {
                        const message =
                          error instanceof Error ? error.message : translate("settings.remote_test_failed_generic");
                        setOpenworkTestState("error");
                        setOpenworkTestMessage(message);
                      }
                    }}
                    disabled={props.busy || openworkTestState() === "testing"}
                  >
                    {openworkTestState() === "testing"
                      ? translate("settings.remote_testing")
                      : translate("settings.remote_test_connection")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => props.updateOpenworkServerSettings(buildOpenworkSettings())}
                    disabled={props.busy || !hasOpenworkChanges()}
                  >
                    {translate("common.save")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={props.resetOpenworkServerSettings}
                    disabled={props.busy}
                  >
                    {translate("settings.reset")}
                  </Button>
                </div>

                <Show when={openworkTestState() !== "idle"}>
                  <div
                    class={`text-xs ${
                      openworkTestState() === "success"
                        ? "text-green-11"
                        : openworkTestState() === "error"
                          ? "text-red-11"
                          : "text-gray-9"
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    {openworkTestState() === "testing"
                      ? translate("settings.remote_testing_status")
                      : openworkTestMessage() ?? translate("settings.remote_status_updated")}
                  </div>
                </Show>

                <Show when={props.openworkServerStatus !== "connected"}>
                  <div class="text-xs text-gray-9">
                    {translate("settings.remote_sync_hint")}
                  </div>
                </Show>
              </div>

              <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
                <div>
                  <div class="text-sm font-medium text-gray-12">{translate("settings.remote_engine_reload_title")}</div>
                  <div class="text-xs text-gray-10">{translate("settings.remote_engine_reload_hint")}</div>
                </div>

                <div class="flex items-center justify-between bg-gray-1 p-3 rounded-xl border border-gray-6 gap-3">
                  <div class="min-w-0 space-y-1">
                    <div class="text-sm text-gray-12">{translate("settings.remote_reload_now")}</div>
                    <div class="text-xs text-gray-7">{translate("settings.remote_reload_hint")}</div>
                    <Show when={props.anyActiveRuns}>
                      <div class="text-[11px] text-amber-11">
                        {translate("settings.remote_reload_warning")}
                      </div>
                    </Show>
                    <Show when={props.reloadError}>
                      <div class="text-[11px] text-red-11">{props.reloadError}</div>
                    </Show>
                    <Show when={reloadAvailabilityReason()}>
                      <div class="text-[11px] text-gray-9">{reloadAvailabilityReason()}</div>
                    </Show>
                  </div>
                  <Button
                    variant={reloadButtonTone()}
                    class="text-xs h-8 py-0 px-3 shrink-0"
                    onClick={props.reloadWorkspaceEngine}
                    disabled={reloadButtonDisabled()}
                  >
                    <RefreshCcw size={14} class={props.reloadBusy ? "animate-spin" : ""} />
                    {reloadButtonLabel()}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Match>

        <Match when={activeTab() === "messaging"}>
          <div class="space-y-6">
            <OwpenbotSettings
              busy={props.busy}
              openworkServerStatus={props.openworkServerStatus}
              openworkServerUrl={props.openworkServerUrl}
              openworkServerSettings={props.openworkServerSettings}
              openworkServerWorkspaceId={props.openworkServerWorkspaceId}
              openworkServerHostInfo={props.openworkServerHostInfo}
              developerMode={props.developerMode}
            />
          </div>
        </Match>

        <Match when={activeTab() === "debug"}>
          <Show when={props.developerMode}>
            <section>
              <h3 class="text-sm font-medium text-gray-11 uppercase tracking-wider mb-4">
                {translate("settings.debug.title")}
              </h3>

              <div class="space-y-4">
                <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div class="min-w-0">
                    <div class="text-sm text-gray-12">{translate("settings.opencode_cache")}</div>
                    <div class="text-xs text-gray-7">{translate("settings.opencode_cache_description")}</div>
                    <Show when={props.cacheRepairResult}>
                      <div class="text-xs text-gray-11 mt-2">{props.cacheRepairResult}</div>
                    </Show>
                  </div>
                  <Button
                    variant="secondary"
                    class="text-xs h-8 py-0 px-3 shrink-0"
                    onClick={props.repairOpencodeCache}
                    disabled={props.cacheRepairBusy || !isTauriRuntime()}
                    title={isTauriRuntime() ? "" : translate("settings.cache_repair_requires_desktop")}
                  >
                    {props.cacheRepairBusy
                      ? translate("settings.repairing_cache")
                      : translate("settings.repair_cache")}
                  </Button>
                </div>

                <div class="bg-gray-2/30 border border-gray-6/50 rounded-2xl p-5 space-y-4">
                  <div>
                    <div class="text-sm font-medium text-gray-12">{translate("settings.debug.devtools_title")}</div>
                    <div class="text-xs text-gray-10">{translate("settings.debug.devtools_subtitle")}</div>
                  </div>

                  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                      <div>
                        <div class="text-sm font-medium text-gray-12">{translate("settings.debug.versions_title")}</div>
                        <div class="text-xs text-gray-10">{translate("settings.debug.versions_subtitle")}</div>
                      </div>
                      <div class="space-y-1">
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {translate("settings.debug.version_desktop")} {appVersionLabel()}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {translate("settings.debug.version_openwrk")} {openwrkVersionLabel()}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {translate("settings.debug.version_opencode")} {opencodeVersionLabel()}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {translate("settings.debug.version_openwork")} {openworkServerVersionLabel()}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {translate("settings.debug.version_owpenbot")} {owpenbotVersionLabel()}
                        </div>
                      </div>
                    </div>

                    <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <div class="text-sm font-medium text-gray-12">{translate("settings.debug.engine_title")}</div>
                          <div class="text-xs text-gray-10">{translate("settings.debug.engine_subtitle")}</div>
                        </div>
                        <div class={`text-xs px-2 py-1 rounded-full border ${engineStatusStyle()}`}>
                          {engineStatusLabel()}
                        </div>
                      </div>
                      <div class="space-y-1">
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {props.engineInfo?.baseUrl ?? translate("settings.debug.base_url_unavailable")}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {props.engineInfo?.projectDir ?? translate("settings.debug.no_project_directory")}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {translate("settings.debug.pid")} {props.engineInfo?.pid ?? "—"}
                        </div>
                      </div>
                      <div class="grid gap-2">
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">{translate("settings.debug.last_stdout")}</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {engineStdout()}
                          </pre>
                        </div>
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">{translate("settings.debug.last_stderr")}</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {engineStderr()}
                          </pre>
                        </div>
                      </div>
                    </div>

                    <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <div class="text-sm font-medium text-gray-12">{translate("settings.debug.openwrk_title")}</div>
                          <div class="text-xs text-gray-10">{translate("settings.debug.openwrk_subtitle")}</div>
                        </div>
                        <div class={`text-xs px-2 py-1 rounded-full border ${openwrkStatusStyle()}`}>
                          {openwrkStatusLabel()}
                        </div>
                      </div>
                      <div class="space-y-1">
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {props.openwrkStatus?.dataDir ?? translate("settings.debug.data_dir_unavailable")}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {translate("settings.debug.daemon_label")} {props.openwrkStatus?.daemon?.baseUrl ?? "—"}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {translate("settings.debug.opencode_label")} {props.openwrkStatus?.opencode?.baseUrl ?? "—"}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {translate("settings.debug.openwrk_version")}
                          {props.openwrkStatus?.cliVersion ?? "—"}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {translate("settings.debug.sidecar_label")} {openwrkSidecarSummary()}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate" title={openwrkBinaryPath()}>
                          {translate("settings.debug.opencode_binary")} {formatOpenwrkBinary(props.openwrkStatus?.binaries?.opencode ?? null)}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {translate("settings.debug.active_workspace")} {props.openwrkStatus?.activeId ?? "—"}
                        </div>
                      </div>
                      <Show when={props.openwrkStatus?.lastError}>
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">{translate("settings.debug.last_error")}</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {props.openwrkStatus?.lastError}
                          </pre>
                        </div>
                      </Show>
                    </div>

                    <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <div class="text-sm font-medium text-gray-12">{translate("settings.debug.sdk_title")}</div>
                          <div class="text-xs text-gray-10">{translate("settings.debug.sdk_subtitle")}</div>
                        </div>
                        <div class={`text-xs px-2 py-1 rounded-full border ${opencodeConnectStatusStyle()}`}>
                          {opencodeConnectStatusLabel()}
                        </div>
                      </div>
                      <div class="space-y-1">
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {props.opencodeConnectStatus?.baseUrl ?? translate("settings.debug.base_url_unavailable")}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {props.opencodeConnectStatus?.directory ?? translate("settings.debug.no_project_directory")}
                        </div>
                        <div class="text-[11px] text-gray-7">
                          {translate("settings.debug.last_attempt")} {opencodeConnectTimestamp() ?? "—"}
                        </div>
                        <Show when={props.opencodeConnectStatus?.reason}>
                          <div class="text-[11px] text-gray-7">
                            {translate("settings.debug.reason")} {props.opencodeConnectStatus?.reason}
                          </div>
                        </Show>
                      </div>
                      <Show when={props.opencodeConnectStatus?.error}>
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">{translate("settings.debug.last_error")}</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {props.opencodeConnectStatus?.error}
                          </pre>
                        </div>
                      </Show>
                    </div>

                    <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <div class="text-sm font-medium text-gray-12">{translate("settings.debug.openwork_title")}</div>
                          <div class="text-xs text-gray-10">{translate("settings.debug.openwork_subtitle")}</div>
                        </div>
                        <div class={`text-xs px-2 py-1 rounded-full border ${openworkStatusStyle()}`}>
                          {openworkStatusLabel()}
                        </div>
                      </div>
                      <div class="space-y-1">
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {(props.openworkServerHostInfo?.baseUrl ?? props.openworkServerUrl) ||
                            translate("settings.debug.base_url_unavailable")}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {translate("settings.debug.pid")} {props.openworkServerHostInfo?.pid ?? "—"}
                        </div>
                      </div>
                      <div class="grid gap-2">
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">{translate("settings.debug.last_stdout")}</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {openworkStdout()}
                          </pre>
                        </div>
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">{translate("settings.debug.last_stderr")}</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {openworkStderr()}
                          </pre>
                        </div>
                      </div>
                    </div>

                    <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <div class="text-sm font-medium text-gray-12">{translate("settings.debug.owpenbot_title")}</div>
                          <div class="text-xs text-gray-10">{translate("settings.debug.owpenbot_subtitle")}</div>
                        </div>
                        <div class={`text-xs px-2 py-1 rounded-full border ${owpenbotStatusStyle()}`}>
                          {owpenbotStatusLabel()}
                        </div>
                      </div>
                      <div class="space-y-1">
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {props.owpenbotInfo?.opencodeUrl?.trim() || translate("settings.debug.opencode_url_unavailable")}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {props.owpenbotInfo?.workspacePath?.trim() || translate("settings.debug.no_workspace_directory")}
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono truncate">
                          {translate("settings.debug.pid")} {props.owpenbotInfo?.pid ?? "—"}
                        </div>
                      </div>
                      <div class="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={handleOwpenbotRestart}
                          disabled={owpenbotRestarting() || !isTauriRuntime()}
                          class="text-xs px-3 py-1.5"
                        >
                          <RefreshCcw class={`w-3.5 h-3.5 mr-1.5 ${owpenbotRestarting() ? "animate-spin" : ""}`} />
                          {owpenbotRestarting()
                            ? translate("settings.debug.restarting")
                            : translate("settings.debug.restart")}
                        </Button>
                        <Show when={props.owpenbotInfo?.running}>
                          <Button
                            variant="ghost"
                            onClick={handleOwpenbotStop}
                            disabled={owpenbotRestarting()}
                            class="text-xs px-3 py-1.5"
                          >
                            {translate("settings.debug.stop")}
                          </Button>
                        </Show>
                      </div>
                      <Show when={owpenbotRestartError()}>
                        <div class="text-xs text-red-11 bg-red-3/50 border border-red-6 rounded-lg p-2">
                          {owpenbotRestartError()}
                        </div>
                      </Show>
                      <div class="grid gap-2">
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">{translate("settings.debug.last_stdout")}</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {owpenbotStdout()}
                          </pre>
                        </div>
                        <div>
                          <div class="text-[11px] text-gray-9 mb-1">{translate("settings.debug.last_stderr")}</div>
                          <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-24 overflow-auto bg-gray-2/50 border border-gray-6 rounded-lg p-2">
                            {owpenbotStderr()}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                    <div class="flex items-center justify-between gap-3">
                      <div class="text-sm font-medium text-gray-12">{translate("settings.debug.diagnostics_title")}</div>
                      <div class="text-[11px] text-gray-8 font-mono truncate">
                        {props.openworkServerDiagnostics?.version ?? "—"}
                      </div>
                    </div>
                    <Show
                      when={props.openworkServerDiagnostics}
                      fallback={<div class="text-xs text-gray-9">{translate("settings.debug.diagnostics_unavailable")}</div>}
                    >
                      {(diag) => (
                        <div class="grid md:grid-cols-2 gap-2 text-xs text-gray-11">
                          <div>{translate("settings.debug.started")} {formatUptime(diag().uptimeMs)}</div>
                          <div>
                            {translate("settings.debug.read_only")} {diag().readOnly ? translate("common.true") : translate("common.false")}
                          </div>
                          <div>
                            {translate("settings.debug.approval")} {diag().approval.mode} ({diag().approval.timeoutMs}ms)
                          </div>
                          <div>{translate("settings.debug.workspaces")} {diag().workspaceCount}</div>
                          <div>{translate("settings.debug.active_workspace")} {diag().activeWorkspaceId ?? "—"}</div>
                          <div>{translate("settings.debug.config_path")} {diag().server.configPath ?? translate("settings.debug.default")}</div>
                          <div>{translate("settings.debug.token_source")} {diag().tokenSource.client}</div>
                          <div>{translate("settings.debug.host_token_source")} {diag().tokenSource.host}</div>
                        </div>
                      )}
                    </Show>
                  </div>

                  <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                    <div class="flex items-center justify-between gap-3">
                      <div class="text-sm font-medium text-gray-12">{translate("settings.debug.capabilities_title")}</div>
                      <div class="text-[11px] text-gray-8 font-mono truncate">
                        {props.openworkServerWorkspaceId
                          ? `${translate("settings.debug.workspace_label")} ${props.openworkServerWorkspaceId}`
                          : translate("settings.debug.workspace_unresolved")}
                      </div>
                    </div>
                    <Show
                      when={props.openworkServerCapabilities}
                      fallback={<div class="text-xs text-gray-9">{translate("settings.debug.capabilities_unavailable")}</div>}
                    >
                      {(caps) => (
                        <div class="grid md:grid-cols-2 gap-2 text-xs text-gray-11">
                          <div>{translate("settings.debug.capability_skills")} {formatCapability(caps().skills)}</div>
                          <div>{translate("settings.debug.capability_plugins")} {formatCapability(caps().plugins)}</div>
                          <div>{translate("settings.debug.capability_mcp")} {formatCapability(caps().mcp)}</div>
                          <div>{translate("settings.debug.capability_commands")} {formatCapability(caps().commands)}</div>
                          <div>{translate("settings.debug.capability_config")} {formatCapability(caps().config)}</div>
                        </div>
                      )}
                    </Show>
                  </div>

                  <div class="grid md:grid-cols-2 gap-4">
                    <div class="bg-gray-1 border border-gray-6 rounded-xl p-4">
                      <div class="text-xs text-gray-10 mb-2">{translate("settings.debug.pending_permissions")}</div>
                      <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-64 overflow-auto">
                        {props.safeStringify(props.pendingPermissions)}
                      </pre>
                    </div>
                    <div class="bg-gray-1 border border-gray-6 rounded-xl p-4">
                      <div class="text-xs text-gray-10 mb-2">{translate("settings.debug.recent_events")}</div>
                      <pre class="text-xs text-gray-12 whitespace-pre-wrap break-words max-h-64 overflow-auto">
                        {props.safeStringify(props.events)}
                      </pre>
                    </div>
                  </div>

                  <div class="bg-gray-1 p-4 rounded-xl border border-gray-6 space-y-3">
                    <div class="flex items-center justify-between gap-3">
                      <div class="text-sm font-medium text-gray-12">{translate("settings.debug.audit_title")}</div>
                      <div class={`text-xs px-2 py-1 rounded-full border ${openworkAuditStatusStyle()}`}>
                        {openworkAuditStatusLabel()}
                      </div>
                    </div>
                    <Show when={props.openworkAuditError}>
                      <div class="text-xs text-red-11">{props.openworkAuditError}</div>
                    </Show>
                    <Show
                      when={props.openworkAuditEntries.length > 0}
                      fallback={<div class="text-xs text-gray-9">{translate("settings.debug.audit_empty")}</div>}
                    >
                      <div class="divide-y divide-gray-6/50">
                        <For each={props.openworkAuditEntries}>
                          {(entry) => (
                            <div class="flex items-start justify-between gap-4 py-2">
                              <div class="min-w-0">
                                <div class="text-sm text-gray-12 truncate">{entry.summary}</div>
                                <div class="text-[11px] text-gray-9 truncate">
                                  {entry.action} · {entry.target} · {formatActor(entry)}
                                </div>
                              </div>
                              <div class="text-[11px] text-gray-9 whitespace-nowrap">
                                {entry.timestamp ? formatRelativeTime(entry.timestamp) : "—"}
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                </div>
              </div>
            </section>
          </Show>
        </Match>
      </Switch>

      <LanguagePickerModal
        open={languageModalOpen()}
        currentLanguage={currentLocale()}
        onSelect={setLocale}
        onClose={() => setLanguageModalOpen(false)}
      />
    </section>
  );
}
