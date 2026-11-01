/**
 * Storage path utilities for Phase 3 - Secure Image Upload API
 * 
 * Provides safe category validation, UUID-based path generation,
 * and path traversal protection for Supabase Storage uploads.
 */

import { randomUUID } from "crypto";

/**
 * Allowed image categories based on existing ZT Lounge architecture.
 * Categories map to logical content types in the application.
 */
export const VALID_CATEGORIES = [
  "hero",
  "gallery",
  "menu",
  "services",
  "testimonials",
  "branding",
  "promotions",
  "memberships",
  "seo",
  "feature",
  "general",
] as const;

export type ImageCategory = (typeof VALID_CATEGORIES)[number];

/**
 * Storage bucket for public assets.
 * This bucket must exist in Supabase Storage with public access enabled.
 */
export const PUBLIC_ASSETS_BUCKET = "public-assets";
export const FAVICONS_BUCKET = "favicons";

/**
 * Validates if a string is a valid category.
 * 
 * @param category - The category string to validate
 * @returns True if the category is in the allowlist
 */
export function isValidCategory(category: unknown): category is ImageCategory {
  return (
    typeof category === "string" &&
    VALID_CATEGORIES.includes(category as ImageCategory)
  );
}

/**
 * Validates a category and throws if invalid.
 * 
 * @param category - The category to validate
 * @throws Error if category is invalid
 */
export function validateCategory(category: unknown): asserts category is ImageCategory {
  if (!isValidCategory(category)) {
    throw new Error(
      `Invalid category: ${category}. Allowed: ${VALID_CATEGORIES.join(", ")}`
    );
  }
}

/**
 * Generates a safe storage path for an uploaded image.
 * 
  * Format: assets/images/{category}/{uuid}.{extension}
 * 
 * Security:
 * - Uses UUID to prevent filename-based attacks
 * - No client-controlled paths
 * - No path traversal possible
  * - Defaults to .webp extension (processed format); .ico for genuine ICO uploads
 * 
  * @param category - Valid image category
 * @param extension - File extension (defaults to "webp"). Pass "ico" for genuine ICO favicons.
 * @returns Safe storage path with UUID filename
 * @throws Error if category is invalid
 */
export function generateStoragePath(
  category: ImageCategory,
  extension: string = "webp"
): string {
  validateCategory(category);
  
  const uuid = randomUUID();
  return `assets/images/${category}/${uuid}.${extension}`;
}

/**
 * Builds a storage path with a specific UUID (for testing or specific use cases).
 * 
 * @param category - Valid image category
 * @param uuid - UUID to use for the filename
 * @returns Safe storage path
 * @throws Error if category is invalid
 */
export function buildStoragePath(category: ImageCategory, uuid: string): string {
  validateCategory(category);
  
  // Basic UUID validation (simple format check)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    throw new Error("Invalid UUID format");
  }
  
  return `assets/images/${category}/${uuid}.webp`;
}

/**
 * Extracts the category from a storage path.
 * Used for validation and reverse lookups.
 * 
 * @param path - Storage path to parse
 * @returns Category if path is valid, null otherwise
 */
export function extractCategoryFromPath(path: string): ImageCategory | null {
  const match = path.match(/^assets\/images\/([^/]+)\//);
  if (!match) return null;
  
  const category = match[1];
  return isValidCategory(category) ? category : null;
}

/**
 * Parse only public Supabase Storage URLs belonging to this configured project.
 * Unknown/external URLs are intentionally not eligible for server-side deletion.
 */
export function parsePublicStorageUrl(publicUrl: string): { bucket: string; path: string } | null {
  try {
    const parsed = new URL(publicUrl);
    const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    if (!configuredUrl || parsed.origin !== new URL(configuredUrl).origin) return null;

    const prefix = "/storage/v1/object/public/";
    if (!parsed.pathname.startsWith(prefix)) return null;
    const objectRef = parsed.pathname.slice(prefix.length);
    const separator = objectRef.indexOf("/");
    if (separator <= 0 || separator === objectRef.length - 1) return null;

    const bucket = decodeURIComponent(objectRef.slice(0, separator));
    const path = objectRef.slice(separator + 1).split("/").map(decodeURIComponent).join("/");
    if (!bucket || !path || hasPathTraversal(path)) return null;
    return { bucket, path };
  } catch {
    return null;
  }
}

/**
 * Detects potential path traversal attempts in user input.

 * 
 * @param input - User-provided string to check
 * @returns True if path traversal detected
 */
export function hasPathTraversal(input: string): boolean {
  // Check for various path traversal patterns
  const dangerous = [
    "../",
    "..\\",
    "%2e%2e%2f", // URL-encoded ../
    "%2e%2e%5c", // URL-encoded ..\
    "..%2f",
    "..%5c",
    "%252e%252e%252f", // Double-encoded
    "\0", // Null byte
  ];
  
  const lower = input.toLowerCase();
  return dangerous.some((pattern) => lower.includes(pattern));
}

/**
 * Sanitizes and validates a category from user input.
 * 
 * @param category - Raw category from request
 * @returns Validated category
 * @throws Error if category is invalid or contains dangerous patterns
 */
export function sanitizeCategory(category: unknown): ImageCategory {
  if (typeof category !== "string") {
    throw new Error("Category must be a string");
  }
  
  // Check for path traversal
  if (hasPathTraversal(category)) {
    throw new Error("Invalid category: path traversal detected");
  }
  
  // Check for slashes
  if (category.includes("/") || category.includes("\\")) {
    throw new Error("Invalid category: cannot contain slashes");
  }
  
  // Validate against allowlist
  validateCategory(category);
  
  return category;
}

