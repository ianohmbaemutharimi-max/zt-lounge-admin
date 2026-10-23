import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4">
      <div className="w-full max-w-md text-center">
        <BrandLogo imgClassName="mx-auto mb-4 h-16 w-16 rounded ring-2 ring-rose-500/40" />
        <h1 className="text-3xl font-bold text-white">Access Denied</h1>
        <p className="mt-2 text-sm text-muted">
          You do not have permission to access this area.
        </p>
        <p className="mt-4 text-xs text-stone-400">
          Contact your administrator if you believe this is an error.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-xl border border-edge bg-panel px-6 py-2.5 text-sm font-medium text-stone-200 hover:bg-panel-2"
          >
            Back to Dashboard
          </Link>
          <Link
            href="/login"
            className="rounded-xl bg-gold px-6 py-2.5 text-sm font-semibold text-black hover:bg-gold/90"
          >
            Switch Account
          </Link>
        </div>
      </div>
    </div>
  );
}