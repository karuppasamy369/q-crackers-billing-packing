"use client";

import { useEffect } from "react";

export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6">
      <h2 className="text-sm font-semibold text-red-800">
        Something went wrong
      </h2>
      <p className="mt-1 text-sm text-red-700">
        The action could not be completed. This has been logged. You can try
        again, or return to the dashboard.
      </p>
      <div className="mt-4 flex gap-2">
        <button
          onClick={reset}
          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm"
        >
          Try again
        </button>
        <a
          href="/app/dashboard"
          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm"
        >
          Dashboard
        </a>
      </div>
    </div>
  );
}
