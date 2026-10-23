"use client";

import { type UseFormReturn } from "react-hook-form";
import { type ReactNode } from "react";
import { z } from "zod";
import { Button, Field, Input, Modal, Textarea } from "@/components/ui";

/**
 * Generate a URL-safe slug from a display name (e.g. "Gold Plus" -> "gold-plus").
 *
 * Unchanged from the original implementation - it is only used to *suggest* a
 * slug; the slug field itself remains fully editable.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validation schemas for the membership CMS forms.
 *
 * Kept identical to the previous inline definitions so that error
 * messages, coercions and defaults are unchanged.
 */
export const planSchema = z.object({
  name: z.string().min(2, "Name is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and dashes only"),
  description: z.string().optional(),
  annual_price: z.coerce.number().min(0, "Price must be 0 or more"),
  registration_fee: z.coerce.number().min(0, "Fee must be 0 or more"),
  display_order: z.coerce.number().min(0).default(0),
  cta_text: z.string().optional(),
  cta_link: z.string().optional(),
});
export type PlanForm = z.infer<typeof planSchema>;

export const benefitSchema = z.object({
  description: z.string().min(2, "Description is required"),
  display_order: z.coerce.number().min(0).default(0),
});
export type BenefitForm = z.infer<typeof benefitSchema>;

/** Section heading used inside the modals to group related fields. */
function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-edge bg-panel-2/40 p-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">{title}</h3>
      {description && <p className="mt-1 text-xs text-muted">{description}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/**
 * Plan create/edit modal.
 *
 * The form instance is created by the container so that opening/closing the
 * modal keeps the exact same reset + validation behaviour as before.
 */
export function PlanFormModal({
  open,
  onClose,
  isEditing,
  form,
  onSubmit,
  isSaving,
  error,
}: {
  open: boolean;
  onClose: () => void;
  isEditing: boolean;
  form: UseFormReturn<PlanForm>;
  onSubmit: (values: PlanForm) => void;
  isSaving: boolean;
  error?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={isEditing ? "Edit Plan" : "New Plan"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const v = Object.fromEntries(fd.entries());
          onSubmit({
            ...v,
            annual_price: Number(v.annual_price),
            registration_fee: Number(v.registration_fee),
            display_order: Number(v.display_order),
          } as unknown as PlanForm);
        }}
        className="space-y-4"
      >
        <FormSection
          title="Identity"
          description="Shown as the plan heading on the public membership page."
        >
          <Field label="Name" error={form.formState.errors.name?.message}>
            <Input {...form.register("name")} />
          </Field>
          <Field label="Slug" error={form.formState.errors.slug?.message}>
            <div className="flex gap-2">
              <Input {...form.register("slug")} placeholder="gold-plus" />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const name = form.getValues("name");
                  if (name) form.setValue("slug", slugify(name), { shouldValidate: true });
                }}
              >
                Generate
              </Button>
            </div>
          </Field>
          <Field label="Description">
            <Textarea {...form.register("description")} />
          </Field>
        </FormSection>

        <FormSection
          title="Pricing"
          description="Annual subscription price and one-off registration fee."
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Annual price (KES)" error={form.formState.errors.annual_price?.message}>
              <Input type="number" min={0} step="1" {...form.register("annual_price")} />
            </Field>
            <Field
              label="Registration fee (KES)"
              error={form.formState.errors.registration_fee?.message}
            >
              <Input type="number" min={0} step="1" {...form.register("registration_fee")} />
            </Field>
          </div>
          <Field label="Display order" error={form.formState.errors.display_order?.message}>
            <Input type="number" min={0} {...form.register("display_order")} />
          </Field>
        </FormSection>

        <FormSection
          title="Call to action"
          description="Optional button copy and destination for this plan."
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="CTA text">
              <Input {...form.register("cta_text")} placeholder="Join now" />
            </Field>
            <Field label="CTA link">
              <Input {...form.register("cta_link")} placeholder="/membership" />
            </Field>
          </div>
        </FormSection>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Benefit create/edit modal - always scoped to a single plan.
 */
export function BenefitFormModal({
  open,
  onClose,
  planName,
  isEditing,
  form,
  onSubmit,
  isSaving,
  error,
}: {
  open: boolean;
  onClose: () => void;
  planName?: string;
  isEditing: boolean;
  form: UseFormReturn<BenefitForm>;
  onSubmit: (values: BenefitForm) => void;
  isSaving: boolean;
  error?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        planName
          ? `${isEditing ? "Edit" : "New"} Benefit - ${planName}`
          : isEditing
            ? "Edit Benefit"
            : "New Benefit"
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const v = Object.fromEntries(fd.entries());
          onSubmit({ ...v, display_order: Number(v.display_order) } as unknown as BenefitForm);
        }}
        className="space-y-4"
      >
        <Field label="Description" error={form.formState.errors.description?.message}>
          <Textarea
            {...form.register("description")}
            placeholder="e.g. 10% discount on all dining"
          />
        </Field>
        <Field label="Display order" error={form.formState.errors.display_order?.message}>
          <Input type="number" min={0} {...form.register("display_order")} />
        </Field>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}


