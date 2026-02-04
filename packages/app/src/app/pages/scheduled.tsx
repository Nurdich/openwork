import { For, Show, createMemo, createSignal } from "solid-js";

import type { ScheduledJob } from "../types";
import { formatRelativeTime, isTauriRuntime } from "../utils";

import Button from "../components/button";
import {
  Calendar,
  Clock,
  FolderOpen,
  RefreshCw,
  Terminal,
  Trash2,
} from "lucide-solid";
import { currentLocale, t } from "../../i18n";

export type ScheduledTasksViewProps = {
  jobs: ScheduledJob[];
  source: "local" | "remote";
  sourceReady: boolean;
  status: string | null;
  busy: boolean;
  lastUpdatedAt: number | null;
  refreshJobs: (options?: { force?: boolean }) => void;
  deleteJob: (name: string) => Promise<void> | void;
  isWindows: boolean;
};

const toRelative = (value: string | null | undefined, fallback: string) => {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return fallback;
  return formatRelativeTime(parsed);
};

const taskSummary = (job: ScheduledJob, translate: (key: string) => string) => {
  const run = job.run;
  if (run?.command) {
    const args = run.arguments ? ` ${run.arguments}` : "";
    return { label: translate("scheduled.summary.command"), value: `${run.command}${args}`, mono: true };
  }
  const prompt = run?.prompt ?? job.prompt;
  if (prompt) {
    return { label: translate("scheduled.summary.prompt"), value: prompt, mono: false };
  }
  return {
    label: translate("scheduled.summary.task"),
    value: translate("scheduled.summary.no_prompt"),
    mono: false,
  };
};

const statusLabel = (status: string | null | undefined, translate: (key: string) => string) => {
  if (!status) return translate("scheduled.status.not_run");
  if (status === "running") return translate("scheduled.status.running");
  if (status === "success") return translate("scheduled.status.success");
  if (status === "failed") return translate("scheduled.status.failed");
  return status;
};

const statusTone = (status?: string | null) => {
  if (status === "success") return "border-emerald-7/50 bg-emerald-4/20 text-emerald-11";
  if (status === "failed") return "border-red-7/50 bg-red-4/20 text-red-11";
  if (status === "running") return "border-amber-7/50 bg-amber-4/20 text-amber-11";
  return "border-gray-6/60 bg-gray-2/40 text-gray-11";
};

