import { Suspense } from "react";
import { MessagesView } from "@/features/messages/messages-view";

export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesView />
    </Suspense>
  );
}
