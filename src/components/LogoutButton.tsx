"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Modal, Button } from "@/components/ui";

export function LogoutButton() {
  const { signOut, user, isLoading } = useAuth();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleLogout = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      // Return to the login page once the session is fully cleared
      router.push("/login");
      router.refresh();
    } finally {
      setIsSigningOut(false);
      setConfirmOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-edge bg-panel px-3 py-1.5">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        <span className="text-sm text-stone-200">Loading...</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-edge bg-panel px-3 py-1.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gold"
            aria-hidden="true"
          >
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-stone-200">{user?.email || "Admin"}</span>
            <span className="text-xs text-gold capitalize">{user?.role || "admin"}</span>
          </div>
        </div>
        <button
          onClick={() => setConfirmOpen(true)}
          className="rounded-lg p-2 text-stone-400 hover:bg-panel-2 hover:text-rose-400"
          aria-label="Log out"
          title="Log out"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm log out">
        <div className="space-y-4 text-sm">
          <p className="text-stone-300">Are you sure you want to log out of the admin dashboard?</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={handleLogout} disabled={isSigningOut}>
              {isSigningOut ? "Logging out…" : "Log out"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}