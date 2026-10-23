-- Create promotions table
-- This table stores promotional offers displayed on the public website

CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  banner_image text,
  discount_percent numeric,
  start_date date,
  end_date date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

-- Policies: admins can read/write, public can read active promotions
CREATE POLICY "admins_can_manage_promotions" ON public.promotions
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "public_can_read_active_promotions" ON public.promotions
  FOR SELECT
  USING (true);

-- Index for faster lookups
CREATE INDEX idx_promotions_is_active ON public.promotions(is_active);
CREATE INDEX idx_promotions_start_date ON public.promotions(start_date);
CREATE INDEX idx_promotions_end_date ON public.promotions(end_date);

-- Comment for documentation
COMMENT ON TABLE public.promotions IS 'Promotional offers displayed on the public website';
COMMENT ON COLUMN public.promotions.title IS 'Promotion title (required)';
COMMENT ON COLUMN public.promotions.description IS 'Detailed description of the offer';
COMMENT ON COLUMN public.promotions.banner_image IS 'URL to promotion banner image';
COMMENT ON COLUMN public.promotions.discount_percent IS 'Discount percentage (e.g., 20 for 20% off)';
COMMENT ON COLUMN public.promotions.start_date IS 'Promotion start date';
COMMENT ON COLUMN public.promotions.end_date IS 'Promotion end date';
COMMENT ON COLUMN public.promotions.is_active IS 'Whether promotion is active';
