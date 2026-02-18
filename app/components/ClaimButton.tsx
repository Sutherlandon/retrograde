import { useState, useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import Button from "./Button";
import { CheckIcon, CloseIcon } from "~/images/icons";

type ActionData = {
  error?: string;
  success?: boolean;
};

export function ClaimButton() {
  const [open, setOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const [modalKey, setModalKey] = useState(0);
  const fetcher = useFetcher<ActionData>({ key: `claim-board-${modalKey}` });

  const isSubmitting = fetcher.state === "submitting";
  const data = fetcher.data;

  function closeModal() {
    setModalKey(k => k + 1);
    setOpen(false);
  }

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        open &&
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        closeModal();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close on success
  useEffect(() => {
    if (data?.success) {
      closeModal();
    }
  }, [data]);


  return (
    <>
      <Button
        color="primary"
        onClick={() => setOpen(true)}
        text="Claim A Board"
        icon={<CheckIcon />}
      />

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            ref={modalRef}
            className="bg-white dark:bg-gray-800 p-6 pt-2 rounded-lg w-full max-w-md relative"
          >
            <div className="flex justify-between items-center gap-2">
              <h4>Plant Your Flag!</h4>
              <Button
                onClick={() => closeModal()}
                variant="text"
                color="danger"
                icon={<CloseIcon />}
              />
            </div>
            <p className="mb-4 text-sm">
              Claiming an anonymous board will make you the owner of the board, allowing you to manage it from your dashboard. No one else will be able to claim the board once it's associated with your account.
            </p>
            <fetcher.Form method="post" action="/app/board/claim">
              <input
                type="text"
                name="boardLink"
                required
                autoFocus
                placeholder="Paste board link here"
                className="w-full border p-2 rounded mb-3"
              />

              {data?.error && (
                <p className="text-red-500 dark:text-red-400 mb-3">{data.error}</p>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                text={isSubmitting ? "Claiming..." : "Claim Board"}
                icon={<CheckIcon />}
                color="primary"
                className="w-full"
              />
            </fetcher.Form>
          </div>
        </div>
      )}
    </>
  );
}