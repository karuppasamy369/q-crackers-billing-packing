"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from "./actions";
import {
  Field,
  SubmitButton,
  FormNotice,
  fieldClass,
} from "@/components/console/form";
import type { ActionResult } from "@/server/http/action-result";

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export function CategoryForm({
  category,
  onDone,
}: {
  category?: Category;
  onDone?: () => void;
}) {
  const editing = Boolean(category);
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    editing ? updateCategoryAction : createCategoryAction,
    null,
  );
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onDone?.();
    }
  }, [state, router, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      <Field label="Name" name="name">
        <input
          id="name"
          name="name"
          required
          defaultValue={category?.name}
          className={fieldClass}
        />
      </Field>

      <Field
        label="Slug"
        name="slug"
        help="Leave blank to generate one from the name."
      >
        <input
          id="slug"
          name="slug"
          defaultValue={category?.slug}
          className={fieldClass}
        />
      </Field>

      <Field label="Description" name="description">
        <textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={category?.description ?? ""}
          className={fieldClass}
        />
      </Field>

      <div className="flex gap-4">
        <Field label="Sort order" name="sortOrder">
          <input
            id="sortOrder"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={category?.sortOrder ?? 0}
            className={fieldClass}
          />
        </Field>
        <label className="mt-7 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={category?.isActive ?? true}
          />
          Active
        </label>
      </div>

      <FormNotice state={state} />

      <div className="flex items-center gap-3">
        <SubmitButton>
          {editing ? "Save changes" : "Create category"}
        </SubmitButton>
        {editing && category ? <DeleteCategoryButton id={category.id} /> : null}
      </div>
    </form>
  );
}

function DeleteCategoryButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        if (!confirm("Delete this category?")) return;
        const res = await deleteCategoryAction(id);
        if (res.ok) {
          router.push("/app/categories");
          router.refresh();
        } else {
          alert(res.error);
        }
      }}
      className="text-sm text-red-600 underline hover:text-red-500"
    >
      Delete
    </button>
  );
}
