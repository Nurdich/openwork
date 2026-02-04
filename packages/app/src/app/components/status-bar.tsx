import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Cpu, MessageCircle, Server, Settings } from "lucide-solid";

import type { OpenworkServerStatus } from "../lib/openwork-server";
import type { OwpenbotStatus } from "../lib/tauri";
import type { McpStatusMap } from "../types";
import { getOwpenbotStatus } from "../lib/tauri";
import { currentLocale, t } from "../../i18n";

import Button from "./button";

type StatusBarProps = {
  clientConnected: boolean;
  openworkServerStatus: OpenworkServerStatus;
  developerMode: boolean;
  onOpenSettings: () => void;
  onOpenMessaging: () => void;
  onOpenProviders: () => Promise<void> | void;
  onOpenMcp: () => void;
  providerConnectedIds: string[];
  mcpStatuses: McpStatusMap;
};

export default function StatusBar(props: StatusBarProps) {
  const translate = (key: string) => t(key, currentLocale());
  const [owpenbotStatus, setOwpenbotStatus] = createSignal<OwpenbotStatus | null>(null);
  const [documentVisible, setDocumentVisible] = createSignal(true);

  const opencodeStatusMeta = createMemo(() => ({
    dot: props.clientConnected ? "bg-green-9" : "bg-gray-6",
    text: props.clientConnected ? "text-green-11" : "text-gray-10",
    label: props.clientConnected ? translate("status.connected") : translate("status.not_connected"),
  }));

  const openworkStatusMeta = createMemo(() => {
    switch (props.openworkServerStatus) {
      case "connected":
        return { dot: "bg-green-9", text: "text-green-11", label: translate("status.ready") };
      case "limited":
        return {
          dot: "bg-amber-9",
          text: "text-amber-11",
          label: translate("status.limited_access"),
        };
      default:
        return { dot: "bg-gray-6", text: "text-gray-10", label: translate("status.unavailable") };
    }
  });

  const messagingMeta = createMemo(() => {
    const status = owpenbotStatus();
    if (!status) {
      return {
        dot: "bg-gray-6",
        text: "text-gray-10",
        label: translate("status.messaging_unavailable"),
      };
    }
    const whatsappLinked = status.whatsapp.linked;
    const telegramConfigured = status.telegram.configured;
    if (whatsappLinked && telegramConfigured) {
      return { dot: "bg-green-9", text: "text-green-11", label: translate("status.messaging_ready") };
    }
    if (whatsappLinked || telegramConfigured || status.running) {
      return { dot: "bg-amber-9", text: "text-amber-11", label: translate("status.messaging_setup") };
    }
    return { dot: "bg-gray-6", text: "text-gray-10", label: translate("status.messaging_offline") };
  });

  type ProTip = {
    id: string;
    label: string;
    enabled: () => boolean;
    action: () => void | Promise<void>;
  };

  const providerConnectedCount = createMemo(() => props.providerConnectedIds?.length ?? 0);
  const notionStatus = createMemo(() => props.mcpStatuses?.notion?.status ?? "disconnected");

  const runAction = (action?: () => void | Promise<void>) => {
    if (!action) return;
    const result = action();
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch(() => undefined);
    }
  };

  const proTips = createMemo<ProTip[]>(() => [
    {
      id: "telegram",
      label: translate("tip.connect_telegram"),
      enabled: () => {
        const status = owpenbotStatus();
        return Boolean(status && !status.telegram.configured);
      },
      action: () => runAction(props.onOpenMessaging),
    },
    {
      id: "whatsapp",
      label: translate("tip.connect_whatsapp"),
      enabled: () => {
        const status = owpenbotStatus();
        return Boolean(status && !status.whatsapp.linked);
      },
      action: () => runAction(props.onOpenMessaging),
    },
    {
      id: "notion",
      label: translate("tip.connect_notion"),
      enabled: () => notionStatus() !== "connected",
      action: () => runAction(props.onOpenMcp),
    },
    {
      id: "providers",
      label: translate("tip.use_own_models"),
      enabled: () => props.clientConnected && providerConnectedCount() === 0,
      action: () => runAction(props.onOpenProviders),
    },
  ]);

  const availableTips = createMemo<ProTip[]>(() => proTips().filter((tip: ProTip) => tip.enabled()));
  const [activeTip, setActiveTip] = createSignal<ProTip | null>(null);
  const [tipVisible, setTipVisible] = createSignal(false);
  const [tipCursor, setTipCursor] = createSignal(0);
  let tipTimer: number | undefined;
  let tipHideTimer: number | undefined;

  const pickNextTip = () => {
    const tips = availableTips();
    if (!tips.length) return null;
    const index = tipCursor() % tips.length;
    const next = tips[index];
    setTipCursor(index + 1);
    setActiveTip(next);
    return next;
  };

  const scheduleTips = (delayMs: number) => {
    if (tipTimer) window.clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => {
      if (!availableTips().length) {
        setTipVisible(false);
        scheduleTips(20_000);
        return;
      }
      if (Math.random() < 0.55) {
        pickNextTip();
        setTipVisible(true);
        if (tipHideTimer) window.clearTimeout(tipHideTimer);
        tipHideTimer = window.setTimeout(() => setTipVisible(false), 9_000);
      } else {
        setTipVisible(false);
      }
      scheduleTips(18_000 + Math.round(Math.random() * 10_000));
    }, delayMs);
  };

  createEffect(() => {
    const tips = availableTips();
    const current = activeTip();
    if (current && tips.some((tip: ProTip) => tip.id === current.id)) return;
    if (!tips.length) {
      setActiveTip(null);
      setTipVisible(false);
      return;
    }
    setActiveTip(tips[0]);
    setTipCursor(1);
  });

  const refreshOwpenbot = async () => {
    const next = await getOwpenbotStatus();
    setOwpenbotStatus(next);
  };

  createEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setDocumentVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    onCleanup(() => document.removeEventListener("visibilitychange", update));
  });

  createEffect(() => {
    if (!documentVisible()) return;
    refreshOwpenbot();
    const interval = window.setInterval(refreshOwpenbot, 15_000);
    onCleanup(() => window.clearInterval(interval));
  });

  onMount(() => {
    scheduleTips(6_000);
    onCleanup(() => {
      if (tipTimer) window.clearTimeout(tipTimer);
      if (tipHideTimer) window.clearTimeout(tipHideTimer);
    });
  });

  return (
    <div class="border-t border-gray-6 bg-gray-1/90 backdrop-blur-md">
      <div class="mx-auto max-w-5xl px-4 py-2 flex flex-wrap items-center gap-3 text-xs">
        <div
          class="flex items-center gap-2"
          title={`${translate("status.opencode_engine")}: ${opencodeStatusMeta().label}`}
        >
          <span class={`w-2 h-2 rounded-full ${opencodeStatusMeta().dot}`} />
          <Cpu class="w-4 h-4 text-gray-11" />
          <Show when={props.developerMode}>
            <span class="text-gray-11 font-medium">OpenCode</span>
            <span class={opencodeStatusMeta().text}>{opencodeStatusMeta().label}</span>
          </Show>
        </div>
        <div class="w-px h-4 bg-gray-6/70" />
        <div
          class="flex items-center gap-2"
          title={`${translate("status.openwork_server")}: ${openworkStatusMeta().label}`}
        >
          <span class={`w-2 h-2 rounded-full ${openworkStatusMeta().dot}`} />
          <Server class="w-4 h-4 text-gray-11" />
          <Show when={props.developerMode}>
            <span class="text-gray-11 font-medium">OpenWork</span>
            <span class={openworkStatusMeta().text}>{openworkStatusMeta().label}</span>
          </Show>
        </div>
        <div class="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            class="h-7 px-2.5 py-0 text-xs"
            onClick={props.onOpenMessaging}
            title={messagingMeta().label}
          >
            <span class="relative">
              <MessageCircle class={`w-4 h-4 ${messagingMeta().text}`} />
              <span class={`absolute -right-1 -bottom-1 w-2 h-2 rounded-full ${messagingMeta().dot}`} />
            </span>
            <Show when={props.developerMode}>
              <span class="text-gray-11 font-medium">{translate("status.messaging_label")}</span>
            </Show>
          </Button>
          <Show when={tipVisible() && activeTip()}>
            <button
              type="button"
              class="flex h-7 items-center gap-2 rounded-full border border-gray-6/70 bg-gray-2/40 px-3 text-xs text-gray-10 transition-colors hover:bg-gray-2/60"
              onClick={() => runAction(activeTip()?.action)}
              title={activeTip()?.label}
              aria-label={activeTip()?.label}
            >
              <span class="uppercase tracking-[0.2em] text-[10px] text-gray-8">
                {translate("status.tip_label")}
              </span>
              <span class="text-gray-11 font-medium">{activeTip()?.label}</span>
            </button>
          </Show>
          <Button
            variant="ghost"
            class="h-7 px-2.5 py-0 text-xs"
            onClick={props.onOpenSettings}
            title={translate("common.settings")}
          >
            <Settings class="w-4 h-4" />
            <Show when={props.developerMode}>
              <span class="text-gray-11 font-medium">{translate("common.settings")}</span>
            </Show>
          </Button>
        </div>
      </div>
    </div>
  );
}
