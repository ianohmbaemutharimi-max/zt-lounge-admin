"use client";

import { Toaster } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";

export function ToastContainer() {
  const { toasts } = useToast();
  return <Toaster toasts={toasts} />;
}
