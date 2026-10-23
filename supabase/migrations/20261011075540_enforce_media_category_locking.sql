-- Migration: Enforce Media Category Locking
-- Created: 2026-10-11
-- Purpose: Enforce strict category matching between media_assets.category and content table usage.

-- Hero slides validation
CREATE OR REPLACE FUNCTION validate_hero_slides_category()
RETURNS TRIGGER AS $$
DECLARE v_category TEXT;
BEGIN
  IF NEW.media_id IS NOT NULL THEN
    SELECT category INTO v_category FROM media_assets WHERE id = NEW.media_id;
    IF v_category IS NULL THEN RAISE EXCEPTION 'media_id references non-existent media asset'; END IF;
    IF v_category != 'hero' THEN RAISE EXCEPTION 'hero_slides requires category=hero, got %', v_category; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_hero_slides_category ON hero_slides;
CREATE TRIGGER trigger_validate_hero_slides_category BEFORE INSERT OR UPDATE ON hero_slides FOR EACH ROW EXECUTE FUNCTION validate_hero_slides_category();

-- Gallery validation
CREATE OR REPLACE FUNCTION validate_gallery_category()
RETURNS TRIGGER AS $$
DECLARE v_category TEXT;
BEGIN
  IF NEW.media_id IS NOT NULL THEN
    SELECT category INTO v_category FROM media_assets WHERE id = NEW.media_id;
    IF v_category IS NULL THEN RAISE EXCEPTION 'media_id references non-existent media asset'; END IF;
    IF v_category != 'gallery' THEN RAISE EXCEPTION 'gallery requires category=gallery, got %', v_category; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_gallery_category ON gallery;
CREATE TRIGGER trigger_validate_gallery_category BEFORE INSERT OR UPDATE ON gallery FOR EACH ROW EXECUTE FUNCTION validate_gallery_category();

-- Menu items validation
CREATE OR REPLACE FUNCTION validate_menu_items_category()
RETURNS TRIGGER AS $$
DECLARE v_category TEXT;
BEGIN
  IF NEW.media_id IS NOT NULL THEN
    SELECT category INTO v_category FROM media_assets WHERE id = NEW.media_id;
    IF v_category IS NULL THEN RAISE EXCEPTION 'media_id references non-existent media asset'; END IF;
    IF v_category != 'menu' THEN RAISE EXCEPTION 'menu_items requires category=menu, got %', v_category; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_menu_items_category ON menu_items;
CREATE TRIGGER trigger_validate_menu_items_category BEFORE INSERT OR UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION validate_menu_items_category();

-- Services validation
CREATE OR REPLACE FUNCTION validate_services_category()
RETURNS TRIGGER AS $$
DECLARE v_category TEXT;
BEGIN
  IF NEW.media_id IS NOT NULL THEN
    SELECT category INTO v_category FROM media_assets WHERE id = NEW.media_id;
    IF v_category IS NULL THEN RAISE EXCEPTION 'media_id references non-existent media asset'; END IF;
    IF v_category != 'services' THEN RAISE EXCEPTION 'services requires category=services, got %', v_category; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_services_category ON services;
CREATE TRIGGER trigger_validate_services_category BEFORE INSERT OR UPDATE ON services FOR EACH ROW EXECUTE FUNCTION validate_services_category();

-- Testimonials validation
CREATE OR REPLACE FUNCTION validate_testimonials_category()
RETURNS TRIGGER AS $$
DECLARE v_category TEXT;
BEGIN
  IF NEW.media_id IS NOT NULL THEN
    SELECT category INTO v_category FROM media_assets WHERE id = NEW.media_id;
    IF v_category IS NULL THEN RAISE EXCEPTION 'media_id references non-existent media asset'; END IF;
    IF v_category != 'testimonials' THEN RAISE EXCEPTION 'testimonials requires category=testimonials, got %', v_category; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_testimonials_category ON testimonials;
CREATE TRIGGER trigger_validate_testimonials_category BEFORE INSERT OR UPDATE ON testimonials FOR EACH ROW EXECUTE FUNCTION validate_testimonials_category();

-- Promotions validation
CREATE OR REPLACE FUNCTION validate_promotions_category()
RETURNS TRIGGER AS $$
DECLARE v_category TEXT;
BEGIN
  IF NEW.media_id IS NOT NULL THEN
    SELECT category INTO v_category FROM media_assets WHERE id = NEW.media_id;
    IF v_category IS NULL THEN RAISE EXCEPTION 'media_id references non-existent media asset'; END IF;
    IF v_category != 'promotions' THEN RAISE EXCEPTION 'promotions requires category=promotions, got %', v_category; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_promotions_category ON promotions;
CREATE TRIGGER trigger_validate_promotions_category BEFORE INSERT OR UPDATE ON promotions FOR EACH ROW EXECUTE FUNCTION validate_promotions_category();

