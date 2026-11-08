"use client";

import type { FunctionReturnType } from "convex/server";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import { ImageManager } from "@/components/image-manager";
import { ToolForm, type ToolFormValues } from "@/components/tool-form";
import { ToolImage } from "@/components/tool-image";
import { appErrorMessage } from "@/lib/convex-error";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/options";

type MyTool = FunctionReturnType<typeof api.tools.listMine>[number];

type FormState = { kind: "closed" } | { kind: "new" } | { kind: "edit"; tool: MyTool };

const STATUS_LABELS: Record<MyTool["status"], string> = {
  available: "Available",
  unavailable: "Paused",
};

const STATUS_STYLES: Record<MyTool["status"], string> = {
  available: "border-accent/30 bg-accent/10 text-accent-strong",
  unavailable: "border-line bg-surface text-ink-muted",
};

export function MyListings() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const tools = useQuery(api.tools.listMine, isAuthenticated ? {} : "skip");
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);

  const [form, setForm] = useState<FormState>({ kind: "closed" });
  const [justCreated, setJustCreated] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const closeForm = () => {
    setForm({ kind: "closed" });
    setJustCreated(false);
  };

  const submitNew = async (values: ToolFormValues) => {
    setActionError(null);
    const toolId = await create({
      name: values.name,
      category: values.category,
      condition: values.condition,
      description: values.description,
    });

    // Keep the editor open on the new listing so photos can be added without
    // hunting for it in the list. The summary starts empty; ImageManager reads
    // the authoritative rows itself.
    setForm({
      kind: "edit",
      tool: {
        _id: toolId,
        name: values.name.trim(),
        category: values.category,
        condition: values.condition,
        description: values.description.trim(),
        status: "available",
        createdAt: Date.now(),
        images: { imageCount: 0, cover: null },
      },
    });
    setJustCreated(true);
  };

  const submitEdit = async (tool: MyTool, values: ToolFormValues) => {
    setActionError(null);
    await update({
      toolId: tool._id,
      name: values.name,
      category: values.category,
      condition: values.condition,
      description: values.description,
      status: values.status,
    });
    closeForm();
  };

  const handleRemove = async (tool: MyTool) => {
    setActionError(null);
    try {
      await remove({ toolId: tool._id });
      setConfirmingId(null);
      if (form.kind === "edit" && form.tool._id === tool._id) {
        closeForm();
      }
    } catch (error) {
      setActionError(appErrorMessage(error));
    }
  };

  if (authLoading || !isAuthenticated || tools === undefined) {
    return <ListSkeleton />;
  }

  return (
    <section aria-labelledby="my-listings-heading" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="my-listings-heading" className="text-sm text-ink-muted">
          {tools.length} {tools.length === 1 ? "listing" : "listings"}
        </h2>
        {form.kind === "closed" && (
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setJustCreated(false);
              setForm({ kind: "new" });
            }}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
          >
            List a tool
          </button>
        )}
      </div>

      {form.kind !== "closed" && (
        <div className="mt-4 grid gap-4">
          {justCreated && (
            <p
              role="status"
              className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent-strong"
            >
              Listing saved. Add a few photos below — listings with a cover get more requests.
            </p>
          )}

          <ToolForm
            key={form.kind === "edit" ? `form-${form.tool._id}` : "new"}
            initial={
              form.kind === "edit"
                ? {
                    name: form.tool.name,
                    category: form.tool.category,
                    condition: form.tool.condition,
                    description: form.tool.description,
                    status: form.tool.status === "available" ? "available" : "unavailable",
                  }
                : undefined
            }
            submitLabel={form.kind === "edit" ? "Save changes" : "Add listing"}
            showAvailability={form.kind === "edit"}
            onSubmit={form.kind === "edit" ? (values) => submitEdit(form.tool, values) : submitNew}
            onCancel={closeForm}
          />

          {form.kind === "edit" && (
            <ImageManager key={`photos-${form.tool._id}`} toolId={form.tool._id} />
          )}
        </div>
      )}

      {actionError !== null && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {tools.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line px-5 py-10 text-center">
          <p className="text-sm font-medium">You haven&apos;t listed anything yet.</p>
          <p className="mt-1 text-xs text-ink-muted">
            Add a tool you&apos;re happy to lend and neighbours can start requesting it.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3">
          {tools.map((tool) => (
            <li key={tool._id} className="rounded-xl border border-line bg-surface-raised p-4">
              <div className="flex flex-wrap items-start gap-4">
                <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
                  <ToolImage
                    src={tool.images.cover?.url ?? null}
                    alt={`${tool.name} cover photo`}
                    width={tool.images.cover?.width}
                    height={tool.images.cover?.height}
                    className="h-full w-full object-cover"
                  />
                  {tool.images.imageCount > 1 && (
                    <span className="absolute right-1.5 bottom-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white">
                      {tool.images.imageCount} photos
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium tracking-tight">{tool.name}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]}
                        {tool.images.imageCount > 0
                          ? ` · ${tool.images.imageCount} ${tool.images.imageCount === 1 ? "photo" : "photos"}`
                          : " · No photos"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${STATUS_STYLES[tool.status]}`}
                    >
                      {STATUS_LABELS[tool.status]}
                    </span>
                  </div>

                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{tool.description}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    {confirmingId === tool._id ? (
                      <>
                        <span className="text-ink-muted">Remove this listing?</span>
                        <button
                          type="button"
                          onClick={() => void handleRemove(tool)}
                          className="font-medium text-red-600 underline underline-offset-4"
                        >
                          Yes, remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className="text-ink-muted underline underline-offset-4 hover:text-ink"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setActionError(null);
                            setJustCreated(false);
                            setForm({ kind: "edit", tool });
                          }}
                          className="underline underline-offset-4 hover:text-ink"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionError(null);
                            setConfirmingId(tool._id);
                          }}
                          className="text-ink-muted underline underline-offset-4 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden="true" className="mt-8 grid gap-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-xl border border-line bg-surface-raised"
        />
      ))}
    </div>
  );
}
