import { useState, useEffect } from "react";
import Button from "~/components/Button";
import { CloseIcon } from "~/images/icons";

export interface WelcomeHighlight {
  title: string;
  description: string;
}

export interface WelcomeMessage {
  id: string;
  title: string;
  message: string;
  highlights?: WelcomeHighlight[];
  link?: string;
}

const STORAGE_KEY = (id: string) => `welcome_dismissed:${id}`;

export function WelcomeBanner({ id, title, message, highlights, link }: WelcomeMessage) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY(id))) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, [id]);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY(id), "true");
    } catch { /* private browsing / quota — just hide it */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div id={id} className="mb-6 flex w-full flex-col items-start justify-between gap-4 rounded-lg border border-blue-400 dark:border-blue-800 bg-blue-100 dark:bg-blue-950 px-5 py-4">
      <div>
        <h5 className="mb-4">{title}</h5>
        <p>{message}</p>
        {highlights && highlights.length > 0 && (
          <ul className="mt-3 space-y-2 list-disc pl-5">
            {highlights.map((h) => (
              <li key={h.title}>
                <span className="font-semibold">{h.title}.</span> {h.description}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex justify-end items-center gap-2 w-full">
        {link &&
          <Button
            variant="solid"
            color="primary"
            onClick={() => window.open(link, "_blank")}
            aria-label="release notes"
            text="Release Notes"
          />
        }
        <Button
          variant="solid"
          color="muted"
          onClick={dismiss}
          aria-label="Dismiss"
          text="Dismiss"
        />
      </div>
    </div>
  );
}