import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: any) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export default function CloudflareTurnstile({
  actionData,
}: {
  actionData?: any;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!window.turnstile || !ref.current || widgetId.current) return;

    widgetId.current = window.turnstile.render(ref.current, {
      sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
      theme: "auto",
    });

    return () => {
      if (widgetId.current) {
        window.turnstile?.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, []);

  return (
    <div className='mb-4'>
      <div ref={ref} />
      {actionData?.errors?.captcha && (
        <p className="text-red-500 text-sm mt-2 text-center">
          {actionData.errors.captcha}
        </p>
      )}
    </div>
  );
}
