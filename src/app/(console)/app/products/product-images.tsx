"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addProductImageAction,
  removeProductImageAction,
  setPrimaryImageAction,
} from "./actions";
import {
  SubmitButton,
  FormNotice,
  fieldClass,
} from "@/components/console/form";
import type { ActionResult } from "@/server/http/action-result";

type Image = {
  id: string;
  isPrimary: boolean;
  altText: string | null;
  contentType: string;
};

export function ProductImages({
  productId,
  images,
  canManage,
}: {
  productId: string;
  images: Image[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [uploadState, uploadAction] = useActionState<
    ActionResult | null,
    FormData
  >(addProductImageAction, null);

  useEffect(() => {
    if (uploadState?.ok) router.refresh();
  }, [uploadState, router]);

  const act = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? null : r.error);
      if (r.ok) router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {images.map((img) => (
          <div
            key={img.id}
            className="overflow-hidden rounded-lg border border-gray-200"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/media/product-images/${img.id}`}
              alt={img.altText ?? ""}
              className="aspect-square w-full object-cover"
            />
            <div className="flex items-center justify-between p-1 text-[11px]">
              {img.isPrimary ? (
                <span className="text-green-700">Primary</span>
              ) : canManage ? (
                <button
                  disabled={pending}
                  onClick={() =>
                    act(() => setPrimaryImageAction(productId, img.id))
                  }
                  className="text-gray-500 underline"
                >
                  Make primary
                </button>
              ) : (
                <span />
              )}
              {canManage ? (
                <button
                  disabled={pending}
                  onClick={() => {
                    if (confirm("Remove this image?"))
                      act(() => removeProductImageAction(productId, img.id));
                  }}
                  className="text-red-600 underline"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {images.length === 0 ? (
          <p className="col-span-full text-sm text-gray-400">No images yet.</p>
        ) : null}
      </div>

      {msg ? <p className="text-sm text-red-700">{msg}</p> : null}

      {canManage ? (
        <form
          action={uploadAction}
          className="space-y-2 border-t border-gray-100 pt-4"
        >
          <input type="hidden" name="productId" value={productId} />
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp"
            required
            className="block text-sm"
          />
          <input
            name="altText"
            placeholder="Alt text (optional)"
            className={fieldClass}
          />
          <FormNotice state={uploadState} />
          <SubmitButton variant="secondary">Upload image</SubmitButton>
          <p className="text-xs text-gray-500">
            JPEG, PNG or WebP. Max 5 MB. A product needs at least one image to
            go online.
          </p>
        </form>
      ) : null}
    </div>
  );
}
