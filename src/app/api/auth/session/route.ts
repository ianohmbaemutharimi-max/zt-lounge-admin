import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getServerSession();

  if (!result.ok) {
    return NextResponse.json({ ok: false }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: result.session.user.id,
      email: result.session.user.email,
      role: result.session.user.role,
    },
    profile: result.session.profile,
  });
}
