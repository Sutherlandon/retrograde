// app/components/landing/CreateBoardLink.tsx
// The marketing site's one call to action: jump to the hero's board form and
// put the cursor in its title field. A plain anchor, so it works before
// hydration and without JavaScript.
import { StartIcon } from "~/images/icons";

export const CREATE_FORM_ID = "create-form";

export default function CreateBoardLink({ className = "" }: { className?: string }) {
  function focusTitle() {
    // The fragment navigation that follows this click resets focus, so land
    // the cursor in the field on the next tick, after it has.
    window.setTimeout(() => document.getElementById("title")?.focus({ preventScroll: true }), 0);
  }

  return (
    <a
      href={`#${CREATE_FORM_ID}`}
      onClick={focusTitle}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-airglow-300 to-starlight-300 px-6 py-3 font-semibold text-night-950 glow-airglow transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-airglow-300 ${className}`}
    >
      Create your first board <StartIcon size="sm" />
    </a>
  );
}
