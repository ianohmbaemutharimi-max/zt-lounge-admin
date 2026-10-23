import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdminAuth } from '@/lib/auth/server';
import { Repository } from '@/lib/repository';
import { logCrudOperation } from '@/lib/audit/logger';
import { validateResource, notFoundError, isDedicatedRouteOnlyResource } from '@/lib/validation/admin';
import { isMembershipResource } from '@/lib/membership-handler';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ─── batch delete ─────────────────────────────────────────────────────────
// POST body: { ids: string[] }
// Requires super_admin (final two-role model).

export const DELETE = async (req: NextRequest, ctx: any) => {
  const authWrapper = withSuperAdminAuth;

  return authWrapper(async (_req, _ctx, auth) => {
    try {
      const url = new URL(req.url);
      const table = url.pathname.replace('/api/admin/', '').split('/')[0];

      if (!validateResource(table)) {
        return notFoundError('Resource not found');
      }

      if (isDedicatedRouteOnlyResource(table)) {
        return notFoundError('Resource not found');
      }

      const repo = new Repository(auth.supabase as any);

      const body = await req.json().catch(() => null);
      if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
        return NextResponse.json(
          { error: 'ids array is required' },
          { status: 400 },
        );
      }

      if (isMembershipResource(table)) {
        return NextResponse.json(
          { error: 'Memberships cannot be batch-deleted. Use POST /api/admin/customer-memberships/[id]/cancel per membership (record preserved).' },
          { status: 409 },
        );
      }

      const count = await repo.batchDelete(table, body.ids);

      if (table === 'promotions' || table === 'services') {
        for (const id of body.ids) {
          await logCrudOperation(
            auth.supabase,
            table,
            'DELETE',
            id,
            auth.profile.id,
            req,
          );
        }
      }

      return NextResponse.json({ deleted: count });
    } catch (error) {
      console.error(`[batch] DELETE error:`, error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  })(req, ctx);
};
