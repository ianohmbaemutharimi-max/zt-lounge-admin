/**
 * PATCH /api/admin/google-reviews/[id]
 *
 * Update a single review's moderation state:
 * - approved: boolean
 * - is_featured: boolean
 *
 * Standard admin auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const PATCH = withAdminAuth(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const admin = getSupabaseAdmin();
  const { id } = await params;

  try {
    const body = await request.json();
    const { approved, is_featured } = body;

    // Validate at least one field is provided
    if (typeof approved !== 'boolean' && typeof is_featured !== 'boolean') {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Execute update based on which fields are provided
    let data, error;
    
    if (typeof approved === 'boolean' && typeof is_featured === 'boolean') {
      // Both fields - update together
      const result = await admin
        .from('testimonials')
        .update({ approved, is_featured })
        .eq('id', id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else if (typeof approved === 'boolean') {
      // Only approved
      const result = await admin
        .from('testimonials')
        .update({ approved })
        .eq('id', id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Only is_featured
      const result = await admin
        .from('testimonials')
        .update({ is_featured })
        .eq('id', id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error('[google-reviews] Update failed:', error);
      return NextResponse.json(
        { error: 'Failed to update review' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[google-reviews] PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
