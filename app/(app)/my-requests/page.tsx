import type { Metadata } from "next";

import { MyRequests } from "@/components/my-requests";

export const metadata: Metadata = {
  title: "My requests",
  description: "Everything you’ve asked to borrow, the booking total, and where it stands.",
};

export default function MyRequestsPage() {
  return <MyRequests />;
}
