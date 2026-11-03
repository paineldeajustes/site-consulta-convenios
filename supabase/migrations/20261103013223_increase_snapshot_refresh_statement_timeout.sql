-- The scheduled Edge Function invokes this after the daily imports.
-- The materialized historical view rebuild may exceed the short PostgREST default.
CREATE OR REPLACE FUNCTION public.refresh_orcom_adjustment_selection_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '120s'
AS $function$
DECLARE
  v_rows bigint;
  v_catalog_rows bigint;
  v_refreshed_at timestamptz := clock_timestamp();
BEGIN
  DELETE FROM public.orcom_adjustment_selection_snapshot WHERE true;
  INSERT INTO public.orcom_adjustment_selection_snapshot
  SELECT v.*, v_refreshed_at
  FROM public.orcom_adjustment_selection v;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  DELETE FROM public.orcom_adjustment_catalog WHERE true;
  INSERT INTO public.orcom_adjustment_catalog (adjustment_number)
  SELECT DISTINCT
    LPAD(s.adjustment_number, 5, '0') || '/' || s.adjustment_year ||
    CASE WHEN NULLIF(BTRIM(s.adjustment_letter), '') IS NULL
      THEN '' ELSE '-' || UPPER(BTRIM(s.adjustment_letter)) END
  FROM public.orcom_adjustment_selection_snapshot s;
  GET DIAGNOSTICS v_catalog_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'row_count', v_rows,
    'catalog_count', v_catalog_rows,
    'refreshed_at', v_refreshed_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_orcom_adjustment_selection_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_orcom_adjustment_selection_snapshot() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_orcom_adjustment_selection_snapshot() TO service_role;