export default function ScheduledTasksView(props: ScheduledTasksViewProps) {
  const translate = (key: string) => t(key, currentLocale());
  const supported = createMemo(() => {
    if (props.source === "remote") return props.sourceReady;
    return isTauriRuntime() && !props.isWindows;
  });
  const supportNote = createMemo(() => {
    if (props.source === "remote") {
      return props.sourceReady ? null : translate("scheduled.support.remote_unavailable");
    }
    if (!isTauriRuntime()) return translate("scheduled.support.desktop_required");
    if (props.isWindows) return translate("scheduled.support.windows_unsupported");
    return null;
  });
  const sourceDescription = createMemo(() =>
    props.source === "remote"
      ? translate("scheduled.source.remote_description")
      : translate("scheduled.source.local_description")
  );
  const sourceLabel = createMemo(() =>
    props.source === "remote"
      ? translate("scheduled.source.remote_label")
      : translate("scheduled.source.local_label")
  );
  const schedulerLabel = createMemo(() =>
    props.source === "remote"
      ? translate("scheduled.scheduler.remote_label")
      : translate("scheduled.scheduler.local_label")
  );
  const schedulerHint = createMemo(() =>
    props.source === "remote"
      ? translate("scheduled.scheduler.remote_hint")
      : translate("scheduled.scheduler.local_hint")
  );
  const schedulerUnavailableHint = createMemo(() =>
    props.source === "remote"
      ? translate("scheduled.scheduler.remote_unavailable")
      : translate("scheduled.scheduler.desktop_only")
  );
  const deleteDescription = createMemo(() =>
    props.source === "remote"
      ? translate("scheduled.delete.remote_description")
      : translate("scheduled.delete.local_description")
  );

  const lastUpdatedLabel = createMemo(() => {
    if (!props.lastUpdatedAt) return translate("scheduled.last_synced_never");
    return formatRelativeTime(props.lastUpdatedAt);
  });

  const [deleteTarget, setDeleteTarget] = createSignal<ScheduledJob | null>(null);
  const [deleteBusy, setDeleteBusy] = createSignal(false);
  const [deleteError, setDeleteError] = createSignal<string | null>(null);

  const confirmDelete = async () => {
    const target = deleteTarget();
    if (!target) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await props.deleteJob(target.slug);
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDeleteError(message || translate("scheduled.delete_failed"));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <section class="space-y-8">
      <div class="bg-gradient-to-r from-gray-2 to-gray-4 rounded-3xl p-1">
        <div class="bg-gray-1 rounded-[22px] p-6 md:p-8 space-y-6">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 class="text-lg font-semibold text-gray-12">{translate("scheduled.title")}</h3>
              <p class="text-sm text-gray-10 mt-1">
                {sourceDescription()}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => props.refreshJobs({ force: true })}
              disabled={!supported() || props.busy}
            >
              <RefreshCw size={16} />
              {props.busy ? translate("scheduled.refreshing") : translate("scheduled.refresh")}
            </Button>
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-2xl border border-gray-6/60 bg-gray-2/40 p-4">
              <div class="text-[11px] uppercase tracking-wider text-gray-10">
                {translate("scheduled.cards.jobs")}
              </div>
              <div class="mt-2 text-2xl font-semibold text-gray-12">
                {props.jobs.length}
              </div>
              <div class="text-xs text-gray-9 mt-1">{translate("scheduled.cards.active_schedules")}</div>
            </div>
            <div class="rounded-2xl border border-gray-6/60 bg-gray-2/40 p-4">
              <div class="text-[11px] uppercase tracking-wider text-gray-10">
                {translate("scheduled.cards.last_sync")}
              </div>
              <div class="mt-2 text-lg font-semibold text-gray-12">
                {supported() ? lastUpdatedLabel() : translate("scheduled.cards.unavailable")}
              </div>
              <div class="text-xs text-gray-9 mt-1">{sourceLabel()}</div>
            </div>
            <div class="rounded-2xl border border-gray-6/60 bg-gray-2/40 p-4">
              <div class="text-[11px] uppercase tracking-wider text-gray-10">
                {translate("scheduled.cards.scheduler")}
              </div>
              <div class="mt-2 text-lg font-semibold text-gray-12">
                {supported() ? schedulerLabel() : translate("scheduled.cards.unavailable")}
              </div>
              <div class="text-xs text-gray-9 mt-1">
                {supported() ? schedulerHint() : schedulerUnavailableHint()}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Show when={supportNote()}>
        <div class="rounded-2xl border border-gray-6/60 bg-gray-2/40 px-5 py-4 text-sm text-gray-10">
          {supportNote()}
        </div>
      </Show>

      <Show when={props.status}>
        <div class="rounded-2xl border border-red-7/40 bg-red-4/10 px-5 py-4 text-sm text-red-11">
          {props.status}
        </div>
      </Show>

      <Show when={deleteError()}>
        <div class="rounded-2xl border border-red-7/40 bg-red-4/10 px-5 py-4 text-sm text-red-11">
          {deleteError()}
        </div>
      </Show>

      <div class="rounded-2xl border border-gray-6/60 bg-gray-1/40 overflow-hidden">
        <Show
          when={props.jobs.length}
          fallback={
            <div class="px-6 py-10 text-sm text-gray-10">
              {translate("scheduled.empty")}
            </div>
          }
        >
          <div class="divide-y divide-gray-6/60">
            <For each={props.jobs}>
              {(job) => {
                const summary = () => taskSummary(job, translate);
                return (
                  <div class="p-6 space-y-4">
                    <div class="flex flex-wrap items-start justify-between gap-4">
                      <div class="space-y-2">
                        <div class="flex items-center gap-2">
                          <Calendar size={16} class="text-gray-11" />
                          <div class="text-sm font-semibold text-gray-12">{job.name}</div>
                        </div>
                        <div class="text-xs text-gray-10">
                          {translate("scheduled.cron_label")} <span class="font-mono text-gray-12">{job.schedule}</span>
                        </div>
                        <div class="text-[11px] text-gray-7 font-mono">{job.slug}</div>
                      </div>
                      <div class="flex items-center gap-2">
                        <span
                          class={`px-2 py-1 rounded-full border text-[11px] font-medium ${statusTone(
                            job.lastRunStatus
                          )}`}
                        >
                          {statusLabel(job.lastRunStatus, translate)}
                        </span>
                        <Button
                          variant="danger"
                          class="!px-3 !py-2 text-xs"
                          onClick={() => setDeleteTarget(job)}
                          disabled={!supported() || props.busy || deleteBusy()}
                        >
                          <Trash2 size={14} />
                          {translate("scheduled.delete")}
                        </Button>
                      </div>
                    </div>

                    <div class="grid gap-3 md:grid-cols-2">
                      <div class="rounded-xl border border-gray-6/60 bg-gray-2/30 p-4 space-y-2">
                        <div class="text-[10px] uppercase tracking-wide text-gray-10">
                          {summary().label}
                        </div>
                        <div
                          class={`text-sm text-gray-12 break-words ${
                            summary().mono ? "font-mono" : ""
                          }`}
                        >
                          {summary().value}
                        </div>
                      </div>
                      <div class="rounded-xl border border-gray-6/60 bg-gray-2/30 p-4 space-y-2">
                        <div class="text-[10px] uppercase tracking-wide text-gray-10">
                          {translate("scheduled.run_context")}
                        </div>
                        <div class="space-y-2 text-xs text-gray-10">
                          <div class="flex items-center gap-2">
                            <FolderOpen size={14} class="text-gray-9" />
                            <span class="font-mono text-gray-12 break-all">
                              {job.workdir ?? translate("scheduled.default_workdir")}
                            </span>
                          </div>
                          <Show when={job.run?.attachUrl ?? job.attachUrl}>
                            <div class="flex items-center gap-2">
                              <Terminal size={14} class="text-gray-9" />
                              <span class="font-mono text-gray-12 break-all">
                                {job.run?.attachUrl ?? job.attachUrl}
                              </span>
                            </div>
                          </Show>
                          <Show when={job.source}>
                            <div class="text-[11px] text-gray-9">
                              {translate("scheduled.source_label")} {job.source}
                            </div>
                          </Show>
                        </div>
                      </div>
                    </div>

                    <div class="flex flex-wrap gap-4 text-xs text-gray-10">
                      <div class="flex items-center gap-1">
                        <Clock size={12} />
                        {translate("scheduled.last_run")} {toRelative(job.lastRunAt, translate("scheduled.never"))}
                      </div>
                      <div>{translate("scheduled.created")} {toRelative(job.createdAt, translate("scheduled.never"))}</div>
                      <Show when={job.run?.agent}>
                        <div>{translate("scheduled.agent")} {job.run?.agent}</div>
                      </Show>
                      <Show when={job.run?.model}>
                        <div>{translate("scheduled.model")} {job.run?.model}</div>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>

      <Show when={deleteTarget()}>
        <div class="fixed inset-0 z-50 bg-gray-1/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div class="bg-gray-2 border border-gray-6/70 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div class="p-6 space-y-4">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <h3 class="text-lg font-semibold text-gray-12">{translate("scheduled.delete_title")}</h3>
                  <p class="text-sm text-gray-11 mt-1">
                    {deleteDescription()}
                  </p>
                </div>
              </div>
              <div class="rounded-xl bg-gray-1/20 border border-gray-6 p-3 text-xs text-gray-11 font-mono break-all">
                {deleteTarget()?.name}
              </div>
              <div class="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteBusy()}>
                  {translate("scheduled.cancel")}
                </Button>
                <Button variant="danger" onClick={confirmDelete} disabled={deleteBusy()}>
                  {deleteBusy() ? translate("scheduled.deleting") : translate("scheduled.delete")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </section>
  );
}
