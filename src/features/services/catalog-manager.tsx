"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Star, Power, X, ChevronDown, Info, Sparkles, DollarSign, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, Button, Badge, Spinner, Modal, Field, Input, Select, Textarea, Card, EmptyState, Toggle } from "@/components/ui";
import { DataTable, type Column } from "@/components/data-table";
import { cn, formatKES } from "@/lib/utils";
import { MediaPickerModal } from "@/features/media/media-picker-modal";
import { ImageChangeDialog } from "@/features/media/image-change-dialog";
import { ServicePackagesModal, chargeFetcher, withPageScope } from "@/features/services/service-packages-modal";
import { splitHref, composeHref, PUBLIC_PAGE_KEYS } from "@/lib/constants/public-pages";
import type { SelectableMediaAsset } from "@/types/media";
import type { ImageCategory } from "@/lib/storage/paths";

/** Maps admin resource names to canonical upload categories (validated by /api/admin/upload). */
const RESOURCE_UPLOAD_CATEGORY: Record<string, ImageCategory> = {
  "menu-items": "menu",
  services: "services",
};

const itemSchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().optional(),
  // Display order within the page/category. Written to DB column `display_order`
  // (services is not in FIELD_MAPS, so snake_case passes straight through).
  display_order: z.coerce.number().min(0, "Display order must be 0 or more").default(0),
  category_id: z.string().min(1, "Select a category"),
  image_url: z.string().url("Must be a valid URL").or(z.literal("")),
  media_id: z.string().uuid().nullable().optional(),
  href: z.string().url("Must be a valid URL").or(z.literal("")).nullable().optional(),
  page_id: z.string().uuid().optional(),
  is_active: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  // Services only. Set from the active surface on creation so the write
  // contract (zod + WRITABLE_FIELDS) stays aligned with services.card_type.
  // Optional so menu-items (no such columns) unaffected.
  card_type: z.enum(["navigation", "information", "package"]).optional(),
  // Public display type. Live contract (ServicesRepository.js v2.1.0):
  // 'service' | 'experience' | 'feature' | 'packages' (getPackages, plural!)
  // plus legacy 'informational' (32 live rows) — kept in the enum so editing
  // an old service never silently rewrites its type. Mirrors migration
  // 20261020_add_type_to_services.sql (services_type_check).
  type: z.enum(["service", "experience", "feature", "packages", "informational"]).optional(),
});

type ItemForm = z.infer<typeof itemSchema>;

const categorySchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().optional(),
  sort_order: z.coerce.number().default(0),
  type: z.enum(["service", "membership", "package"]).optional(),
});

const infoCardSchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be 0 or more").optional(),
});
type CategoryForm = z.infer<typeof categorySchema>;

/** Helper to check if a service has a destination (href set) */
const hasDestination = (s: any) => typeof s.href === "string" && s.href.trim() !== "";

export type CatalogConfig = {
  title: string;
  subtitle: string;
  itemResource: string;
  categoryResource: string;
  itemLabel: string;
  activeField: "is_active" | "isAvailable";
  showDuration?: boolean;
  showFeatured?: boolean;
};

// Surface types for the specialized Services UI
type ServiceSurface = "all" | "navigation" | "information" | "packages";

// ---------------------------------------------------------------------------
// Service card typing (src/db/schema.ts: services.service_kind, services.card_type).
// The admin surfaces (All / Navigation / Information / Packages) each correspond
// to a card_type, so a service created from a surface is persisted with the type
// matching that surface — keeping the zod form + the WRITABLE_FIELDS allowlist in
// contract with the canonical DB columns (services has no FIELD_MAP, so
// snake_case passes straight through). This only tags the NEW service; editing
// preserves the stored type so an existing service is never silently retagged.
//   navigation   -> global discovery nav card  (service has an href destination)
//   information   -> page-scoped info card    (no destination)
//   package       -> page-scoped package pricing (service_charges attached)
// card_type is the presentation/destination kind the surfaces are built on.
// ---------------------------------------------------------------------------
type ServiceCardType = "navigation" | "information" | "package";

const SURFACE_DEFAULT_CARD_TYPE: Record<ServiceSurface, ServiceCardType> = {
  all: "information",
  navigation: "navigation",
  information: "information",
  packages: "package",
};

// Surface-scoped label for the Add action so the button reads "Add Package",
// "Add Navigation Card", "Add Info Card" instead of the generic "New Service".
const SURFACE_ADD_LABEL: Record<ServiceSurface, string> = {
  all: "New Service",
  navigation: "Add Navigation Card",
  information: "Add Info Card",
  packages: "Add Package",
};

