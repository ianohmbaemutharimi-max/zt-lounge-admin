/**
 * CATEGORY LOCKING SYSTEM
 * 
 * Enforces strict mapping between media_assets.category and content table usage.
 * A "hero" category image can ONLY be used in hero_slides, a "menu" image ONLY
 * in menu_items, etc.
 * 
 * This is enforced at three layers:
 * 1. Database CHECK constraints (blocks invalid saves)
 * 2. API validation (rejects mismatched category on POST/PATCH)
 * 3. UI filtering (media picker shows only valid-category assets)
 */

import type { ImageCategory } from "@/lib/storage/paths";

/**
 * Canonical mapping: content table → required media category
 */
export const CONTENT_TABLE_CATEGORY_MAP = {
  hero_slides: "hero",
  gallery: "gallery",
  menu_items: "menu",
  services: "services",
  testimonials: "testimonials",
  promotions: "promotions",
  membership_plans: "memberships",
  // business_settings has multiple media columns, all require "branding"
  business_settings: "branding",
} as const;

export type ContentTable = keyof typeof CONTENT_TABLE_CATEGORY_MAP;

/**
 * Reverse mapping: category → allowed content tables
 */
export const CATEGORY_CONTENT_TABLES_MAP: Record<ImageCategory, readonly ContentTable[]> = {
  hero: ["hero_slides"],
  gallery: ["gallery"],
  menu: ["menu_items"],
  services: ["services"],
  testimonials: ["testimonials"],
  branding: ["business_settings"],
  promotions: ["promotions"],
  memberships: ["membership_plans"],
} as const;

/**
 * Get the required category for a content table
 */
export function getRequiredCategory(table: string): ImageCategory | null {
  return CONTENT_TABLE_CATEGORY_MAP[table as ContentTable] ?? null;
}

/**
 * Check if a category is valid for a content table
 */
export function isValidCategoryForTable(
  category: string | null | undefined,
  table: string
): boolean {
  if (!category) return false;
  const required = getRequiredCategory(table);
  return required === category;
}

/**
 * Validate category match and throw if invalid
 */
export function validateCategoryForTable(
  category: string | null | undefined,
  table: string,
  columnName: string = "media_id"
): asserts category is ImageCategory {
  const required = getRequiredCategory(table);
  
  if (!required) {
    throw new Error(
      `Category validation not configured for table: ${table}`
    );
  }
  
  if (!category) {
    throw new Error(
      `Missing category. ${table}.${columnName} requires category="${required}"`
    );
  }
  
  if (category !== required) {
    throw new Error(
      `Category mismatch: ${table}.${columnName} requires category="${required}", got "${category}"`
    );
  }
}

/**
 * Get allowed content tables for a category (for UI filtering context)
 */
export function getAllowedTablesForCategory(category: ImageCategory): readonly ContentTable[] {
  return CATEGORY_CONTENT_TABLES_MAP[category] ?? [];
}

/**
 * Validate media_id category for a content table mutation (POST/PATCH)
 * 
 * @param supabase - Supabase client for querying media_assets
 * @param table - Content table name (e.g., "hero-slides", "menu-items")
 * @param mediaId - UUID of the media asset being referenced
 * @param columnName - Column name for error messages (default: "media_id")
 * @returns Promise that resolves if valid, rejects with error message if invalid
 */
export async function validateMediaCategoryForMutation(
  supabase: any,
  table: string,
  mediaId: string | null | undefined,
  columnName: string = "media_id"
): Promise<{ valid: true } | { valid: false; error: string }> {
  // Skip validation if no media_id provided
  if (!mediaId) {
    return { valid: true };
  }

  // Convert kebab-case resource name to snake_case table name
  const snakeTable = table.replace(/-/g, "_");
  
  // Check if this table requires category validation
  const requiredCategory = getRequiredCategory(snakeTable);
  if (!requiredCategory) {
    // Table doesn't use category locking
    return { valid: true };
  }

  try {
    // Query the media asset to check its category
    const { data: asset, error } = await supabase
      .from("media_assets")
      .select("id, category")
      .eq("id", mediaId)
      .single();

    if (error || !asset) {
      return {
        valid: false,
        error: `Invalid ${columnName}: media asset not found`
      };
    }

    if (asset.category !== requiredCategory) {
      return {
        valid: false,
        error: `Category mismatch: ${table}.${columnName} requires media with category="${requiredCategory}", but referenced asset has category="${asset.category}"`
      };
    }

    return { valid: true };
  } catch (err) {
    console.error(`[validateMediaCategoryForMutation] Error validating media category:`, err);
    return {
      valid: false,
      error: `Failed to validate media category`
    };
  }
}
