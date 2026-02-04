import { For, Show } from "solid-js";
import { CheckCircle2, Circle } from "lucide-solid";
import { LANGUAGE_OPTIONS, type Language, t, currentLocale } from "../../i18n";

export type LanguagePickerModalProps = {
  open: boolean;
  currentLanguage: Language;
  onSelect: (language: Language) => void;
  onClose: () => void;
};

export default function LanguagePickerModal(props: LanguagePickerModalProps) {
  const translate = (key: string) => t(key, currentLocale());

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 bg-black/35 flex items-center justify-center z-50 p-4">
        <div class="bg-gray-1 rounded-2xl p-6 w-full max-w-md border border-gray-6 shadow-xl">
          <h3 class="text-lg font-medium text-gray-12 mb-4">{translate("settings.language")}</h3>

          <div class="space-y-2">
            <For each={LANGUAGE_OPTIONS}>
              {(option) => (
                <button
                  class={`w-full p-3 rounded-xl text-left transition-all border ${
                    props.currentLanguage === option.value
                      ? "bg-gray-2 text-gray-12 border-gray-6"
                      : "bg-gray-1 text-gray-10 hover:bg-gray-2 border-gray-6/40"
                  }`}
                  onClick={() => {
                    props.onSelect(option.value);
                    props.onClose();
                  }}
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex-1">
                      <div class="font-medium text-sm">{option.nativeName}</div>
                      <Show when={option.label !== option.nativeName}>
                        <div class="text-xs text-gray-7 mt-0.5">{option.label}</div>
                      </Show>
                    </div>
                    <div class="text-gray-9">
                      <Show
                        when={props.currentLanguage === option.value}
                        fallback={<Circle size={14} />}
                      >
                        <CheckCircle2 size={14} class="text-green-11" />
                      </Show>
                    </div>
                  </div>
                </button>
              )}
            </For>
          </div>

          <button
            class="mt-4 w-full py-2 text-sm text-gray-10 hover:text-gray-12 transition-colors"
            onClick={props.onClose}
          >
            {translate("common.cancel")}
          </button>
        </div>
      </div>
    </Show>
  );
}
