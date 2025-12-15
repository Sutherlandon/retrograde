import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { Analytics } from "@vercel/analytics/react";

import type { Route } from "./+types/root";
import "./app.css";
import { useTheme } from "./useTheme";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        {/* <!-- Favicon --> */}
        <link rel="icon" href="/icons/retrograde_logo.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/icons/retrograde_logo-32.png" sizes="32x32" type="image/png" />
        <link rel="alternate icon" href="/icons/retrograde_logo-16.png" sizes="16x16" type="image/png" />

        {/* <!-- Apple Touch Icon --> */}
        <link rel="apple-touch-icon" href="/icons/retrograde_logo-180.png" sizes="180x180" />

        {/* <!-- Android/Chrome Manifest Icon --> */}
        <link rel="icon" href="/icons/retrograde_logo-192.png" sizes="192x192" type="image/png" />
        <link rel="icon" href="/icons/retrograde_logo-512.png" sizes="512x512" type="image/png" />

        {/* <!-- Microsoft Tiles --> */}
        <meta name="msapplication-TileColor" content="#000000" />
        <meta name="msapplication-TileImage" content="/icons/retrograde_logo-270.png" />

        {/* <!-- PWA Manifest --> */}
        {/* <link rel="manifest" href="/manifest.json" /> */}

        {/* <!-- Theme colors --> */}
        <meta name="theme-color" content="#000000" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-status-bar-style" content="black-translucent" />

        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
        <Analytics />
        <script>
          {`(function () {
            const stored = localStorage.getItem('theme')
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
            const theme = stored ?? (prefersDark ? 'dark' : 'light')
            if (theme === 'dark') {
              document.documentElement.classList.add('dark')
            }
          })()`}
        </script>
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
