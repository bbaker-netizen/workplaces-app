"use client";

/**
 * Root error boundary. Catches errors thrown in the root layout / any
 * uncaught render error and shows a real message + reload instead of a
 * blank screen. Must render its own <html>/<body> (it replaces the root
 * layout when it fires).
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in the browser console / Netlify function logs.
    console.error("Global error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F5F1E8",
          fontFamily: "Arial, Helvetica, sans-serif",
          color: "#1A1A1A",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 15, color: "#555", marginBottom: 20 }}>
            The page hit an error and couldn&apos;t load. Try reloading — if it
            keeps happening, send this code to your Business Builder.
          </p>
          {error.digest && (
            <p
              style={{
                fontFamily: "monospace",
                fontSize: 12,
                color: "#888",
                marginBottom: 20,
              }}
            >
              Error ref: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#2E4057",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "10px 24px",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
