import { NextRequest, NextResponse } from "next/server";
import { withContentManagerAuth } from "@/lib/auth/server";
import { Repository } from "@/lib/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * PATCH  /api/admin/services/[slug]/charges/[id]   update a package
 * DELETE /api/admin/services/[slug]/charges/[id]   delete a package
 *
 * Ownership is verified SERVER-SIDE: the charge must belong to the service
 * resolved from the URL slug before any mutation. Deleting a package that
 * historical bookings reference is safe — bookings.price keeps its snapshot
 * and bookings.service_charge_id is ON DELETE SET NULL.
 */

const VALID_STATUSES = ["active", "inactive"];

/**
 * Page ownership gate — the service->page hop of the canonical hierarchy
 *   website_pages.id -> services.page_id -> service_charges.service_id
 * The service->charge hop is enforced by resolveServiceAndCharge; this
 * enforces that the parent service belongs to the page the caller is working
 * in, so another page's service slug exposes neither its charges nor a
 * mutation path to them. Fail-closed: absent or foreign page_id is rejected.
 */
function pageScopeError(req: NextRequest, service: any): { error: string; status: number } | null {
    const pageId = req.nextUrl.searchParams.get("page_id");
    if (!pageId) {
        return { error: "A website page must be selected to manage service packages", status: 400 };
    }
    // services has NO camelCase field map (contract/mapping.ts), so page_id
    // arrives in the DATABASE contract. Compare the snake_case column.
    if (service.page_id !== pageId) {
        return { error: "Service not found", status: 404 };
    }
    return null;
}

async function resolveServiceAndCharge(
    repo: Repository,
    slug: string,
    chargeId: string
) {
    const svc = await repo.findAll("services", { filters: { slug }, limit: 1 });
    const service = svc.data[0] ?? null;
    if (!service) return { error: "Service not found", status: 404 as const };

    const charge = await repo.findById("service_charges", chargeId);
    if (!charge || charge.service_id !== service.id) {
        return { error: "Package not found for this service", status: 404 as const };
    }
    return { service, charge };
}

function extractId(url: string): string | null {
    // req.url includes the query string (.../charges/<id>?page_id=xyz), so
    // parse the pathname first — otherwise the id becomes "<uuid>?page_id=…"
    // and findById() 404s every PATCH/DELETE.
    let pathname = url;
    try {
        pathname = new URL(url).pathname;
    } catch {
        const q = url.indexOf("?");
        if (q >= 0) pathname = url.slice(0, q);
    }
    const parts = pathname.split("/").filter(Boolean);
    // .../services/<slug>/charges/<id>
    const id = parts[parts.length - 1];
    return id && id !== "charges" ? id : null;
}

function buildPatch(body: any): { patch?: Record<string, any>; error?: string } {
    const patch: Record<string, any> = {};
    if (body.name !== undefined) {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (name.length < 2) return { error: "Package name is required" };
        patch.name = name;
    }
    if (body.description !== undefined) {
        patch.description =
            typeof body.description === "string" ? body.description.trim() || null : null;
    }
    if (body.price !== undefined) {
        const price = Number(body.price);
        if (!Number.isFinite(price) || price < 0 || price > 99999999.99) {
            return { error: "Price must be a number between 0 and 99999999.99" };
        }
        patch.price = price.toFixed(2);
    }
    if (body.unit !== undefined) {
        patch.unit = typeof body.unit === "string" ? body.unit.trim() || null : null;
    }
    if (body.status !== undefined) {
        if (!VALID_STATUSES.includes(body.status)) {
            return { error: "Status must be active or inactive" };
        }
        patch.status = body.status;
    }
    if (body.sort_order !== undefined) {
        const sortOrder = Number(body.sort_order);
        if (!Number.isInteger(sortOrder) || sortOrder < 0) {
            return { error: "Display order must be a whole number of 0 or more" };
        }
        patch.sort_order = sortOrder;
    }
    return { patch };
}

export const PATCH = withContentManagerAuth(
    async (req, ctx, auth) => {
        const { slug } = await ctx.params;
        const id = extractId(req.url);
        if (!id) return NextResponse.json({ error: "Package ID is required" }, { status: 400 });

        let body: any;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const built = buildPatch(body);
        if (built.error || !built.patch) {
            return NextResponse.json({ error: built.error ?? "No valid fields to update" }, { status: 400 });
        }
        if (Object.keys(built.patch).length === 0) {
            return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
        }

        const repo = new Repository(auth.supabase as any);
        const resolved = await resolveServiceAndCharge(repo, slug, id);
        if (resolved.error) {
            return NextResponse.json({ error: resolved.error }, { status: resolved.status });
        }
        const scopeError = pageScopeError(req, resolved.service);
        if (scopeError) {
            return NextResponse.json({ error: scopeError.error }, { status: scopeError.status });
        }

        try {
            const updated = await repo.update("service_charges", id, built.patch);
            return NextResponse.json(updated, { status: 200 });
        } catch (e: any) {
            if (/duplicate key/i.test(e?.message ?? "")) {
                return NextResponse.json(
                    { error: `A package named "${built.patch.name}" already exists for this service` },
                    { status: 409 }
                );
            }
            throw e;
        }
    }
);

export const DELETE = withContentManagerAuth(
    async (_req, ctx, auth) => {
        const { slug } = await ctx.params;
        const id = extractId(_req.url);
        if (!id) return NextResponse.json({ error: "Package ID is required" }, { status: 400 });

        const repo = new Repository(auth.supabase as any);
        const resolved = await resolveServiceAndCharge(repo, slug, id);
        if (resolved.error) {
            return NextResponse.json({ error: resolved.error }, { status: resolved.status });
        }
        const scopeError = pageScopeError(_req, resolved.service);
        if (scopeError) {
            return NextResponse.json({ error: scopeError.error }, { status: scopeError.status });
        }

        // RLS + FK protect the delete; bookings keep their price snapshot.
        const { error } = await (auth.supabase as any)
            .from("service_charges")
            .delete()
            .eq("id", id);
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true }, { status: 200 });
    }
);
