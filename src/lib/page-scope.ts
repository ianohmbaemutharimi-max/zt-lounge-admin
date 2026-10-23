import { NextRequest } from "next/server";
import type { Repository } from "@/lib/repository";

/**
 * Resources whose rows are owned by a website page
 * (website_pages.id -> <resource>.page_id) and are administered page-first.
 * e.g. services.page_id -> service_charges.service_id, gallery.page_id,
 * and menu_items.page_id (the canonical menu venue/scope column).
 */
export const PAGE_SCOPED_RESOURCES = new Set(["services", "service-categories", "gallery", "menu-items", "promotions"]);

/**
 * Page-first ownership guard for a single record.
 *
 * Page-scoped content administration is page-first: the admin selects a website
 * page and every subsequent operation must stay inside it. Knowing a record's
 * UUID is therefore NEVER sufficient to read, edit or delete a record owned by
 * another page.
 *
 * The caller passes its selected page as ?page_id=, and it is REQUIRED: without
 * it there is no page context to verify, so the request is refused. When
 * present, the record's own page_id must equal it. The 400/404 split and the
 * deliberately indistinguishable "unknown" vs "cross-page" response follow the
 * notifications ownership convention already used in these admin routes.
 *
 * NOTE: both `services` and `gallery` intentionally have NO camelCase field map
 * (src/lib/contract/mapping.ts), so rows arrive in the DATABASE contract and the
 * ownership column is the snake_case `page_id` — never `pageId`.
 */
export async function assertPageOwnership(
  req: NextRequest,
  repo: Repository,
  table: string,
  recordId: string
): Promise<{ error: string; status: number } | null> {
  if (!PAGE_SCOPED_RESOURCES.has(table)) return null;

  const pageId = req.nextUrl.searchParams.get("page_id");
  if (!pageId) {
    return { error: `A website page must be selected to manage ${table}`, status: 400 };
  }
  const record = await repo.findById(table, recordId);
  // Unknown record and cross-page record are indistinguishable on purpose:
  // the response must not confirm that the id exists on another page.
  if (!record || record.page_id !== pageId) {
    return { error: "Record not found or access denied", status: 404 };
  }
  return null;
}

/**
 * Page-transition guard for a request BODY (PATCH).
 *
 * `assertPageOwnership` proves the RECORD belongs to the requested page. That is
 * not sufficient on its own: `page_id` is a writable field, so a request scoped
 * to page A could otherwise submit `body.page_id = B` and move an A-owned record
 * to B without page B ever being authorised (the "ownership transfer" gap).
 *
 * The rule enforced here mirrors the existing POST rule in
 * `src/app/api/admin/[resource]/route.ts` (`body.page_id !== scopePageId`):
 * when a page-scoped request supplies `page_id` in the body, it MUST equal the
 * page context the request is scoped to. Omitting `page_id` entirely is fine -
 * the record simply keeps its current owner.
 *
 * This REJECTS an unauthorised page change. It never rewrites `page_id`, never
 * substitutes the submitted destination, and never weakens the record-ownership
 * check. No-op for resources outside PAGE_SCOPED_RESOURCES.
 */
export function assertPageAssignment(
  req: NextRequest,
  table: string,
  body: Record<string, unknown> | null | undefined
): { error: string; status: number } | null {
  if (!PAGE_SCOPED_RESOURCES.has(table)) return null;

  const submitted = body?.page_id;
  if (submitted === undefined || submitted === null) return null; // ownership unchanged

  const scopePageId = req.nextUrl.searchParams.get("page_id");
  // No scope: the caller cannot be authorised for any page. assertPageOwnership
  // already returns 400 for this on the same request, so this is a safe backstop
  // for any future call site that reaches here without the ownership guard.
  if (!scopePageId) {
    return { error: `A website page must be selected to manage ${table}`, status: 400 };
  }
  if (submitted !== scopePageId) {
    return {
      error: `${table} page_id must match the selected website page`,
      status: 400,
    };
  }
  return null;
}