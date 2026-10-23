import { NextRequest, NextResponse } from "next/server";
import { withContentManagerAuth } from "@/lib/auth/server";
import { Repository } from "@/lib/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Slug-scoped package (service_charge) management.
 *
 * GET  /api/admin/services/[slug]/charges   list packages for the service
 * POST /api/admin/services/[slug]/charges   create a package
 *
 * The service is resolved SERVER-SIDE from the URL slug. A client-supplied
 * service_id is never trusted. Booking pricing remains server-authoritative:
 * these rows are only read by create_booking()/admin_booking(), which
 * validate ownership + active status and snapshot the price themselves.
 */

const VALID_STATUSES = ["active", "inactive"];

/**
 * Page ownership gate for the canonical Services hierarchy:
 *   website_pages.id -> services.page_id -> service_charges.service_id
 * The service->charge hop was already enforced; this adds the missing
 * service->page hop so possessing another page's service slug is not enough
 * to read or write its charges. Fail-closed: a missing or mismatched page_id
 * yields 404, the same contract used by the existing ownership guards.
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

async function resolveService(repo: Repository, slug: string) {
    const res = await repo.findAll("services", {
        filters: { slug },
        limit: 1,
    });
    return res.data[0] ?? null;
}

export const GET = withContentManagerAuth(
    async (req, ctx, auth) => {
        const { slug } = await ctx.params;
        if (!slug) return NextResponse.json({ error: "Service slug is required" }, { status: 400 });

        const repo = new Repository(auth.supabase as any);
        const service = await resolveService(repo, slug);
        if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

        // Charges may only be read while operating inside the owning page.
        const scopeError = pageScopeError(req, service);
        if (scopeError) {
            return NextResponse.json({ error: scopeError.error }, { status: scopeError.status });
        }

        const charges = await repo.findAll("service_charges", {
            filters: { service_id: service.id },
            orderBy: { column: "sort_order", ascending: true },
            limit: 100,
        });
        return NextResponse.json({ data: charges.data }, { status: 200 });
    }
);

export const POST = withContentManagerAuth(
    async (req, ctx, auth) => {
        const { slug } = await ctx.params;
        let body: any;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        // Validation — server-side, independent of any client form.
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (name.length < 2) {
            return NextResponse.json({ error: "Package name is required" }, { status: 400 });
        }
        const price = Number(body.price);
        if (!Number.isFinite(price) || price < 0 || price > 99999999.99) {
            return NextResponse.json({ error: "Price must be a number between 0 and 99999999.99" }, { status: 400 });
        }
        const status = body.status ?? "active";
        if (!VALID_STATUSES.includes(status)) {
            return NextResponse.json({ error: "Status must be active or inactive" }, { status: 400 });
        }
        const sortOrder = Number(body.sort_order ?? 0);
        if (!Number.isInteger(sortOrder) || sortOrder < 0) {
            return NextResponse.json({ error: "Display order must be a whole number of 0 or more" }, { status: 400 });
        }

        const repo = new Repository(auth.supabase as any);
        const service = await resolveService(repo, slug);
        if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

        // A package may only be created on a service owned by the selected page.
        const scopeError = pageScopeError(req, service);
        if (scopeError) {
            return NextResponse.json({ error: scopeError.error }, { status: scopeError.status });
        }

        try {
            const created = await repo.create(
                "service_charges",
                {
                    service_id: service.id, // derived from slug — never from the client
                    name,
                    description: typeof body.description === "string" ? body.description.trim() || null : null,
                    price: price.toFixed(2),
                    unit: typeof body.unit === "string" ? body.unit.trim() || null : null,
                    status,
                    sort_order: sortOrder,
                    updated_by: auth?.user?.id ?? null,
                },
                ["service_id"] // server-derived column, explicitly trusted here only
            );
            return NextResponse.json(created, { status: 201 });
        } catch (e: any) {
            if (/duplicate key/i.test(e?.message ?? "")) {
                return NextResponse.json(
                    { error: `A package named "${name}" already exists for this service` },
                    { status: 409 }
                );
            }
            throw e;
        }
    }
);
