"use client";

import { useState } from "react";
import { useCart } from "./cart-provider";

export function AddToCart({
  slug,
  label,
  addedLabel,
}: {
  slug: string;
  label: string;
  addedLabel: string;
}) {
  const { add, ready } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  return (
    <button
      type="button"
      disabled={!ready}
      onClick={() => {
        add(slug, 1);
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 1500);
      }}
      className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
    >
      {justAdded ? addedLabel : label}
    </button>
  );
}