-- Membership plans validation
CREATE OR REPLACE FUNCTION validate_membership_plans_category()
RETURNS TRIGGER AS $$
DECLARE v_category TEXT;
BEGIN
  IF NEW.media_id IS NOT NULL THEN
    SELECT category INTO v_category FROM media_assets WHERE id = NEW.media_id;
    IF v_category IS NULL THEN RAISE EXCEPTION 'media_id references non-existent media asset'; END IF;
    IF v_category != 'memberships' THEN RAISE EXCEPTION 'membership_plans requires category=memberships, got %', v_category; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_membership_plans_category ON membership_plans;
CREATE TRIGGER trigger_validate_membership_plans_category BEFORE INSERT OR UPDATE ON membership_plans FOR EACH ROW EXECUTE FUNCTION validate_membership_plans_category();

-- Business settings validation (handles 3 media columns)
CREATE OR REPLACE FUNCTION validate_business_settings_category()
RETURNS TRIGGER AS $$
DECLARE v_category TEXT;
BEGIN
  IF NEW.logo_media_id IS NOT NULL THEN
    SELECT category INTO v_category FROM media_assets WHERE id = NEW.logo_media_id;
    IF v_category IS NULL THEN RAISE EXCEPTION 'logo_media_id references non-existent media asset'; END IF;
    IF v_category != 'branding' THEN RAISE EXCEPTION 'business_settings.logo_media_id requires category=branding, got %', v_category; END IF;
  END IF;
  IF NEW.logo_light_media_id IS NOT NULL THEN
    SELECT category INTO v_category FROM media_assets WHERE id = NEW.logo_light_media_id;
    IF v_category IS NULL THEN RAISE EXCEPTION 'logo_light_media_id references non-existent media asset'; END IF;
    IF v_category != 'branding' THEN RAISE EXCEPTION 'business_settings.logo_light_media_id requires category=branding, got %', v_category; END IF;
  END IF;
  IF NEW.favicon_media_id IS NOT NULL THEN
    SELECT category INTO v_category FROM media_assets WHERE id = NEW.favicon_media_id;
    IF v_category IS NULL THEN RAISE EXCEPTION 'favicon_media_id references non-existent media asset'; END IF;
    IF v_category != 'branding' THEN RAISE EXCEPTION 'business_settings.favicon_media_id requires category=branding, got %', v_category; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_business_settings_category ON business_settings;
CREATE TRIGGER trigger_validate_business_settings_category BEFORE INSERT OR UPDATE ON business_settings FOR EACH ROW EXECUTE FUNCTION validate_business_settings_category();

-- Prevent category changes on in-use media assets
CREATE OR REPLACE FUNCTION check_media_category_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.category IS DISTINCT FROM NEW.category THEN
    IF EXISTS (SELECT 1 FROM hero_slides WHERE media_id = NEW.id LIMIT 1) THEN
      IF NEW.category != 'hero' THEN
        RAISE EXCEPTION 'Cannot change category: asset used in hero_slides requires category=hero' USING ERRCODE = '23514';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM gallery WHERE media_id = NEW.id LIMIT 1) THEN
      IF NEW.category != 'gallery' THEN
        RAISE EXCEPTION 'Cannot change category: asset used in gallery requires category=gallery' USING ERRCODE = '23514';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM menu_items WHERE media_id = NEW.id LIMIT 1) THEN
      IF NEW.category != 'menu' THEN
        RAISE EXCEPTION 'Cannot change category: asset used in menu_items requires category=menu' USING ERRCODE = '23514';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM services WHERE media_id = NEW.id LIMIT 1) THEN
      IF NEW.category != 'services' THEN
        RAISE EXCEPTION 'Cannot change category: asset used in services requires category=services' USING ERRCODE = '23514';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM testimonials WHERE media_id = NEW.id LIMIT 1) THEN
      IF NEW.category != 'testimonials' THEN
        RAISE EXCEPTION 'Cannot change category: asset used in testimonials requires category=testimonials' USING ERRCODE = '23514';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM promotions WHERE media_id = NEW.id LIMIT 1) THEN
      IF NEW.category != 'promotions' THEN
        RAISE EXCEPTION 'Cannot change category: asset used in promotions requires category=promotions' USING ERRCODE = '23514';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM membership_plans WHERE media_id = NEW.id LIMIT 1) THEN
      IF NEW.category != 'memberships' THEN
        RAISE EXCEPTION 'Cannot change category: asset used in membership_plans requires category=memberships' USING ERRCODE = '23514';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM business_settings WHERE logo_media_id = NEW.id OR logo_light_media_id = NEW.id OR favicon_media_id = NEW.id LIMIT 1) THEN
      IF NEW.category != 'branding' THEN
        RAISE EXCEPTION 'Cannot change category: asset used in business_settings requires category=branding' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_media_category_change ON media_assets;
CREATE TRIGGER trigger_check_media_category_change BEFORE UPDATE ON media_assets FOR EACH ROW EXECUTE FUNCTION check_media_category_change();
