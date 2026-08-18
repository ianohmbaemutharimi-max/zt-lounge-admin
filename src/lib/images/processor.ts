/**
 * Image processing utilities for Phase 3 - Secure Image Upload API
 * 
 * Uses Sharp for image validation, conversion to WebP, and category-specific resizing.
 * All processing maintains aspect ratios and never enlarges small images.
 */

import sharp from "sharp";
import type { ImageCategory } from "@/lib/storage/paths";

/**
 * Maximum file size for uploads: 10 MB
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB in bytes

/**
 * Accepted MIME types for image uploads.
 */
export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/**
 * WebP quality setting (0-100).
 * 80 provides good balance between quality and file size.
 */
export const WEBP_QUALITY = 80;

/**
 * Category-specific maximum widths for resizing.
 * Heights are calculated automatically to preserve aspect ratio.
 */
export const CATEGORY_MAX_WIDTHS: Record<ImageCategory, number> = {
  hero: 1920,        // Full-screen hero images
  gallery: 1200,     // Gallery thumbnails/previews
  menu: 800,         // Menu item images
  services: 800,     // Service images
  testimonials: 400, // Customer photos
  branding: 800,     // Logos and brand assets
};

/**
 * Validates if a MIME type is accepted.
 */
export function isAcceptedMimeType(mimeType: string): boolean {
  return ACCEPTED_MIME_TYPES.includes(mimeType as any);
}

/**
 * Validates file size.
 */
export function isValidFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}

/**
 * Validates and processes an uploaded image file.
 * 
 * Process:
 * 1. Validates MIME type (declared)
 * 2. Validates file size
 * 3. Uses Sharp to inspect actual image format
 * 4. Rejects fake/corrupted images
 * 5. Converts to WebP at quality 80
 * 6. Resizes based on category (preserves aspect ratio, never enlarges)
 * 7. Strips metadata for security
 * 
 * @param fileBuffer - Raw file buffer from upload
 * @param declaredMimeType - MIME type from multipart form
 * @param originalName - Original filename (for error messages only)
 * @param category - Image category for size constraints
 * @returns Processed WebP buffer and metadata
 * @throws Error if validation fails
 */
export async function processImage(
  fileBuffer: Buffer,
  declaredMimeType: string,
  originalName: string,
  category: ImageCategory
): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  size: number;
  format: string;
}> {
  // Validate declared MIME type
  if (!isAcceptedMimeType(declaredMimeType)) {
    throw new Error(
      `Unsupported image format: ${declaredMimeType}. ` +
      `Accepted formats: ${ACCEPTED_MIME_TYPES.join(", ")}`
    );
  }

  // Validate file size
  if (!isValidFileSize(fileBuffer.length)) {
    const sizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
    const maxMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
    throw new Error(
      `File too large: ${sizeMB} MB. Maximum size: ${maxMB} MB`
    );
  }

  // Use Sharp to inspect and validate the actual image
  let image: ReturnType<typeof sharp>;
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  
  try {
    image = sharp(fileBuffer);
    metadata = await image.metadata();
  } catch (error) {
    throw new Error(
      `Invalid or corrupted image file: ${originalName}. ` +
      `The file could not be processed as an image.`
    );
  }

  // Verify actual format matches accepted types
  const actualFormat = metadata.format;
  if (!actualFormat || !["jpeg", "png", "webp"].includes(actualFormat)) {
    throw new Error(
      `Invalid image format detected: ${actualFormat || "unknown"}. ` +
      `File may be renamed or corrupted. Original: ${originalName}`
    );
  }

  // Verify image has valid dimensions
  if (!metadata.width || !metadata.height) {
    throw new Error(`Image has invalid dimensions: ${originalName}`);
  }

  // Get category-specific max width
  const maxWidth = CATEGORY_MAX_WIDTHS[category];

  // Process image: convert to WebP, resize if needed, strip metadata
  try {
    const processedImage = image
      .webp({ quality: WEBP_QUALITY })
      .resize(maxWidth, null, {
        withoutEnlargement: true, // Never enlarge small images
        fit: "inside",            // Preserve aspect ratio
      })
      .rotate(); // Auto-rotate based on EXIF (before stripping)

    // Get processed buffer and metadata
    const buffer = await processedImage.toBuffer({ resolveWithObject: true });

    return {
      buffer: buffer.data,
      width: buffer.info.width,
      height: buffer.info.height,
      size: buffer.info.size,
      format: "webp",
    };
  } catch (error) {
    throw new Error(
      `Failed to process image: ${originalName}. ` +
      `Error: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Validates image file metadata without full processing.
 * Useful for quick validation checks.
 * 
 * @param fileBuffer - Raw file buffer
 * @param declaredMimeType - MIME type from upload
 * @returns True if image is valid
 */
export async function validateImage(
  fileBuffer: Buffer,
  declaredMimeType: string
): Promise<boolean> {
  try {
    // Check MIME type
    if (!isAcceptedMimeType(declaredMimeType)) {
      return false;
    }

    // Check size
    if (!isValidFileSize(fileBuffer.length)) {
      return false;
    }

    // Try to read metadata with Sharp
    const metadata = await sharp(fileBuffer).metadata();
    
    // Verify format
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) {
      return false;
    }

    // Verify dimensions
    if (!metadata.width || !metadata.height) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Gets safe image metadata for inspection.
 * Does not include sensitive EXIF data.
 * 
 * @param fileBuffer - Raw file buffer
 * @returns Safe metadata object
 */
export async function getImageMetadata(fileBuffer: Buffer): Promise<{
  format: string | undefined;
  width: number | undefined;
  height: number | undefined;
  space: string | undefined;
  channels: number | undefined;
  hasAlpha: boolean | undefined;
}> {
  const metadata = await sharp(fileBuffer).metadata();
  
  return {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    space: metadata.space,
    channels: metadata.channels,
    hasAlpha: metadata.hasAlpha,
  };
}
