-- Consulta de Ajustes V2: tabela compacta pré-calculada após importar RET/Cad.
-- Não depende de TXT_EMPENHO ou TXT_PAGAMENTO.
CREATE TABLE IF NOT EXISTS public.panel_v2_cache (
 adjustment_number text PRIMARY KEY REFERENCES public.orcom_adjustment_catalog(adjustment_number),
 payload jsonb NOT NULL,
 refreshed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.panel_v2_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panel_v2_cache FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.panel_v2_cache TO authenticated;
GRANT ALL ON public.panel_v2_cache TO service_role;
DROP POLICY IF EXISTS "panel_v2_read_for_allowlisted_users" ON public.panel_v2_cache;
CREATE POLICY "panel_v2_read_for_allowlisted_users"
 ON public.panel_v2_cache FOR SELECT TO authenticated
 USING (EXISTS (
   SELECT 1 FROM public.panel_users p
   WHERE p.email=lower(coalesce((select auth.jwt())->>'email',''))
     AND p.is_active=true
 ));

CREATE OR REPLACE FUNCTION public.panel_v2_money(p_value text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v text;
BEGIN
  v := regexp_replace(btrim(p_value),'[^0-9,.-]','','g');
  v := replace(replace(v,'.',''),',','.');
  IF v ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    RETURN v::numeric;
  END IF;
  RETURN 0;
END
$function$

REVOKE ALL ON FUNCTION public.panel_v2_money(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panel_v2_money(text) TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_panel_v2_cache()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '120s'
AS $function$
DECLARE v_count int; v_at timestamptz := clock_timestamp();
BEGIN
 DELETE FROM public.panel_v2_cache WHERE true;
 WITH
 current_ret AS (
   SELECT f.row_number, f.fields a,
      upper(regexp_replace(coalesce(f.fields->>0,''),'[^A-Za-z0-9]','','g')) compact
   FROM public.ret_fontes_rows f
   WHERE f.import_id = (
      SELECT id FROM public.ret_fontes_imports
      WHERE file_name='RET_FONTES.txt' AND status='success'
      ORDER BY finished_at DESC LIMIT 1
   )
 ),
 groups AS (
  SELECT compact, count(*) ret_lines,
   coalesce(jsonb_agg(jsonb_build_object(
    'row',row_number,
    'type',btrim(coalesce(a->>4,'')),
    'source',btrim(coalesce(a->>5,'')),
    'amendment_type',btrim(coalesce(a->>2,'')),
    'amendment_number',btrim(coalesce(a->>3,'')),
    'custeio',public.panel_v2_money(coalesce(a->>7,'')),
    'reforma',public.panel_v2_money(coalesce(a->>8,'')),
    'bem',public.panel_v2_money(coalesce(a->>6,''))
   ) ORDER BY row_number)
    FILTER(WHERE upper(btrim(coalesce(a->>4,''))) IN ('V','A')),'[]'::jsonb) registered,
   coalesce(jsonb_agg(jsonb_build_object(
     'row',row_number,'empenho',btrim(a->>9),
     'year',btrim(coalesce(a->>14,'')),
     'month',btrim(coalesce(a->>15,'')),
     'day',btrim(coalesce(a->>16,'')),
     'source',btrim(coalesce(a->>13,'')),
     'custeio',public.panel_v2_money(coalesce(a->>11,'')),
     'capital',public.panel_v2_money(coalesce(a->>12,'')),
     'total',CASE WHEN nullif(btrim(coalesce(a->>10,'')),'') IS NOT NULL
        THEN public.panel_v2_money(a->>10)
        ELSE public.panel_v2_money(coalesce(a->>11,'')) + public.panel_v2_money(coalesce(a->>12,'')) END
   ) ORDER BY row_number)
    FILTER(WHERE nullif(btrim(coalesce(a->>9,'')),'') IS NOT NULL),'[]'::jsonb) empenhos,
   coalesce(jsonb_agg(jsonb_build_object(
     'row',row_number,'op',btrim(a->>17),
     'empenho',btrim(coalesce(a->>18,'')),
     'year',btrim(coalesce(a->>23,'')),
     'month',btrim(coalesce(a->>24,'')),
     'day',btrim(coalesce(a->>25,'')),
     'source',btrim(coalesce(a->>22,'')),
     'custeio',public.panel_v2_money(coalesce(a->>20,'')),
     'capital',public.panel_v2_money(coalesce(a->>21,'')),
     'total',CASE WHEN nullif(btrim(coalesce(a->>19,'')),'') IS NOT NULL
        THEN public.panel_v2_money(a->>19)
        ELSE public.panel_v2_money(coalesce(a->>20,'')) + public.panel_v2_money(coalesce(a->>21,'')) END
   ) ORDER BY row_number)
    FILTER(WHERE nullif(btrim(coalesce(a->>17,'')),'') IS NOT NULL
      AND btrim(coalesce(a->>23,'')) ~ '^20[0-9]{2}$'
      AND btrim(a->>23)>='2020'),'[]'::jsonb) pagamentos
  FROM current_ret
  WHERE compact <> ''
  GROUP BY compact
 )
 INSERT INTO public.panel_v2_cache(adjustment_number,payload,refreshed_at)
 SELECT
  c.adjustment_number,
  jsonb_build_object(
    'number',c.adjustment_number,
    'year',coalesce(s.adjustment_year,''),
    'letter',coalesce(s.adjustment_letter,''),
    'entity',coalesce(s.entity,''),
    'process',coalesce(s.fields->>'process',''),
    'object',coalesce(s.fields->>'object',''),
    'type_code',coalesce(s.fields->>'type_code',''),
    'signed',coalesce(s.fields->>'signed_date',''),
    'valid_until',coalesce(s.fields->>'last_validity',''),
    'registered_initial',coalesce(s.total_cadastrado_inicial,0),
    'registered_amendments',coalesce(s.total_cadastrado_aditamentos,0),
    'registered_total',coalesce(s.total_cadastrado,0),
    'committed',coalesce(s.total_empenhado,0),
    'paid_ret',coalesce(s.total_pago_bruto,0),
    'ret_lines',coalesce(g.ret_lines,0),
    'registered',coalesce(g.registered,'[]'::jsonb),
    'empenhos',coalesce(g.empenhos,'[]'::jsonb),
    'pagamentos',coalesce(g.pagamentos,'[]'::jsonb)
  ),
  v_at
 FROM public.orcom_adjustment_catalog c
 LEFT JOIN public.orcom_adjustment_selection_snapshot s
   ON c.adjustment_number = lpad(s.adjustment_number,5,'0')||'/'||s.adjustment_year||
      CASE WHEN nullif(btrim(s.adjustment_letter),'') IS NULL
        THEN '' ELSE '-'||upper(btrim(s.adjustment_letter)) END
 LEFT JOIN groups g ON g.compact =
      upper(s.adjustment_year||lpad(s.adjustment_number,5,'0')||coalesce(s.adjustment_letter,''))
 ORDER BY c.adjustment_number;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count <> (SELECT count(*) FROM public.orcom_adjustment_catalog) THEN
   RAISE EXCEPTION 'Cache V2 incompleto: % ajustes',v_count;
 END IF;
 RETURN jsonb_build_object('success',true,'row_count',v_count,'refreshed_at',v_at);
END $function$

REVOKE ALL ON FUNCTION public.refresh_panel_v2_cache() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_panel_v2_cache() TO service_role;

CREATE OR REPLACE FUNCTION public.panel_v2_bundle()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
   'items',coalesce(jsonb_agg(payload ORDER BY adjustment_number),'[]'::jsonb),
   'count',count(*),
   'refreshed_at',max(refreshed_at)
  )
  FROM public.panel_v2_cache
$function$

REVOKE ALL ON FUNCTION public.panel_v2_bundle() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panel_v2_bundle() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.refresh_orcom_adjustment_selection_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '120s'
AS $function$
DECLARE v_rows bigint;v_catalog_rows bigint;v_at timestamptz := clock_timestamp();v_v2 jsonb;
BEGIN
 DELETE FROM public.orcom_adjustment_selection_snapshot WHERE true;
 INSERT INTO public.orcom_adjustment_selection_snapshot
 SELECT v.*,v_at FROM public.orcom_adjustment_selection v;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 SELECT count(*) INTO v_catalog_rows FROM public.orcom_adjustment_catalog;
 v_v2 := public.refresh_panel_v2_cache();
 RETURN jsonb_build_object(
   'success',true,'row_count',v_rows,'catalog_count',v_catalog_rows,
   'refreshed_at',v_at,'v2',v_v2
 );
END $function$

-- Primeira construção de dados via SELECT public.refresh_panel_v2_cache();