export function CatalogManager(cfg: CatalogConfig) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"items" | "categories">("items");
  const [serviceSurface, setServiceSurface] = useState<ServiceSurface>("all");
  const [editing, setEditing] = useState<any | null>(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [catEditing, setCatEditing] = useState<any | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<SelectableMediaAsset | null>(null);
  const [imageChangeDialogOpen, setImageChangeDialogOpen] = useState(false);
  const [imageEditingItem, setImageEditingItem] = useState<any | null>(null);
  // Nav-type editor state (services only). The destination (services.href) is
  // the single discriminator between a Navigation Card and an Information Card
  // on the public site: non-empty href -> navigation grid, empty -> info grid.
  const [navDest, setNavDest] = useState<{ pageKey: string; fragment: string; customHref: string | null }>({ pageKey: "", fragment: "", customHref: null });
  
  // Page scope
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  const [pageOpen, setPageOpen] = useState(false);
  
  // Destination editing
  const [destOpen, setDestOpen] = useState<any | null>(null);
  const [destEditing, setDestEditing] = useState<any | null>(null);
  

  // Information Card editor state
  const [infoCardOpen, setInfoCardOpen] = useState(false);
  const [infoCardEditing, setInfoCardEditing] = useState<any | null>(null);
  const infoCardForm = useForm<z.infer<typeof infoCardSchema>>({
    resolver: zodResolver(infoCardSchema),
    defaultValues: { name: "", description: "", price: undefined },
  });
  const infoCardSave = useMutation({
    mutationFn: (v: { id: string; name: string; description: string; price: number | undefined }) =>
      api.update(cfg.itemResource, v.id, {
        name: v.name,
        description: v.description,
        ...(v.price !== undefined ? { price: String(v.price) } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [cfg.itemResource] });
      toast.success("Information card updated");
      setInfoCardOpen(false);
      setInfoCardEditing(null);
    },
  });
  // Package management
  const [packagesModalOpen, setPackagesModalOpen] = useState(false);
  const [packagesModalService, setPackagesModalService] = useState<any | null>(null);
  
  // Page-level toggles
  const [serviceCardsEnabled, setServiceCardsEnabled] = useState(true);
  const [servicePackagesEnabled, setServicePackagesEnabled] = useState(true);
  
  // Derived queries
  // The generic admin route only honours `filter:<field>` params - a plain
  // ?page_id= is ignored - so this query used to return just the first 10
  // services (default limit) and relied on the client-side page filter below.
  // Pages beyond the first few (e.g. Events, Grooming) rendered empty because
  // none of their services were within that window. Scope server-side via the
  // validated page_id filter and raise the cap to the supported maximum.
  const pageScopeQuery = useQuery({
    queryKey: ["website-pages"],
    queryFn: () => api.list("website-pages"),
  });

  // DEFAULT PAGE SCOPE: automatically select the homepage the first time the
  // website-pages list resolves and nothing is selected yet, so the admin
  // lands on a real page instead of the "Select page…" prompt.
  //
  // This effect MUST stay declared AFTER `pageScopeQuery` (see the temporal
  // dead zone): referencing a `const` before its initialisation throws
  // "Cannot access 'pageScopeQuery' before initialization".
  useEffect(() => {
    if (selectedPageId) return;
    const pages = pageScopeQuery.data ?? [];
    if (pages.length === 0) return;
    const homePage = pages.find((p: any) => p.page_key === "home");
    // Fall back to the first available page only when no "home" row exists
    // (e.g. a database that has not published the homepage yet).
    setSelectedPageId((homePage ?? pages[0]).id);
  }, [selectedPageId, pageScopeQuery.data]);

  // DISCOVERY PAGES (Home + Contact): the public site renders the GLOBAL
  // nav-card set on these pages - every ACTIVE service with a destination
  // (href), regardless of which page owns it (content-loader.js
  // populateServiceCardsEnabled: isServiceNavGrid -> ServicesRepository
  // .getAll(), where a populated href is the discovery discriminator).
  // Home owns zero services itself, so a page-scoped query returns []
  // and the admin would show "No services" while the public page displays
  // its discovery cards. Discovery pages therefore fetch the full catalog
  // and surface the same global nav set the website renders.
  const selectedPageKey = (pageScopeQuery.data ?? []).find(
    (p: any) => p.id === selectedPageId
  )?.page_key;
  const isDiscoveryPage =
    selectedPageKey === "home" || selectedPageKey === "contact";

  const items = useQuery({
    queryKey: [cfg.itemResource, selectedPageId, isDiscoveryPage],
    queryFn: () =>
      api.list(cfg.itemResource, {
        ...(selectedPageId && !isDiscoveryPage
          ? { filter: { page_id: selectedPageId } }
          : {}),
        limit: 100,
      }),
  });
  
  const cats = useQuery({ queryKey: [cfg.categoryResource], queryFn: () => api.list(cfg.categoryResource) });

  // Page-scoped items for the selected page (discovery pages show the
  // global nav-card set instead, matching the public website discovery contract).
  const pageScopedItems = useMemo(() => {
    if (!items.data) return [];
    const id = selectedPageId;
    if (!id) return [];
    // Discovery pages (Home/Contact) present the GLOBAL nav-card set -
    // the public contract renders every active service with a destination,
    // no matter which page owns it. Mirror that here so the admin sees
    // exactly the cards the public page displays. Regular pages keep the
    // strict owning-page filter.
    if (isDiscoveryPage) {
      return items.data.filter((s: any) => s.is_active && hasDestination(s));
    }
    return items.data.filter((s: any) => s.page_id === id);
  }, [items.data, selectedPageId, isDiscoveryPage]);
  
  // Navigation items (global scope, from ALL pages)
  const navScopedItems = useMemo(() => {
    if (!items.data) return [];
    return items.data.filter((s: any) => s.is_active && hasDestination(s));
  }, [items.data]);

  // Page-scoped navigation items for the "All" view: services with
  // destinations that belong to the currently selected page only.
  // Unlike `navScopedItems` (global scope, used by the standalone
  // "Navigation" view), this set stays strictly within the selected page.
  const pageNavScopedItems = useMemo(() => {
    if (!pageScopedItems.length) return [];
    return pageScopedItems.filter((s: any) => s.is_active && hasDestination(s));
  }, [pageScopedItems]);
  
  // Informational items (no destination)
  const infoScopedItems = useMemo(() => {
    if (!pageScopedItems.length) return [];
    return pageScopedItems.filter((s: any) => !hasDestination(s));
  }, [pageScopedItems]);
  
    // Surface-scoped Add label + default card_type for the active Services surface.
  // For non-services (e.g. menu-items) this falls back to the generic "New <label>".
  const surfaceAddLabel = useMemo(
    () =>
      cfg.itemResource === "services"
        ? SURFACE_ADD_LABEL[serviceSurface]
        : `New ${cfg.itemLabel}`,
    [cfg.itemResource, cfg.itemLabel, serviceSurface]
    );

  // Price/Duration are relevant only for bookable Package cards. Navigation and
  // Information cards are non-bookable, so the shared item form drops those fields.
  // On create the type comes from the active surface; on edit it comes from the
  // stored card_type — existing types are never retagged.
    const isPackageCard =
    cfg.itemResource === "services" &&
    (editing ? editing.card_type === "package" : serviceSurface === "packages");
  // Price is a bookable-service field: shown only for Package cards among
  // services, but always for menu-items (priced items with no card_type).
  const showPrice = cfg.itemResource !== "services" || isPackageCard;

  // service_charges is DEDICATED_ROUTE_ONLY: the generic /api/admin/[resource]
  // route refuses it by design, so api.list("service_charges") always 404'd
  // here and the Packages surface could never render a card (it sat forever on
  // "No packages configured"). Fetch each page-scoped service's charges through
  // the dedicated, page-scoped route instead - the same contract the packages
  // modal uses.
  const packages = useQuery({
    queryKey: ["service-charges", selectedPageId, cfg.itemResource, pageScopedItems.map((s: any) => s.id)],
    queryFn: async () => {
      const perService = await Promise.all(
        pageScopedItems.map((s: any) =>
          // Scope each charge fetch by the service's OWN page_id: on
          // discovery pages (Home/Contact) the nav cards belong to other
          // pages, and the fail-closed route rejects a foreign page_id.
          // For regular pages s.page_id === selectedPageId, so behavior
          // there is unchanged.
          chargeFetcher<{ data: any[] }>(
            withPageScope(`/api/admin/services/${s.slug}/charges`, s.page_id ?? selectedPageId ?? undefined)
          )
            .then((res) => res.data ?? [])
            .catch(() => []) // one failed service must not blank the whole surface
        )
      );
      return perService.flat();
    },
    enabled: !!selectedPageId && pageScopedItems.length > 0,
  });
  
  // Filtered page-scoped items for packages view
  const packagesForPage = useMemo(() => {
    if (!pageScopedItems.length) return [];
    if (!packages.data) return [];
    return pageScopedItems.filter((s: any) => {
      const charges = (packages.data ?? []).filter((c: any) => c.service_id === s.id);
      return charges.length > 0;
    });
  }, [pageScopedItems, packages.data]);

  // Destination options for the nav-type editor: only canonical served pages,
  // resolved to their human titles from website_pages when available.
  const publicPageOptions = useMemo(
    () =>
      PUBLIC_PAGE_KEYS.map((key) => {
        const p = (pageScopeQuery.data ?? []).find((x: any) => x.page_key === key);
        return { key, title: (p?.title as string) ?? key };
      }),
    [pageScopeQuery.data]
  );
  
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [cfg.itemResource, selectedPageId] });
    qc.invalidateQueries({ queryKey: [cfg.categoryResource] });
  };

  const itemForm = useForm<ItemForm>({ resolver: zodResolver(itemSchema) as any });
  const catForm = useForm<CategoryForm>({ resolver: zodResolver(categorySchema) as any });

  const saveItem = useMutation({
    mutationFn: (v: ItemForm) => {
      const payload: any = { ...v, image_url: v.image_url || null };
      // Price & Duration are bookable (Package) fields. Navigation/Information
      // cards hide those inputs (showPrice=false), so never stringify an unset
      // price into the literal "undefined" and never send either field for them:
      // omitting the keys applies the DB default on create and preserves stored
      // values on edit (Repository.update writes present keys only).
      if (showPrice && typeof v.price === "number" && !Number.isNaN(v.price)) {
        payload.price = String(v.price);
      } else {
        delete payload.price;
      }
      if (!cfg.showDuration || !showPrice) delete payload.duration_minutes;
      return editing ? api.update(cfg.itemResource, editing.id, payload) : api.create(cfg.itemResource, payload);
    },
    onSuccess: () => { invalidate(); setItemOpen(false); setEditing(null); },
  });

  const saveCat = useMutation({
    mutationFn: (v: CategoryForm) =>
      catEditing ? api.update(cfg.categoryResource, catEditing.id, v) : api.create(cfg.categoryResource, v),
    onSuccess: () => { invalidate(); setCatOpen(false); setCatEditing(null); },
  });

  const toggleActive = useMutation({
    mutationFn: (row: any) => api.update(cfg.itemResource, row.id, { [cfg.activeField]: !row[cfg.activeField] }),
    onSuccess: invalidate,
  });

  const toggleFeatured = useMutation({
    mutationFn: (row: any) => api.update(cfg.itemResource, row.id, { is_featured: !row.is_featured }),
    onSuccess: invalidate,
  });

  const saveNavDestination = useMutation({
    mutationFn: (row: any) => api.update(cfg.itemResource, row.id, { href: row.href || null }),
    onSuccess: invalidate,
  });

  const toggleServiceCards = useMutation({
    mutationFn: () => api.update("settings", "service_cards_enabled", { enabled: !serviceCardsEnabled }),
    onSuccess: () => setServiceCardsEnabled(!serviceCardsEnabled),
  });

  const toggleServicePackages = useMutation({
    mutationFn: () => api.update("settings", "service_packages_enabled", { enabled: !servicePackagesEnabled }),
    onSuccess: () => setServicePackagesEnabled(!servicePackagesEnabled),
  });

  const removeItem = useMutation({
    mutationFn: (id: string) => api.remove(cfg.itemResource, id),
    onSuccess: invalidate,
  });

  const removeCat = useMutation({
    mutationFn: (id: string) => api.remove(cfg.categoryResource, id),
    onSuccess: invalidate,
  });

  function openItem(row?: any) {
    setEditing(row ?? null);
    // Hydrate the nav-type editor from the stored destination (services only).
    // splitHref keeps a legacy/custom URL verbatim so it round-trips without
    // data loss; a regular page scopes the select to a canonical served page.
    if (cfg.itemResource === "services" && row) {
      setNavDest(splitHref(row.href));
    } else {
      setNavDest({ pageKey: "", fragment: "", customHref: null });
    }
                    const isServices = cfg.itemResource === "services";
    // When creating a service, tag it with the card_type that matches the active
    // surface so the persisted card_type matches what the user intended. Editing an
    // existing service preserves its stored card_type (never retagged).
    const surfaceCardType = isServices ? SURFACE_DEFAULT_CARD_TYPE[serviceSurface] : undefined;
    itemForm.reset(row
            ? { name: row.name, description: row.description ?? "", category_id: String(row.category_id ?? ""), image_url: row.image_url ?? "", media_id: row.media_id ?? null, display_order: row.display_order ?? 0, ...(isServices ? { card_type: row.card_type ?? undefined, type: row.type ?? "service" } : {}) }
      : { name: "", description: "", category_id: "", image_url: "", media_id: null, display_order: 0, ...(isServices ? { card_type: surfaceCardType, type: "service" } : {}) });
    setSelectedMedia(null);
    setItemOpen(true);
  }
  function openCat(row?: any) {
    setCatEditing(row ?? null);
    catForm.reset(row ? { name: row.name, description: row.description ?? "", sort_order: row.sort_order } : { name: "", description: "", sort_order: 0 });
    setCatOpen(true);
  }

  function openInfoCard(row?: any) {
    setInfoCardEditing(row ?? null);
    setInfoCardOpen(true);
    if (row) {
      infoCardForm.reset({
        name: row.name,
        description: row.description ?? "",
        price: row.price,
      });
    } else {
      infoCardForm.reset({ name: "", description: "", price: undefined });
    }
  }

  const catName = (id: string) => (cats.data ?? []).find((c: any) => c.id === id)?.name ?? "—";

  const columns: Column<any>[] = [
    { header: cfg.itemLabel, cell: (r) => (
      <div className="flex items-center gap-3">
        {r.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.resolved_image_url || r.image_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/10 text-xs font-semibold text-gold">{r.name[0]}</span>
        )}
        <div>
          <p className="font-medium">{r.name}</p>
          {r.description && <p className="max-w-52 truncate text-xs text-muted">{r.description}</p>}
        </div>
      </div>
    )},
    { header: "Category", cell: (r) => <span className="text-stone-300">{catName(r.category_id)}</span> },
    { header: "Status", cell: (r) => <Badge status={r[cfg.activeField] ? "active" : "inactive"}>{r[cfg.activeField] ? (cfg.activeField === "isAvailable" ? "available" : "active") : (cfg.activeField === "isAvailable" ? "unavailable" : "inactive")}</Badge> },
    { header: "Actions", cell: (r) => (
      <div className="flex gap-1">
        {cfg.showFeatured && (
          <button title={r.is_featured ? "Unfeature" : "Feature"} onClick={() => toggleFeatured.mutate(r)} className={cn("rounded-lg p-1.5 hover:bg-panel-2", r.is_featured ? "text-gold" : "text-stone-500")}>
            <Star className="h-4 w-4" fill={r.is_featured ? "currentColor" : "none"} />
          </button>
        )}
        <button title="Edit image" onClick={() => { setImageEditingItem(r); setImageChangeDialogOpen(true); }} className="rounded-lg p-1.5 text-gold hover:bg-gold/10"><Pencil className="h-4 w-4" /></button>
        <button title={r[cfg.activeField] ? "Deactivate" : "Activate"} onClick={() => toggleActive.mutate(r)} className={cn("rounded-lg p-1.5 hover:bg-panel-2", r[cfg.activeField] ? "text-emerald-400" : "text-stone-500")}>
          <Power className="h-4 w-4" />
        </button>
        <button title="Edit" onClick={() => openItem(r)} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2 hover:text-white"><Pencil className="h-4 w-4" /></button>
        <button title="Delete" onClick={() => { if (confirm(`Delete "${r.name}"?`)) removeItem.mutate(r.id); }} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
      </div>
    )},
  ];

  if (pageScopeQuery.isLoading || cats.isLoading) return <Spinner label={`Loading ${cfg.title.toLowerCase()}…`} />;

  return (
    <div>
      <PageHeader
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* Services: Page selector + surface tabs */}
            {cfg.itemResource === "services" && (
              <>
                <div className="relative flex rounded-xl border border-edge bg-panel p-1">
                  <button 
                    onClick={() => setPageOpen(!pageOpen)} 
                    className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-gold"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span className="max-w-xs truncate">
                      {selectedPageId ? (pageScopeQuery.data?.find((p: any) => p.id === selectedPageId)?.title || "Page") : "Select page…"}
                    </span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {pageOpen && (
                    <div className="absolute top-12 left-0 z-10 rounded-lg border border-edge bg-panel-2 shadow-xl">
                      {(pageScopeQuery.data ?? []).map((page: any) => (
                        <button
                          key={page.id}
                          onClick={() => { setSelectedPageId(page.id); setPageOpen(false); }}
                          className="block w-full px-4 py-2 text-left text-sm hover:bg-gold/10 whitespace-nowrap"
                        >
                          {page.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedPageId && (
                  <div className="flex rounded-xl border border-edge bg-panel p-1">
                    <button onClick={() => setServiceSurface("all")} className={cn("rounded-lg px-3 py-1.5 text-xs", serviceSurface === "all" ? "bg-gold/15 text-gold" : "text-muted hover:text-white")}>All</button>
                    <button onClick={() => setServiceSurface("navigation")} className={cn("rounded-lg px-3 py-1.5 text-xs", serviceSurface === "navigation" ? "bg-gold/15 text-gold" : "text-muted hover:text-white")}>Navigation</button>
                    <button onClick={() => setServiceSurface("information")} className={cn("rounded-lg px-3 py-1.5 text-xs", serviceSurface === "information" ? "bg-gold/15 text-gold" : "text-muted hover:text-white")}>Info</button>
                    <button onClick={() => setServiceSurface("packages")} className={cn("rounded-lg px-3 py-1.5 text-xs", serviceSurface === "packages" ? "bg-gold/15 text-gold" : "text-muted hover:text-white")}>Packages</button>
                  </div>
                )}
              </>
            )}

            {/* Generic: Items/Categories tabs (for menu-items) */}
            {cfg.itemResource !== "services" && (
              <div className="flex rounded-xl border border-edge bg-panel p-1">
                <button onClick={() => setTab("items")} className={cn("rounded-lg px-3 py-1.5 text-sm", tab === "items" ? "bg-gold/15 text-gold" : "text-muted hover:text-white")}>{cfg.itemLabel}s</button>
                <button onClick={() => setTab("categories")} className={cn("rounded-lg px-3 py-1.5 text-sm", tab === "categories" ? "bg-gold/15 text-gold" : "text-muted hover:text-white")}>Categories</button>
              </div>
            )}

                        <Button onClick={() => openItem()}><Plus className="h-4 w-4" /> {surfaceAddLabel}</Button>
          </div>
        }
      />

      {/* Services specialized UI */}
      {cfg.itemResource === "services" && selectedPageId ? (
        <div className="space-y-6">
          {isDiscoveryPage && (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
              <strong className="font-semibold">Discovery page.</strong>{" "}
              {selectedPageKey === "home" ? "Home" : "Contact"} shows navigation
              cards discovered from every page — each card is owned by its
              source page. Inactive cards or cards without a destination are
              hidden here, exactly as on the public website.
            </div>
          )}
          {serviceSurface === "all" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className="text-lg font-semibold text-white">All Services for this Page</h3>
                <p className="text-sm text-muted">Showing all services owned by this page.</p>
              </div>
              {pageScopedItems.length === 0 ? (
                <EmptyState
                  title="No services on this page"
                                                      description="Create services for this page to display them on the website."
                  action={<Button onClick={() => openItem()}><Plus className="h-4 w-4" /> {surfaceAddLabel}</Button>}
                />
              ) : (
                <>
                  {/* Page-scoped Navigation section */}
                  {pageNavScopedItems.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-base font-semibold text-white">Navigation</h4>
                      <p className="text-sm text-muted">Services with destination links owned by this page.</p>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {pageNavScopedItems.map((s: any) => {
                          const serviceCharges = (packages.data ?? []).filter((c: any) => c.service_id === s.id);
                          return (
                            <Card key={s.id} className="p-4">
                              {s.image_url && (
                                <img src={s.resolved_image_url || s.image_url} alt={s.alt_text || s.name} className="mb-3 h-32 w-full rounded-lg object-cover" />
                              )}
                              <div className="flex items-start justify-between gap-3">
                                <h4 className="font-semibold text-white">{s.name}</h4>
                                {s.href && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-xs text-gold">
                                    <ArrowRight className="h-3 w-3" />
                                    Link
                                  </span>
                                )}
                              </div>
                              {s.description && <p className="mt-1 text-sm text-muted line-clamp-2">{s.description}</p>}
                              <p className="mt-2 text-sm text-gold">{formatKES(s.price)}</p>
                              {serviceCharges.length > 0 && (
                                <p className="mt-1 text-xs text-gold">{serviceCharges.length} package(s)</p>
                              )}
                              <div className="mt-3 flex gap-2">
                                <Button variant="outline" className="flex-1" onClick={() => openItem(s)}>
                                  <Pencil className="h-3 w-3" /> Edit
                                </Button>
                                <Button variant="outline" onClick={() => {
                                  setPackagesModalService(s);
                                  setPackagesModalOpen(true);
                                }}>
                                  <DollarSign className="h-3 w-3" /> Packages
                                </Button>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <DataTable
                    data={pageScopedItems}
                    columns={columns}
                    searchKeys={["name", "description"]}
                    searchPlaceholder="Search services…"
                    emptyTitle="No services"
                    emptyDescription="Create services for this page."
                  />
                </>
              )}
            </div>
          )}

          {serviceSurface === "navigation" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Navigation Services</h3>
              <p className="text-sm text-muted">Services with destinations that appear in global navigation.</p>
              {navScopedItems.length === 0 ? (
                <EmptyState
                  title="No navigation services"
                                                      description="Create services with destination links to show them in navigation."
                  action={<Button onClick={() => openItem()}><Plus className="h-4 w-4" /> {surfaceAddLabel}</Button>}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {navScopedItems.map((s: any) => {
                    const serviceCharges = (packages.data ?? []).filter((c: any) => c.service_id === s.id);
                    return (
                      <Card key={s.id} className="p-4">
                        {s.image_url && (
                          <img src={s.resolved_image_url || s.image_url} alt={s.alt_text || s.name} className="mb-3 h-32 w-full rounded-lg object-cover" />
                        )}
                        <div className="flex items-start justify-between">
                          <h4 className="font-semibold text-white">{s.name}</h4>
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
                            <ArrowRight className="h-3 w-3" />
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted line-clamp-2">{s.description}</p>
                        {s.href && <p className="mt-2 truncate text-xs text-blue-400">→ {s.href}</p>}
                        {serviceCharges.length > 0 && (
                          <p className="mt-1 text-xs text-gold">{serviceCharges.length} package(s)</p>
                        )}
                        <div className="mt-3 flex gap-2">
                          <Button variant="outline" className="flex-1" onClick={() => openItem(s)}>
                            <Pencil className="h-3 w-3" /> Edit
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={() => {
                              setPackagesModalService(s);
                              setPackagesModalOpen(true);
                            }}
                          >
                            <DollarSign className="h-3 w-3" />
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {serviceSurface === "information" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Informational Services</h3>
              <p className="text-sm text-muted">Page-scoped services without navigation destinations.</p>
              {infoScopedItems.length === 0 ? (
                <EmptyState
                  title="No informational services"
                                                      description="Create page-scoped services without destinations."
                  action={<Button onClick={() => openItem()}><Plus className="h-4 w-4" /> {surfaceAddLabel}</Button>}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {infoScopedItems.map((s: any) => {
                    const serviceCharges = (packages.data ?? []).filter((c: any) => c.service_id === s.id);
                    return (
                      <Card key={s.id} className="p-4" data-testid="info-card">
                        <div className="flex items-start gap-3">
                          {s.image_url ? (
                            <img src={s.resolved_image_url || s.image_url} alt={s.name} className="h-16 w-16 rounded-lg object-cover" />
                          ) : (
                            <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-gold/10 text-xl font-semibold text-gold">{s.name[0]}</span>
                          )}
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <h4 className="font-semibold text-white">{s.name}</h4>
                              <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-400">
                                <Info className="h-3 w-3" />
                              </span>
                            </div>
                            {s.description && <p className="mt-1 text-sm text-muted line-clamp-2">{s.description}</p>}
                            <p className="mt-2 text-sm text-gold">{formatKES(s.price)}</p>
                            {serviceCharges.length > 0 && (
                              <p className="mt-1 text-xs text-gold">{serviceCharges.length} package(s)</p>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button variant="outline" className="flex-1" onClick={() => openInfoCard(s)}>
                            <Pencil className="h-3 w-3" /> Edit
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={() => {
                              setPackagesModalService(s);
                              setPackagesModalOpen(true);
                            }}
                          >
                            <DollarSign className="h-3 w-3" />
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {serviceSurface === "packages" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Service Packages</h3>
              <p className="text-sm text-muted">Services with package pricing configured.</p>
              {packagesForPage.length === 0 ? (
                <EmptyState
                  title="No packages configured"
                                                      description="Services with configured package charges will appear here."
                  action={<Button onClick={() => openItem()}><Plus className="h-4 w-4" /> {surfaceAddLabel}</Button>}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {packagesForPage.map((s: any) => {
                    const serviceCharges = (packages.data ?? []).filter((c: any) => c.service_id === s.id);
                    return (
                      <Card key={s.id} className="p-4">
                        <h4 className="font-semibold text-white">{s.name}</h4>
                        <p className="mt-1 text-sm text-muted">Base: {formatKES(s.price)}</p>
                        <p className="mt-2 text-xs text-gold">{serviceCharges.length} package(s)</p>
                        <div className="mt-3 flex gap-2">
                          <Button variant="outline" className="flex-1" onClick={() => openItem(s)}>
                            <Pencil className="h-3 w-3" /> Edit Service
                          </Button>
                          <Button 
                            className="flex-1"
                            onClick={() => {
                              setPackagesModalService(s);
                              setPackagesModalOpen(true);
                            }}
                          >
                            <DollarSign className="h-3 w-3" /> Packages
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : cfg.itemResource === "services" && !selectedPageId ? (
        <EmptyState
          title="Select a page"
          description="Choose a website page to view and manage its services."
        />
      ) : (
        /* Generic catalog UI for menu-items */
        tab === "items" ? (
          <DataTable
            data={items.data ?? []}
            columns={columns}
            searchKeys={["name", "description"]}
            searchPlaceholder={`Search ${cfg.itemLabel.toLowerCase()}s…`}
            emptyTitle={`No ${cfg.itemLabel.toLowerCase()}s yet`}
            emptyDescription={`Create your first ${cfg.itemLabel.toLowerCase()}.`}
          />
        ) : (cats.data ?? []).length === 0 ? (
          <EmptyState title="No categories yet" description="Create a category to organize your items." action={<Button onClick={() => openCat()}><Plus className="h-4 w-4" /> New Category</Button>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(cats.data ?? []).map((c: any) => (
              <Card key={c.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-white">{c.name}</p>
                    <p className="mt-1 text-sm text-muted">{c.description || "No description"}</p>
                    <p className="mt-2 text-xs text-muted">
                      {(items.data ?? []).filter((i: any) => i.category_id === c.id).length} items · order {c.sort_order}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openCat(c)} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2 hover:text-white"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => { if (confirm(`Delete category "${c.name}"?`)) removeCat.mutate(c.id); }} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {/* Item form */}
            <Modal open={itemOpen} onClose={() => setItemOpen(false)} title={editing ? `Edit ${cfg.itemLabel}` : surfaceAddLabel}>
        <form
          onSubmit={itemForm.handleSubmit((v) =>
            saveItem.mutate({
              ...v,
              // Compose the destination from the editor and write it to
              // services.href. A null result clears the destination, turning
              // the card into an Information Card. The image-only edit path
              // does not pass href, so Repository.update (present-keys-only)
              // preserves the existing destination untouched.
              ...(cfg.itemResource === "services"
                // Normalize path separators: convert backslashes to forward slashes
                // so that composeHref can match the pageKey against PUBLIC_PAGE_ROUTES.
                // Without this, if the database stores Windows-style paths (e.g. pages\\experiences\\restaurant.html),
                // the route lookup fails and the destination is cleared.
                ? { href: composeHref(navDest.pageKey, navDest.fragment, navDest.customHref?.replace(/\\/g, "/") || undefined) }
                : {}),
            })
          )}
          className="space-y-4"
        >
          {/* Service Type Indicator + nav-type editor (Services only) */}
          {cfg.itemResource === "services" && editing && (
            <div className="space-y-3 rounded-lg border border-edge bg-panel-2/50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {hasDestination(editing) ? (
                    <>
                      <ArrowRight className="h-4 w-4 text-blue-400" />
                      <span className="text-sm font-medium text-blue-400">Navigation Card</span>
                    </>
                  ) : (
                    <>
                      <Info className="h-4 w-4 text-purple-400" />
                      <span className="text-sm font-medium text-purple-400">Information Card</span>
                    </>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPackagesModalService(editing);
                    setPackagesModalOpen(true);
                  }}
                  className="text-xs"
                >
                  <DollarSign className="h-3 w-3" /> Manage Packages
                </Button>
              </div>

              {/* Destination editor: pick a served page to make this a
                  Navigation Card; choose "Information Card" to clear the
                  destination. Composed value is written to services.href on
                  save. Shared across every service page. */}
              <div className="space-y-2 border-t border-edge pt-3">
                <Field label="Card destination">
                  <Select
                    value={navDest.customHref !== null ? "__custom__" : navDest.pageKey}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") setNavDest({ pageKey: "", fragment: "", customHref: null });
                      else if (v === "__custom__") setNavDest({ pageKey: "", fragment: "", customHref: navDest.customHref || "" });
                      else setNavDest({ pageKey: v, fragment: "", customHref: null });
                    }}
                  >
                    <option value="">— Information Card (no destination) —</option>
                    {publicPageOptions.map((o) => (
                      <option key={o.key} value={o.key}>{o.title}</option>
                    ))}
                    <option value="__custom__">Custom URL…</option>
                  </Select>
                </Field>

                {navDest.customHref !== null ? (
                  <Field label="Destination URL">
                    <Input
                      value={navDest.customHref}
                      onChange={(e) => setNavDest({ ...navDest, customHref: e.target.value })}
                      placeholder="pages/experiences/restaurant.html#section"
                    />
                  </Field>
                ) : navDest.pageKey ? (
                  <Field label="Fragment (optional)">
                    <Input
                      value={navDest.fragment}
                      onChange={(e) => setNavDest({ ...navDest, fragment: e.target.value })}
                      placeholder="section-id (saved as #section-id)"
                    />
                  </Field>
                ) : null}
              </div>
            </div>
          )}
          
          <Field label="Name" error={itemForm.formState.errors.name?.message}>
            <Input {...itemForm.register("name")} />
          </Field>
          <Field label="Description">
            <Textarea {...itemForm.register("description")} />
          </Field>
          {showPrice && (
            <Field label="Category" error={itemForm.formState.errors.category_id?.message}>
              <Select {...itemForm.register("category_id")}>
                <option value="">Select…</option>
                {(cats.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          {/* Services only: the public website maps services by `type`
              (service / experience / feature / packages — getPackages filters
              the plural 'packages'; 'informational' is legacy, kept selectable
              so old rows round-trip unchanged). Menu-items share this form but
              have their own unrelated `type` column, so never render or send
              this control for them. No empty option — the enum has no ""
              member and the DB default is 'service'. */}
          {cfg.itemResource === "services" && (
            <Field label="Display type" error={itemForm.formState.errors.type?.message}>
              <Select {...itemForm.register("type")}>
                <option value="service">Service card</option>
                <option value="experience">Experience highlight</option>
                <option value="feature">Feature card</option>
                <option value="packages">Package display</option>
                <option value="informational">Informational (legacy)</option>
              </Select>
            </Field>
          )}
          {cfg.itemResource === "services" && (
            <Field label="Display order" error={itemForm.formState.errors.display_order?.message}>
              <Input type="number" min={0} {...itemForm.register("display_order")} />
            </Field>
          )}
          {itemForm.watch("image_url") && (
            <p className="truncate text-xs text-stone-500">
              Legacy image URL (migration compat): {itemForm.watch("image_url")}
            </p>
          )}

          <div className="space-y-3 rounded-lg border border-edge bg-panel-2/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-300">Media Library</span>
              <Button 
                type="button" 
                onClick={() => setMediaPickerOpen(true)}
                className="text-xs"
              >
                Select from Library
              </Button>
            </div>
            {itemForm.watch("media_id") && (
              <div className="flex items-center justify-between rounded bg-panel p-2 text-sm text-stone-300">
                <span>Media selected: {itemForm.watch("media_id")}</span>
                <button
                  type="button"
                  onClick={() => itemForm.setValue("media_id", null)}
                  className="text-rose-400 hover:text-rose-300"
                  title="Remove media relationship"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {saveItem.isError && <p className="text-sm text-rose-400">{(saveItem.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setItemOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saveItem.isPending}>{saveItem.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </form>

      {/* Information Card editor dialog */}
      {serviceSurface === "information" && infoCardOpen && infoCardEditing && (
        <Modal
          open={infoCardOpen}
          onClose={() => {
            setInfoCardOpen(false);
            setInfoCardEditing(null);
          }}
          title="Information Card"
        >
          <form
            onSubmit={infoCardSave.mutateAsync({
              id: infoCardEditing.id,
              name: infoCardForm.watch("name"),
              description: infoCardForm.watch("description"),
              price: infoCardForm.watch("price"),
            })}
            className="space-y-4"
          >
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-purple-400" />
              <span data-testid="info-type" className="text-sm font-medium text-purple-400">Information Card</span>
            </div>
            <Field label="Name" error={infoCardForm.formState.errors.name?.message}>
              <Input name="name" {...infoCardForm.register("name")} />
            </Field>
            <Field label="Description">
              <Textarea name="description" {...infoCardForm.register("description")} />
            </Field>
            <Field label="Price (KES)">
              <Input name="price" type="number" min={0} step="50" {...infoCardForm.register("price")} />
            </Field>
            {infoCardSave.isError && <p className="text-sm text-rose-400">{(infoCardSave.error as Error).message}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setInfoCardOpen(false); setInfoCardEditing(null); }}>Cancel</Button>
              <Button type="submit" disabled={infoCardSave.isPending}>{infoCardSave.isPending ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        </Modal>
      )}
      </Modal>

      {/* Category form */}
      <Modal open={catOpen} onClose={() => setCatOpen(false)} title={catEditing ? "Edit Category" : "New Category"}>
        <form onSubmit={catForm.handleSubmit((v) => saveCat.mutate(v))} className="space-y-4">
          <Field label="Name" error={catForm.formState.errors.name?.message}>
            <Input {...catForm.register("name")} />
          </Field>
          <Field label="Description">
            <Textarea {...catForm.register("description")} />
          </Field>
          <Field label="Sort Order">
            <Input type="number" {...catForm.register("sort_order")} />
          </Field>
          {saveCat.isError && <p className="text-sm text-rose-400">{(saveCat.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCatOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saveCat.isPending}>{saveCat.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Modal>

      {/* Media Picker Modal */}
      <MediaPickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(media) => {
          itemForm.setValue("media_id", media.id);
          setSelectedMedia(media);
          setMediaPickerOpen(false);
        }}
      />

      {/* Image Change Dialog */}
      {imageEditingItem && (
        <ImageChangeDialog
          open={imageChangeDialogOpen}
          onClose={() => {
            setImageChangeDialogOpen(false);
            setImageEditingItem(null);
          }}
          currentMediaId={imageEditingItem.media_id}
          currentImageUrl={imageEditingItem.resolved_image_url ?? imageEditingItem.image_url ?? ""}
          onSave={async ({ media_id, image_url }) => {
            await saveItem.mutateAsync({
              name: imageEditingItem.name,
              description: imageEditingItem.description,
              category_id: String(imageEditingItem.category_id),
              image_url: image_url || "",
              media_id: media_id,
              display_order: imageEditingItem.display_order ?? 0,
              
            });
          }}
          title="Edit image"
          uploadCategory={RESOURCE_UPLOAD_CATEGORY[cfg.itemResource] ?? "services"}
          canonicalOnly
        />
      )}

      {/* Service Packages Modal. pageId uses the service's OWN page_id: on
          discovery pages (Home/Contact) the selected page is not the owning
          page and the fail-closed charges route rejects a foreign page_id.
          Regular pages are unaffected (s.page_id === selectedPageId). */}
      <ServicePackagesModal
        service={packagesModalService}
        onClose={() => {
          setPackagesModalOpen(false);
          setPackagesModalService(null);
        }}
        pageId={(packagesModalService?.page_id ?? selectedPageId) ?? undefined}
      />
    </div>
  );
}
