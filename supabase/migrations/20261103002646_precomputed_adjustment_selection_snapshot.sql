-- Persist the privacy-safe adjustment projection so the UI does not recompute
-- the ORCOM history aggregation each time the selector is opened.
-- Source import rows and the sanitized source view are not modified by this snapshot.

CREATE TABLE public.orcom_adjustment_selection_snapshot AS
SELECT v.*, now()::timestamptz AS snapshot_refreshed_at
FROM public.orcom_adjustment_selection v
WITH NO DATA;

ALTER TABLE public.orcom_adjustment_selection_snapshot
  ADD CONSTRAINT orcom_adjustment_selection_snapshot_pkey PRIMARY KEY (adjustment_key);

ALTER TABLE public.orcom_adjustment_selection_snapshot ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.orcom_adjustment_selection_snapshot FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.orcom_adjustment_selection_snapshot TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orcom_adjustment_selection_snapshot TO service_role;

CREATE POLICY "allowlisted users can read adjustment selection snapshot"
ON public.orcom_adjustment_selection_snapshot
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.panel_users pu
    WHERE pu.email = lower(COALESCE(((SELECT auth.jwt()) ->> 'email'), ''))
      AND pu.is_active = true
  )
);

-- Rebuild is atomic: readers see the previous complete snapshot or the new
-- complete snapshot, never a partially refreshed selection.
CREATE OR REPLACE FUNCTION public.refresh_orcom_adjustment_selection_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_rows bigint;
  v_refreshed_at timestamptz := clock_timestamp();
BEGIN
  DELETE FROM public.orcom_adjustment_selection_snapshot;

  INSERT INTO public.orcom_adjustment_selection_snapshot
  SELECT v.*, v_refreshed_at
  FROM public.orcom_adjustment_selection v;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'row_count', v_rows,
    'refreshed_at', v_refreshed_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_orcom_adjustment_selection_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_orcom_adjustment_selection_snapshot() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_orcom_adjustment_selection_snapshot() TO service_role;

-- The paginated API reads the prepared snapshot, never the expensive historical view.
CREATE OR REPLACE FUNCTION public.orcom_adjustment_selection_page(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 100,
  p_year text DEFAULT NULL,
  p_letter text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_negative_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  WITH base AS MATERIALIZED (
    SELECT * FROM public.orcom_adjustment_selection_snapshot
  ),
  filtered AS MATERIALIZED (
    SELECT b.*
    FROM base b
    WHERE
      (NULLIF(BTRIM(p_year), '') IS NULL OR b.adjustment_year = BTRIM(p_year))
      AND (NULLIF(BTRIM(p_letter), '') IS NULL OR UPPER(COALESCE(b.adjustment_letter, '')) = UPPER(BTRIM(p_letter)))
      AND (NOT COALESCE(p_negative_only,false) OR (b.total_cadastrado - b.total_empenhado) < 0)
      AND (
        NULLIF(BTRIM(p_search), '') IS NULL
        OR REGEXP_REPLACE(
          UPPER(COALESCE(b.adjustment_number, '') || COALESCE(b.adjustment_year, '') || COALESCE(b.adjustment_letter, '') || COALESCE(b.entity, '')),
          '[^A-Z0-9]', '', 'g'
        ) LIKE '%' || REGEXP_REPLACE(UPPER(BTRIM(p_search)), '[^A-Z0-9]', '', 'g') || '%'
      )
  ),
  page_rows AS (
    SELECT *
    FROM filtered
    ORDER BY adjustment_year DESC, adjustment_number DESC, adjustment_letter ASC
    LIMIT LEAST(GREATEST(COALESCE(p_page_size, 100), 1), 100)
    OFFSET (GREATEST(COALESCE(p_page, 1), 1) - 1) * LEAST(GREATEST(COALESCE(p_page_size, 100), 1), 100)
  )
  SELECT jsonb_build_object(
    'page', GREATEST(COALESCE(p_page, 1), 1),
    'page_size', LEAST(GREATEST(COALESCE(p_page_size, 100), 1), 100),
    'total_count', (SELECT COUNT(*) FROM filtered),
    'rows', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.adjustment_year DESC, p.adjustment_number DESC, p.adjustment_letter ASC) FROM page_rows p),
      '[]'::jsonb
    ),
    'years', COALESCE(
      (SELECT jsonb_agg(y ORDER BY y DESC)
       FROM (SELECT DISTINCT adjustment_year AS y FROM base WHERE NULLIF(adjustment_year, '') IS NOT NULL) years),
      '[]'::jsonb
    ),
    'letters', COALESCE(
      (SELECT jsonb_agg(l ORDER BY l ASC)
       FROM (SELECT DISTINCT adjustment_letter AS l FROM base WHERE NULLIF(adjustment_letter, '') IS NOT NULL) letters),
      '[]'::jsonb
    ),
    'snapshot_refreshed_at', (SELECT max(snapshot_refreshed_at) FROM base)
  );
$function$;

REVOKE ALL ON FUNCTION public.orcom_adjustment_selection_page(integer,integer,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orcom_adjustment_selection_page(integer,integer,text,text,text,boolean) TO authenticated;

-- Create the first complete snapshot from the current valid imports.
SELECT public.refresh_orcom_adjustment_selection_snapshot();
