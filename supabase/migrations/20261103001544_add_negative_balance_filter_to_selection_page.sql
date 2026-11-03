-- Add the negative-balance filter to the server-paged adjustment selector.
DROP FUNCTION public.orcom_adjustment_selection_page(integer,integer,text,text,text);

CREATE OR REPLACE FUNCTION public.orcom_adjustment_selection_page(p_page integer DEFAULT 1, p_page_size integer DEFAULT 100, p_year text DEFAULT NULL::text, p_letter text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_negative_only boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH base AS MATERIALIZED (
    SELECT * FROM public.orcom_adjustment_selection
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
    )
  );
$function$;
REVOKE ALL ON FUNCTION public.orcom_adjustment_selection_page(integer,integer,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orcom_adjustment_selection_page(integer,integer,text,text,text,boolean) TO authenticated;
