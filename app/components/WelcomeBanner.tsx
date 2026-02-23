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
    <div id={id} className="mb-6 flex items-start justify-between gap-4 rounded-lg border border-blue-400 dark:border-blue-800 bg-blue-100 dark:bg-blue-950 px-5 py-4">
      <div>
        <h5>{title}</h5>
        <p className="mb-0">{message}</p>
        <a href={link} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 underline mt-2 inline-block">
          {link}
        </a>
      </div>
      <Button
        variant="text"
        icon={<CloseIcon size="sm" />}
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 mt-1"
      />
    </div>
  );
}