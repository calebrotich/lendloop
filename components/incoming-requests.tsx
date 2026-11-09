"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  RequestBoard,
  RequestBoardSkeleton,
  incomingToView,
  type RequestAction,
} from "@/components/requests/request-board";
import { appErrorMessage } from "@/lib/convex-error";

export function IncomingRequests() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const requests = useQuery(
    api.requests.listIncoming,
    isAuthenticated && me !== null && me !== undefined ? {} : "skip",
  );
  const approve = useMutation(api.requests.approve);
  const decline = useMutation(api.requests.decline);
  const markReturned = useMutation(api.requests.markReturned);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (id: Id<"loanRequests">, action: RequestAction) => {
    setBusy(id);
    setError(null);
    try {
      if (action === "approve") {
        await approve({ requestId: id });
        toast.success("Request approved", { description: "The borrower will be notified." });
      } else if (action === "decline") {
        await decline({ requestId: id });
        toast.success("Request declined");
      } else if (action === "return") {
        await markReturned({ requestId: id });
        toast.success("Marked returned", { description: "The loan is closed." });
      }
    } catch (caught) {
      setError(appErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || !isAuthenticated || me === undefined || me === null || requests === undefined) {
    return <RequestBoardSkeleton />;
  }

  return (
    <RequestBoard
      mode="incoming"
      requests={requests.map(incomingToView)}
      onAction={act}
      busyId={busy}
      error={error}
      isAdmin={me?.role === "admin"}
    />
  );
}
