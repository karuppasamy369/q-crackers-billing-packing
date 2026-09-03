"use client";

import { useActionState } from "react";
import { createUserAction, type ActionResult } from "./actions";

const field =
  "mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900";

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(createUserAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Name
          </label>
          <input id="name" name="name" required className={field} />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className={field}
          />
        </div>
        <div>
          <label htmlFor="role" className="block text-sm font-medium">
            Role
          </label>
          <select id="role" name="role" className={field} defaultValue="STAFF">
            <option value="STAFF">Staff</option>
            <option value="PARTNER">Partner</option>
          </select>
        </div>
        <div>
          <label htmlFor="code" className="block text-sm font-medium">
            Login / bill code
          </label>
          <input id="code" name="code" placeholder="auto" className={field} />
          <p className="mt-1 text-xs text-gray-500">
            Drives bill numbers. Blank = auto.
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create account"}
      </button>

      {state?.ok === false ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state?.ok && state.secret ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-900">
            {state.message} Temporary password (shown once):
          </p>
          <code className="mt-1 block break-all rounded bg-white px-2 py-1 font-mono text-amber-900">
            {state.secret.password}
          </code>
          <p className="mt-1 text-xs text-amber-800">
            Share it over a secure channel. The account must change it on first
            sign-in.
          </p>
        </div>
      ) : null}
    </form>
  );
}
