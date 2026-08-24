#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const catalogManagerPath = 'src/features/services/catalog-manager.tsx';
const websiteCmsPath = 'src/features/cms/website-cms.tsx';

// Read current catalog manager file
let catalogContent = fs.readFileSync(catalogManagerPath, 'utf8');

// Fix: Use snake_case for database fields
// Replace camelCase with snake_case throughout the file
catalogContent = catalogContent
  .replace(/imageUrl/g, 'image_url')
  .replace(/mediaId/g, 'media_id')
  .replace(/categoryId/g, 'category_id')
  .replace(/durationMinutes/g, 'duration_minutes')
  .replace(/sortOrder/g, 'sort_order')
  .replace(/isActive/g, 'is_active')
  .replace(/isFeatured/g, 'is_featured');

// Fix: Display resolved_image_url
catalogContent = catalogContent.replace(
  /src={r\.image_url}/g,
  'src={r.resolved_image_url || r.image_url}'
);

// Fix: Item form schema
catalogContent = catalogContent.replace(
  /const itemSchema = z\.object\(\{[\s\S]*?\}\);/,
  `const itemSchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be 0 or more"),
  category_id: z.string().min(1, "Select a category"),
  image_url: z.string().url("Must be a valid URL").or(z.literal("")),
  media_id: z.string().uuid().nullable().optional(),
  duration_minutes: z.coerce.number().optional(),
});`
);

fs.writeFileSync(catalogManagerPath, catalogContent, 'utf8');
console.log('✓ Fixed catalog-manager.tsx');

// Read and fix website-cms.tsx
let websiteContent = fs.readFileSync(websiteCmsPath, 'utf8');

// Fix hero slide schema
websiteContent = websiteContent.replace(
  /const slideSchema = z\.object\(\{[\s\S]*?\}\);/,
  `const slideSchema = z.object({
  title: z.string().min(2, "Title is required"),
  subtitle: z.string().optional(),
  cta_text: z.string().optional(),
  cta_link: z.string().optional(),
  display_order: z.coerce.number().default(0),
  is_active: z.boolean().default(true),
  media_id: z.string().uuid().nullable().optional(),
});`
);

// Fix business schema
websiteContent = websiteContent.replace(
  /const bizSchema = z\.object\(\{[\s\S]*?\}\);/,
  `const bizSchema = z.object({
  business_name: z.string().min(2, "Business name is required"),
  tagline: z.string().optional(),
  phone: z.string().min(7, "Phone is required"),
  whatsapp: z.string().optional(),
  email: z.string().email("Invalid email"),
  address: z.string().min(3, "Address is required"),
  city: z.string().optional(),
  instagram: z.string().optional(),
  facebook: z.string().optional(),
  twitter: z.string().optional(),
  youtube: z.string().optional(),
  logo_media_id: z.string().uuid().nullable().optional(),
  favicon_media_id: z.string().uuid().nullable().optional(),
});`
);

// Fix display of resolved_image_url for hero slides
websiteContent = websiteContent.replace(
  /src={slide\.imageUrl}/g,
  'src={slide.resolved_image_url || slide.imageUrl}'
);

fs.writeFileSync(websiteCmsPath, websiteContent, 'utf8');
console.log('✓ Fixed website-cms.tsx');

console.log('\nAll fixes applied successfully!');
