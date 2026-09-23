// app/components/landing/CreateBoardForm.tsx
// The homepage's board-creation form (SITE-003). It posts to the home route's
// action; validation errors come back from that action as props.
import { Form, Link } from "react-router";
import { RocketIcon } from "~/images/icons";
import { CREATE_FORM_ID } from "./CreateBoardLink";

export type CreateBoardErrors = { title?: string; no_jerks?: string };

export default function CreateBoardForm({ errors }: { errors?: CreateBoardErrors }) {
  return (
    <div
      id={CREATE_FORM_ID}
      className="relative scroll-mt-24 rounded-2xl border border-white/10 bg-night-800/70 p-8 text-left backdrop-blur-md glow-airglow"
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-airglow-300">
        Free · No sign-up
      </p>
      <h2 className="py-0 mb-6 text-2xl font-bold text-white">Create Your First Board</h2>
      <Form method="post">
        <div aria-hidden="true" style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}>
          <label htmlFor="website">Website</label>
          <input type="text" id="website" name="website" autoComplete="off" tabIndex={-1} />
        </div>
        <div className="mb-5">
          <label htmlFor="title" className="mb-2 block text-sm font-semibold text-slate-200">
            Title
          </label>
          <input
            type="text"
            id="title"
            name="title"
            placeholder="Your stellar board title here..."
            aria-invalid={errors?.title ? true : undefined}
            className="w-full rounded-lg border border-night-600 bg-night-950/70 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-airglow-500 focus:ring-2 focus:ring-airglow-500/40"
          />
          {errors?.title && <p className="mt-2 mb-0 text-sm text-red-400">{errors.title}</p>}
        </div>
        <div className="mb-6 flex items-start gap-3 text-sm text-slate-300">
          <input type="checkbox" id="no_jerks" name="no_jerks" className="mt-1 accent-airglow-300" />
          <label htmlFor="no_jerks">
            I agree to the{" "}
            <Link to="/terms-of-service" target="_blank" className="text-starlight-300 underline">
              Terms of Service
            </Link>{" "}
            &{" "}
            <Link to="/privacy-policy" target="_blank" className="text-starlight-300 underline">
              Privacy Policy
            </Link>
            , and to treat others the way I want to be treated.
          </label>
        </div>
        {errors?.no_jerks && <p className="-mt-3 mb-5 text-sm text-red-400">{errors.no_jerks}</p>}
        <button
          type="submit"
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-airglow-300 to-starlight-300 px-6 py-3 text-base font-semibold text-night-950 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-airglow-300"
        >
          Launch <RocketIcon size="md" />
        </button>
      </Form>
      <p className="mt-4 mb-0 text-center text-xs text-slate-400">
        Share the link and your team is in. Guest boards live 30 days — sign in to keep them.
      </p>
    </div>
  );
}
