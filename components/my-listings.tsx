"use client";

import type { FunctionReturnType } from "convex/server";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Check, ExternalLink, ImagePlus, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { CategoryArtwork } from "@/components/listing/category-art";
import { ImageManager } from "@/components/image-manager";
import { ToolForm, type ToolFormPayload } from "@/components/tool-form";
import { ToolImage } from "@/components/tool-image";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { SuccessBurst } from "@/components/ui/success-burst";
import { appErrorMessage } from "@/lib/convex-error";
import { formatMoney, formatRate } from "@/lib/format";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/options";

type MyTool = FunctionReturnType<typeof api.tools.listMine>[number];

type Flow =
  | { kind: "closed" }
  | { kind: "new" }
  | { kind: "edit"; tool: MyTool }
  | { kind: "photos"; tool: MyTool; created: boolean };

const STATUS_LABELS: Record<MyTool["status"], string> = {
  available: "Available",
  unavailable: "Paused",
};

const STATUS_STYLES: Record<MyTool["status"], string> = {
  available: "bg-[#eaf3ff] text-[#0b5fd9]",
  unavailable: "bg-page text-ink-muted",
};

export function MyListings() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const tools = useQuery(api.tools.listMine, isAuthenticated ? {} : "skip");
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);

  const [flow, setFlow] = useState<Flow>({ kind: "closed" });
  const [removing, setRemoving] = useState<MyTool | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const flowRef = useRef<HTMLDivElement>(null);

  function openFlow(next: Flow) {
    setActionError(null);
    setFlow(next);
    // Let the flow render before scrolling to it; this is the moment the user
    // needs to see that photos are the next step.
    window.setTimeout(() => {
      flowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function closeFlow() {
    setFlow({ kind: "closed" });
  }

  const submitNew = async (values: ToolFormPayload) => {
    setActionError(null);
    const toolId = await create({
      name: values.name,
      category: values.category,
      condition: values.condition,
      description: values.description,
      valueCents: values.valueCents,
      dailyRateCents: values.dailyRateCents,
    });

    const created: MyTool = {
      _id: toolId,
      name: values.name.trim(),
      category: values.category,
      condition: values.condition,
      description: values.description.trim(),
      status: "available",
      valueCents: values.valueCents,
      dailyRateCents: values.dailyRateCents,
      createdAt: Date.now(),
      images: { imageCount: 0, cover: null },
    };

    toast.success("Listing created", {
      description: "Now add a cover photo so neighbours can see it.",
    });
    openFlow({ kind: "photos", tool: created, created: true });
  };

  const submitEdit = async (tool: MyTool, values: ToolFormPayload) => {
    setActionError(null);
    await update({
      toolId: tool._id,
      name: values.name,
      category: values.category,
      condition: values.condition,
      description: values.description,
      status: values.status,
      valueCents: values.valueCents,
      dailyRateCents: values.dailyRateCents,
    });
    toast.success("Listing updated");
    closeFlow();
  };

  const handleRemove = async (tool: MyTool) => {
    setActionError(null);
    setRemovingBusy(true);
    try {
      await remove({ toolId: tool._id });
      if ((flow.kind === "edit" || flow.kind === "photos") && flow.tool._id === tool._id) {
        closeFlow();
      }
      setRemoving(null);
      toast.success("Listing removed");
    } catch (error) {
      setActionError(appErrorMessage(error));
      setRemoving(null);
    } finally {
      setRemovingBusy(false);
    }
  };

  if (authLoading || !isAuthenticated || tools === undefined) {
    return <ListSkeleton />;
  }

  return (
    <section aria-labelledby="my-listings-heading" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="my-listings-heading" className="text-[13px] font-medium text-ink-muted">
            {tools.length} {tools.length === 1 ? "listing" : "listings"} on your shelf
          </h2>
        </div>
        {flow.kind === "closed" && (
          <Button
            size="md"
            iconLeft={<Icon icon={Plus} size={16} />}
            onClick={() => openFlow({ kind: "new" })}
          >
            List a tool
          </Button>
        )}
      </div>

      {flow.kind !== "closed" && (
        <div ref={flowRef} className="mt-5 max-w-3xl">
          {flow.kind === "photos" && flow.created && <FlowSteps />}

          {flow.kind === "new" && (
            <>
              <FlowSteps upcoming />
              <div className="mt-4">
                <ToolForm
                  key="new-tool"
                  submitLabel="Create listing"
                  footerNote="Next: add photos. A clear cover is the first thing neighbours see on the shelf."
                  onSubmit={submitNew}
                  onCancel={closeFlow}
                />
              </div>
            </>
          )}

          {flow.kind === "edit" && (
            <div className="grid gap-4">
              <ToolForm
                key={`form-${flow.tool._id}`}
                initial={{
                  name: flow.tool.name,
                  category: flow.tool.category,
                  condition: flow.tool.condition,
                  description: flow.tool.description,
                  status: flow.tool.status === "available" ? "available" : "unavailable",
                  valueCents: flow.tool.valueCents,
                  dailyRateCents: flow.tool.dailyRateCents,
                }}
                submitLabel="Save changes"
                showAvailability
                onSubmit={(values) => submitEdit(flow.tool, values)}
                onCancel={closeFlow}
              />
              <ImageManager key={`photos-${flow.tool._id}`} toolId={flow.tool._id} />
            </div>
          )}

          {flow.kind === "photos" && (
            <div className="grid gap-4">
              <div className="rounded-[26px] border border-rule/80 bg-white p-5 shadow-soft sm:p-6">
                {flow.created && <SuccessBurst className="mb-3" />}
                <p className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.16em] text-brand uppercase">
                  <Icon icon={Check} size={12} />
                  {flow.created ? "Listing created" : "Photos"}
                </p>
                <h2 className="font-display mt-2 text-[30px] leading-[1.05] text-balance text-navy">
                  {flow.created ? "Now give it a face." : `Add photos to ${flow.tool.name}`}
                </h2>
                <p className="mt-2 max-w-lg text-[12.5px] leading-relaxed text-ink-muted">
                  {flow.created
                    ? "Your listing is already on the shelf. A cover photo is what neighbours see first — you can add up to six and change them whenever you like."
                    : "The first photo becomes the cover. Clear, well-lit photos make a listing feel like something worth borrowing."}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <ButtonLink
                    href={`/listings/${flow.tool._id}`}
                    target="_blank"
                    rel="noreferrer"
                    variant="outline"
                    size="sm"
                    iconRight={<Icon icon={Sparkles} size={14} />}
                  >
                    Preview public page
                  </ButtonLink>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFlow({ kind: "edit", tool: flow.tool })}
                  >
                    Edit details
                  </Button>
                  <button
                    type="button"
                    onClick={closeFlow}
                    className="text-[11.5px] font-medium text-ink-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-navy hover:decoration-rule"
                  >
                    {flow.created ? "Add photos later" : "Back to my listings"}
                  </button>
                </div>
              </div>

              <ImageManager key={`photos-${flow.tool._id}`} toolId={flow.tool._id} />

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-rule/70 bg-white/70 px-4 py-3">
                <p className="text-[11.5px] text-ink-muted">
                  Photos upload in the background. You can finish now and come back to them.
                </p>
                <Button size="md" onClick={closeFlow}>
                  Done — back to my listings
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {actionError !== null && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-[#f3c6bf] bg-[#fff4f2] px-3.5 py-2.5 text-[12.5px] text-[#a12c1c]"
        >
          {actionError}
        </p>
      )}

      {tools.length === 0 && flow.kind === "closed" ? (
        <div className="mt-6 rounded-[26px] border border-dashed border-rule bg-white/60 px-6 py-12 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-mist text-brand">
            <Icon icon={ImagePlus} size={22} />
          </span>
          <p className="font-display mt-4 text-[24px] leading-tight text-navy">
            Your shelf is empty
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-ink-muted">
            Add a tool you&apos;re happy to lend. You&apos;ll add photos right after — it only takes
            a minute.
          </p>
          <Button className="mt-5" onClick={() => openFlow({ kind: "new" })}>
            List your first tool
          </Button>
        </div>
      ) : tools.length > 0 ? (
        <ul className="mt-6 grid gap-3">
          {tools.map((tool) => (
            <li
              key={tool._id}
              className="rounded-[22px] border border-rule/80 bg-white p-4 shadow-soft"
            >
              <div className="flex flex-wrap items-start gap-4">
                <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-2xl border border-rule/60 bg-page">
                  {tool.images.cover !== null ? (
                    <ToolImage
                      src={tool.images.cover.url}
                      alt={`${tool.name} cover photo`}
                      width={tool.images.cover.width}
                      height={tool.images.cover.height}
                      sizes="128px"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <CategoryArtwork category={tool.category} compact showLabel={false} />
                  )}
                  {tool.images.imageCount > 1 && (
                    <span className="absolute right-1.5 bottom-1.5 rounded-full bg-navy/75 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                      {tool.images.imageCount} photos
                    </span>
                  )}
                  {tool.images.imageCount === 0 && (
                    <button
                      type="button"
                      onClick={() => openFlow({ kind: "photos", tool, created: false })}
                      className="absolute inset-x-0 bottom-0 bg-navy/70 py-1.5 text-center text-[10px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-brand"
                    >
                      Add photos
                    </button>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link
                        href={`/listings/${tool._id}`}
                        className="text-[14px] font-semibold tracking-[-0.01em] text-navy underline decoration-transparent underline-offset-4 transition-colors hover:text-brand hover:decoration-brand/40"
                      >
                        {tool.name}
                      </Link>
                      <p className="mt-0.5 text-[11.5px] text-ink-muted">
                        {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]}
                        {tool.images.imageCount > 0
                          ? ` · ${tool.images.imageCount} ${tool.images.imageCount === 1 ? "photo" : "photos"}`
                          : " · No photos yet"}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
                        <span className="font-semibold text-navy">
                          {formatRate(tool.dailyRateCents)}
                        </span>
                        {tool.valueCents > 0 && (
                          <span className="text-ink-muted">
                            · {formatMoney(tool.valueCents)} value
                          </span>
                        )}
                        {tool.dailyRateCents > 0 && tool.valueCents > 0 && (
                          <span className="rounded-full bg-mist/70 px-2 py-0.5 text-[10px] font-semibold text-brand">
                            {((tool.dailyRateCents / tool.valueCents) * 100).toFixed(1)}% of value
                          </span>
                        )}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${STATUS_STYLES[tool.status]}`}
                    >
                      {STATUS_LABELS[tool.status]}
                    </span>
                  </div>

                  <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ink-muted">
                    {tool.description}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px]">
                    <Link
                      href={`/listings/${tool._id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-ink-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-navy hover:decoration-rule"
                    >
                      <Icon icon={ExternalLink} size={12} />
                      View public page
                    </Link>
                    <button
                      type="button"
                      onClick={() => openFlow({ kind: "edit", tool })}
                      className="font-medium text-ink-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-navy hover:decoration-rule"
                    >
                      Edit details
                    </button>
                    <button
                      type="button"
                      onClick={() => openFlow({ kind: "photos", tool, created: false })}
                      className={`inline-flex items-center gap-1 font-medium underline decoration-transparent underline-offset-4 transition-colors hover:decoration-rule ${
                        tool.images.imageCount === 0
                          ? "text-brand"
                          : "text-ink-muted hover:text-navy"
                      }`}
                    >
                      <Icon icon={ImagePlus} size={12} />
                      {tool.images.imageCount === 0 ? "Add photos" : "Manage photos"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setRemoving(tool);
                      }}
                      className="text-ink-muted underline decoration-transparent underline-offset-4 transition-colors hover:text-[#a12c1c] hover:decoration-[#f3c6bf]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {removing !== null && (
        <AlertDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen && !removingBusy) setRemoving(null);
          }}
          title="Remove this listing?"
          description={`“${removing.name}” comes off the shelf for everyone. Its loan history stays, and you can list it again whenever you like.`}
          confirmLabel="Remove listing"
          cancelLabel="Keep listing"
          tone="danger"
          icon={Trash2}
          loading={removingBusy}
          onConfirm={() => void handleRemove(removing)}
        />
      )}
    </section>
  );
}

function FlowSteps({ upcoming = false }: { upcoming?: boolean }) {
  return (
    <ol className="flex items-center gap-2.5 text-[10.5px] font-semibold tracking-[0.02em]">
      <li className="inline-flex items-center gap-1.5 text-brand">
        <span
          className={`flex size-5 items-center justify-center rounded-full ${
            upcoming ? "bg-brand text-white" : "bg-mist text-brand"
          }`}
        >
          {upcoming ? "1" : <Icon icon={Check} size={11} />}
        </span>
        Details
      </li>
      <span aria-hidden="true" className="h-px w-6 bg-rule" />
      <li
        className={`inline-flex items-center gap-1.5 ${upcoming ? "text-ink-muted" : "text-brand"}`}
      >
        <span
          className={`flex size-5 items-center justify-center rounded-full ${
            upcoming ? "bg-page text-ink-muted" : "bg-brand text-white"
          }`}
        >
          2
        </span>
        Photos
      </li>
    </ol>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden="true" className="mt-8 grid gap-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex gap-4 rounded-[22px] border border-rule/70 bg-white p-4">
          <Skeleton className="h-24 w-32 rounded-2xl" />
          <div className="flex-1 space-y-2.5 py-1">
            <Skeleton className="h-4 w-1/3 rounded-full" />
            <Skeleton className="h-3 w-1/2 rounded-full" />
            <Skeleton className="h-3 w-2/3 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
