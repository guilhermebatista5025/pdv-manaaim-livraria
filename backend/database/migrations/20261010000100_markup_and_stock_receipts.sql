-- Persist the product markup and the cost data required to audit purchases.
-- Safe to run more than once.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS markup_percent NUMERIC(7, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_markup_percent_range'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_markup_percent_range
      CHECK (markup_percent >= 0 AND markup_percent <= 1000);
  END IF;
END $$;

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS unit_cost_cents INTEGER,
  ADD COLUMN IF NOT EXISTS total_cost_cents BIGINT,
  ADD COLUMN IF NOT EXISTS average_cost_before_cents INTEGER,
  ADD COLUMN IF NOT EXISTS average_cost_after_cents INTEGER,
  ADD COLUMN IF NOT EXISTS markup_percent_applied NUMERIC(7, 2),
  ADD COLUMN IF NOT EXISTS sale_price_before_cents INTEGER,
  ADD COLUMN IF NOT EXISTS sale_price_after_cents INTEGER,
  ADD COLUMN IF NOT EXISTS supplier TEXT,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_movements_purchase_costs_nonnegative'
      AND conrelid = 'public.stock_movements'::regclass
  ) THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_purchase_costs_nonnegative
      CHECK (
        (unit_cost_cents IS NULL OR unit_cost_cents > 0)
        AND (total_cost_cents IS NULL OR total_cost_cents >= 0)
        AND (average_cost_before_cents IS NULL OR average_cost_before_cents >= 0)
        AND (average_cost_after_cents IS NULL OR average_cost_after_cents >= 0)
        AND (markup_percent_applied IS NULL OR markup_percent_applied BETWEEN 0 AND 1000)
        AND (sale_price_before_cents IS NULL OR sale_price_before_cents >= 0)
        AND (sale_price_after_cents IS NULL OR sale_price_after_cents >= 0)
      );
  END IF;
END $$;
