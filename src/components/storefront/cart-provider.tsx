"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "qc_cart_v1";
const MAX_LINES = 30;
const MAX_QTY = 100;

export type CartItem = { slug: string; quantity: number };

type CartContextValue = {
  items: CartItem[];
  count: number;
  ready: boolean;
  add: (slug: string, quantity?: number) => void;
  setQty: (slug: string, quantity: number) => void;
  remove: (slug: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function sanitize(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CartItem[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as CartItem).slug === "string" &&
      Number.isInteger((entry as CartItem).quantity)
    ) {
      const q = Math.min(MAX_QTY, Math.max(1, (entry as CartItem).quantity));
      if (!out.some((i) => i.slug === (entry as CartItem).slug)) {
        out.push({ slug: (entry as CartItem).slug, quantity: q });
      }
    }
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setItems(sanitize(JSON.parse(stored)));
    } catch {
      /* ignore corrupt / unavailable storage */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage may be unavailable */
    }
  }, [items, ready]);

  const add = useCallback((slug: string, quantity = 1) => {
    setItems((cur) => {
      const existing = cur.find((i) => i.slug === slug);
      if (existing) {
        return cur.map((i) =>
          i.slug === slug
            ? { ...i, quantity: Math.min(MAX_QTY, i.quantity + quantity) }
            : i,
        );
      }
      if (cur.length >= MAX_LINES) return cur;
      return [...cur, { slug, quantity: Math.min(MAX_QTY, quantity) }];
    });
  }, []);

  const setQty = useCallback((slug: string, quantity: number) => {
    setItems((cur) => {
      if (quantity <= 0) return cur.filter((i) => i.slug !== slug);
      return cur.map((i) =>
        i.slug === slug
          ? { ...i, quantity: Math.min(MAX_QTY, Math.trunc(quantity)) }
          : i,
      );
    });
  }, []);

  const remove = useCallback((slug: string) => {
    setItems((cur) => cur.filter((i) => i.slug !== slug));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      ready,
      add,
      setQty,
      remove,
      clear,
    }),
    [items, ready, add, setQty, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within <CartProvider>");
  return ctx;
}
