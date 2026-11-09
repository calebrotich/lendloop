import type { Metadata } from "next";

import { IncomingRequests } from "@/components/incoming-requests";

export const metadata: Metadata = {
  title: "Incoming requests",
  description: "Neighbours asking for your tools. Approve or decline in a tap.",
};

export default function IncomingRequestsPage() {
  return <IncomingRequests />;
}
