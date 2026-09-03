"use client";

import Link from "next/link";
import { useCart } from "./cart-provider";

export function CartLink({ label }: { label: string }) {
  const { count, ready } = useCart();
  return (
    <Link
      href="/cart"
      className="relative rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
    >
      {label}
      {ready && count > 0 ? (
        <span className="ml-1 rounded-full bg-gray-900 px-1.5 py-0.5 text-xs text-white">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
