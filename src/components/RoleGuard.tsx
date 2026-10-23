'use client';

import { useAuth } from "@/contexts/AuthContext";
import { ReactNode } from "react";

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles?: string[];
  fallback?: ReactNode;
}

export function RoleGuard({
  children,
  allowedRoles = ["admin", "super_admin"],
  fallback = null,
}: RoleGuardProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="p-4 text-center text-muted">Loading...</div>;
  }

  if (!user) {
    return fallback || null;
  }

  const userRole = user.role || "customer";

  if (!allowedRoles.includes(userRole)) {
    return (
      fallback || (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/40 rounded-xl">
          <p className="text-sm text-yellow-400">
            You don&#39;t have permission to view this content.
          </p>
        </div>
      )
    );
  }

  return <>{children}</>;
}