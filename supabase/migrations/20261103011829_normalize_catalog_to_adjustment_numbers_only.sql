-- The browser needs only adjustment numbers in its catalogue. Keep no
-- responsible, contact, entity metadata or movement fields in this table.

ALTER TABLE public.orcom_adjustment_catalog
  DROP CONSTRAINT IF EXISTS orcom_adjustment_catalog_pkey;
ALTER TABLE public.orcom_adjustment_catalog
  DROP COLUMN IF EXISTS adjustment_key,
  DROP COLUMN IF EXISTS refreshed_at;
ALTER TABLE public.orcom_adjustment_catalog
  ADD CONSTRAINT orcom_adjustment_catalog_pkey PRIMARY KEY (adjustment_number);

ALTER TABLE public.orcom_adjustment_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orcom_adjustment_catalog FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.orcom_adjustment_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orcom_adjustment_catalog TO service_role;

DROP POLICY IF EXISTS "active panel users read adjustment catalog" ON public.orcom_adjustment_catalog;
DROP POLICY IF EXISTS "allowlisted users can read adjustment catalog" ON public.orcom_adjustment_catalog;
CREATE POLICY "allowlisted users can read adjustment catalog"
ON public.orcom_adjustment_catalog
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.panel_users pu
    WHERE pu.email = lower(COALESCE(((SELECT auth.jwt()) ->> 'email'), ''))
      AND pu.is_active = true
  )
);

CREATE OR REPLACE FUNCTION public.orcom_adjustment_metadata(p_adjustment_number text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT to_jsonb(s)
  FROM public.orcom_adjustment_selection_snapshot s
  JOIN public.orcom_adjustment_catalog c
    ON c.adjustment_number = BTRIM(p_adjustment_number)
  WHERE c.adjustment_number =
    LPAD(s.adjustment_number, 5, '0') || '/' || s.adjustment_year ||
    CASE WHEN NULLIF(BTRIM(s.adjustment_letter), '') IS NULL
      THEN '' ELSE '-' || UPPER(BTRIM(s.adjustment_letter)) END
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.orcom_adjustment_metadata(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orcom_adjustment_metadata(text) TO authenticated;

-- Refresh the snapshot and its number-only catalogue in the same transaction.
CREATE OR REPLACE FUNCTION public.refresh_orcom_adjustment_selection_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_rows bigint;
  v_catalog_rows bigint;
  v_refreshed_at timestamptz := clock_timestamp();
BEGIN
  DELETE FROM public.orcom_adjustment_selection_snapshot;

  INSERT INTO public.orcom_adjustment_selection_snapshot
  SELECT v.*, v_refreshed_at
  FROM public.orcom_adjustment_selection v;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  DELETE FROM public.orcom_adjustment_catalog;
  INSERT INTO public.orcom_adjustment_catalog (adjustment_number)
  SELECT DISTINCT
    LPAD(s.adjustment_number, 5, '0') || '/' || s.adjustment_year ||
    CASE WHEN NULLIF(BTRIM(s.adjustment_letter), '') IS NULL
      THEN '' ELSE '-' || UPPER(BTRIM(s.adjustment_letter)) END
  FROM public.orcom_adjustment_selection_snapshot s;
  GET DIAGNOSTICS v_catalog_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true, 'row_count', v_rows,
    'catalog_count', v_catalog_rows, 'refreshed_at', v_refreshed_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_orcom_adjustment_selection_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_orcom_adjustment_selection_snapshot() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_orcom_adjustment_selection_snapshot() TO service_role;
