-- =====================================================================
-- ADD CARPET CLEANING CATEGORY TO GROOMING & CARE
-- =====================================================================
-- Date: 2026-09-10
-- Purpose: Add Carpet Cleaning as third category under Grooming & Care page
--          alongside Auto Spa and Barbershop
--
-- CONTEXT:
-- - Grooming & Care page consolidation completed 2026-09-06
-- - Auto Spa page_id: 47d44cf4-be29-48e7-a0e0-9863fe26e9af
-- - Auto Spa category: 92efcbe4-22ab-4acd-95a4-6e733dc069e1
-- - Barbershop category: 011d68d4-7b4b-4a13-9c8e-959c135f119b
-- - New: Carpet Cleaning category (assigned UUID below)
--
-- SAFETY:
-- - Idempotent: safe to run multiple times
-- - No data deletion
-- - No existing record modification
-- =====================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 1: Insert Carpet Cleaning category
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.service_categories (
    id,
    name,
    slug,
    description,
    icon,
    display_order,
    is_active,
    created_at,
    updated_at
)
VALUES (
    'c8f3a1d2-9e4b-4c7a-8d5e-1f2b3a4c5d6e'::uuid,  -- New carpet-cleaning category UUID
    'Carpet Cleaning',
    'carpet-cleaning',
    'Professional carpet and upholstery cleaning services. Deep cleaning, stain removal, and fabric protection for homes and offices.',
    'fa-solid fa-soap',
    3,  -- Display after Auto Spa (1) and Barbershop (2)
    true,
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;  -- Idempotent: skip if already exists

-- ─────────────────────────────────────────────────────────────────────
-- STEP 2: Verify category was created
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_carpet_cat_id uuid := 'c8f3a1d2-9e4b-4c7a-8d5e-1f2b3a4c5d6e';
    v_category_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.service_categories WHERE id = v_carpet_cat_id
    ) INTO v_category_exists;
    
    IF v_category_exists THEN
        RAISE NOTICE 'Carpet Cleaning category created successfully: %', v_carpet_cat_id;
    ELSE
        RAISE EXCEPTION 'Carpet Cleaning category creation failed';
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────
-- STEP 3: Display current Grooming & Care categories
-- ─────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    rec RECORD;
BEGIN
    RAISE NOTICE '=== Grooming & Care Categories ===';
    FOR rec IN 
        SELECT 
            sc.id,
            sc.name,
            sc.slug,
            sc.display_order,
            sc.is_active,
            COUNT(s.id) as service_count
        FROM public.service_categories sc
        LEFT JOIN public.services s ON s.category_id = sc.id
        WHERE sc.id IN (
            '92efcbe4-22ab-4acd-95a4-6e733dc069e1',  -- Auto Spa
            '011d68d4-7b4b-4a13-9c8e-959c135f119b',  -- Barbershop
            'c8f3a1d2-9e4b-4c7a-8d5e-1f2b3a4c5d6e'   -- Carpet Cleaning
        )
        GROUP BY sc.id, sc.name, sc.slug, sc.display_order, sc.is_active
        ORDER BY sc.display_order
    LOOP
        RAISE NOTICE '  % - % (%) - Active: % - Services: %',
            rec.display_order,
            rec.name,
            rec.slug,
            rec.is_active,
            rec.service_count;
    END LOOP;
END $$;

COMMIT;

-- =====================================================================
-- MIGRATION COMPLETE
-- =====================================================================
-- Next steps:
-- 1. Add Carpet Cleaning services via Admin panel OR
-- 2. Insert demo services via additional migration
-- 3. Update public website grooming-care.html with data-category-id
-- 4. Category will auto-render when services are added
-- =====================================================================
