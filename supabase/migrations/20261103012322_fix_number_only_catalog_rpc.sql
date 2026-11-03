-- The selector receives only strings containing the adjustment numbers.
CREATE OR REPLACE FUNCTION public.get_orcom_adjustment_catalog()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT jsonb_build_object(
    'items',
      COALESCE(
        jsonb_agg(
          jsonb_build_object('number', adjustment_number)
          ORDER BY
            substring(adjustment_number from '/([0-9]{4})') DESC,
            substring(adjustment_number from '^([0-9]+)')::integer DESC,
            COALESCE(substring(adjustment_number from '-([A-Z0-9]+)$'), '') ASC
        ),
        '[]'::jsonb
      ),
    'count', COUNT(*)
  )
  FROM public.orcom_adjustment_catalog;
$function$;

REVOKE ALL ON FUNCTION public.get_orcom_adjustment_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_orcom_adjustment_catalog() TO authenticated;
