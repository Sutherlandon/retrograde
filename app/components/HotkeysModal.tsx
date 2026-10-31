// app/components/HotkeysModal.tsx
// Modal listing every hotkey in HOTKEY_GROUPS. Portaled to <body> because the
// header it opens from is a stacking context the Command Deck paints over, and
// on mobile its drawer is transformed, which would anchor a fixed overlay to it.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { HOTKEY_GROUPS, MAC_KEY_SYMBOLS } from "~/config/hotkeys";
import { CloseIcon } from "~/images/icons";

interface HotkeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HotkeysModal({ isOpen, onClose }: HotkeysModalProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    listRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Only reached in the browser: the modal opens from a click.
  const isMac = navigator.platform.startsWith("Mac");

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        data-testid="hotkeys-backdrop"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hotkeys-title"
        className="relative flex flex-col overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md mx-4 animate-scaleIn max-h-[80vh]"
      >
        <h2 id="hotkeys-title" className="p-6 pb-4 text-lg font-semibold text-center text-slate-800 dark:text-white">
          Hotkeys
        </h2>

        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute top-6 right-6 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
        >
          <CloseIcon size="md" />
        </button>

        <div
          ref={listRef}
          data-testid="hotkeys-list"
          tabIndex={-1}
          className="space-y-4 px-6 pb-6 overflow-y-auto outline-none"
        >
          {HOTKEY_GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-1.5">{group.title}</h3>
              <ul className="space-y-1.5">
                {group.hotkeys.map((hotkey) => (
                  <li key={hotkey.keys.join("+")} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-gray-600 dark:text-gray-300">{hotkey.description}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {hotkey.keys.map((key) => (
                        <kbd
                          key={key}
                          className="text-[10px] font-sans px-1.5 py-0.5 rounded border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-200"
                        >
                          {isMac && <span className="text-xs mr-1">{MAC_KEY_SYMBOLS[key]}</span>}
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
