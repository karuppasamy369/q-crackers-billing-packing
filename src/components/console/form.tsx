"use client";

import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/server/http/action-result";

export const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900";

export function Field({
  label,
  name,
  help,
  children,
}: {
  label: string;
  name: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {help ? <p className="mt-1 text-xs text-gray-500">{help}</p> : null}
    </div>
  );
}

export function SubmitButton({
  children = "Save",
  variant = "primary",
}: {
  children?: React.ReactNode;
  variant?: "primary" | "danger" | "secondary";
}) {
  const { pending } = useFormStatus();
  const base = "rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60";
  const styles = {
    primary: "bg-gray-900 text-white hover:bg-gray-800",
    danger: "bg-red-600 text-white hover:bg-red-500",
    secondary: "border border-gray-300 text-gray-700 hover:bg-gray-50",
  } as const;
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${base} ${styles[variant]}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function FormNotice({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
        {state.message ?? "Saved."}
      </p>
    );
  }
  return (
    <p
      role="alert"
      className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {state.error}
    </p>
  );
}
