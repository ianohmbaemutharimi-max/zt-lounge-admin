# 🏠 ZT Lounge Homepage - Database Integration Audit

**Date:** 2026-10-23  
**File:** `src/app/page.tsx`  
**Goal:** Convert all hardcoded content to database-driven sections

---

## 📊 Progress Overview

| Section | Status | Database Table | Public API | Lines |
|---------|--------|----------------|------------|-------|
| ✅ Hero Section | **FIXED** | `hero_slides` | `/api/public/hero_slides` | 136-205 |
| ✅ Business Name (Header) | **FIXED** | `business_settings` | `/api/public/branding` | 123 |
| ✅ Business Name (Footer) | **FIXED** | `business_settings` | `/api/public/branding` | 287 |
| ✅ Membership Cards | **WORKING** | `membership_plans` | Direct fetch | 207-276 |
| ✅ Testimonials | **WORKING** | `testimonials` | `/api/public/testimonials` | 279, 282 |
| ⚠️ Tier Colors | **HARDCODED** | ❌ No DB field | N/A | 15-20 |
| ❌ Services Section | **MISSING** | `services` exists | ❌ No endpoint | N/A |
| ❌ Promotions Section | **MISSING** | `promotions` exists | ❌ No endpoint | N/A |
| ⚠️ Location "Meru" | **HARDCODED** | `business_settings` | ✅ `/api/public/branding` | 124 |
| ⚠️ Footer Contact Info | **MISSING** | `business_settings` | ✅ `/api/public/branding` | 285-288 |

---

## ✅ COMPLETED FIXES

### 1. Hero Section (Lines 136-205) ✅
**Status:** Fully database-driven

**Implementation:**
- Fetches from `hero_slides` table where `is_active = true`
- Renders hero image from Supabase storage via `media_id`
- Uses DB fields: `heading`, `subheading`, `cta_text`, `cta_link`
- Fallback to hardcoded content if no slides exist

**API Endpoint:** ✅ `/api/public/hero_slides/route.ts`

### 2. Business Name - Header & Footer ✅
**Status:** Fully database-driven

**Implementation:**
- Fetches from `/api/public/branding` (reads `business_settings` table)
- Header (line 123): `{branding.businessName}`
- Footer (line 287): `{branding.businessName}`
- Fallback: `"ZT Lounge"` if fetch fails

**API Endpoint:** ✅ `/api/public/branding/route.ts`

### 3. Membership Cards ✅
**Status:** Already database-driven (direct Supabase fetch)

**Implementation:**
- Fetches `membership_plans` where `is_active = true`
- Renders 4 tier cards with pricing
- Orders by `display_order`

**Note:** Tier colors are hardcoded via `TIER_COLORS` constant (see issue #5)

### 4. Testimonials Section ✅
**Status:** Fully database-driven

**Component:** `<TestimonialsSection />` (lines 279, 282)
**API Endpoint:** ✅ `/api/public/testimonials/route.ts`

**Note:** Duplicated twice — likely a mistake (see issue #10)

---

## ⚠️ PARTIALLY FIXED / HARDCODED ISSUES

### 5. Tier Colors (Lines 15-20) ⚠️
**Status:** Hardcoded — cannot change via CMS  
**Fix:** Add `color_gradient` field to `membership_plans` table  
**Effort:** 🟢 30 mins

### 6. Location "Meru" (Line 124) ⚠️
**Status:** Hardcoded in header  
**Fix:** Add `location` to `/api/public/branding` response  
**Effort:** 🟢 15 mins

### 7. Footer Contact Info (Lines 285-288) ⚠️
**Status:** Minimal — no address/phone/email rendered  
**Fix:** Render contact info from `branding` object  
**Effort:** 🟡 1 hour

---

## ❌ MISSING SECTIONS

### 8. Services Section ❌
**DB Table:** ✅ `services` exists  
**API:** ❌ Need `/api/public/services/route.ts`  
**Position:** After Membership, before Testimonials  
**Effort:** 🟡 2 hours

### 9. Promotions Section ❌
**DB Table:** ✅ `promotions` exists  
**API:** ❌ Need `/api/public/promotions/route.ts`  
**Position:** After Hero, before Membership  
**Effort:** 🟡 2 hours

---

## 🐛 MINOR FIXES NEEDED

- **Line 282:** Remove duplicate `<TestimonialsSection />` (1 min)
- **Lines 100-102:** Remove duplicate JSDoc comments (1 min)

---

## 🎯 PRIORITY ORDER

| Priority | Task | Effort |
|----------|------|--------|
| 🔴 P0 | Remove duplicate testimonials | 1 min |
| 🔴 P0 | Add Services Section | 2 hrs |
| 🔴 P0 | Add Promotions Section | 2 hrs |
| 🟡 P1 | Wire location from DB | 15 min |
| 🟡 P1 | Footer contact info | 1 hr |
| 🟢 P2 | Tier colors from DB | 30 min |

---

## ✅ COMPLETED TODAY

✅ Hero Section — DB-driven from `hero_slides`  
✅ Business Name — Header & footer from `business_settings`  
✅ API endpoints — `/api/public/branding` + `/api/public/hero_slides`

## ❌ REMAINING WORK

❌ Services Section — endpoint + UI  
❌ Promotions Section — endpoint + UI  
⚠️ Footer enhancement — contact info  
⚠️ Location "Meru" — from DB  
🐛 Remove duplicate testimonials

---

**Next Fix:** Remove duplicate testimonials → Add Services Section


