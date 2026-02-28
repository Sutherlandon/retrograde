import { useState, useEffect } from "react";
import Button from "~/components/Button";
import { CloseIcon } from "~/images/icons";

export interface WelcomeMessage {
  id: string;
  title: string;
  message: string;
  link: string;
}

const STORAGE_KEY = (id: string) => `welcome_dismissed:${id}`;

export function WelcomeBanner({ id, title, message, link }: WelcomeMessage) {
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
      </div>
      <div className="flex justify-end items-center gap-2 w-full">
        <Button
          variant="solid"
          color="primary"
          onClick={() => window.open(link, "_blank")}
          aria-label="release notes"
          text="v1.2.1 Release Notes"
        />
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