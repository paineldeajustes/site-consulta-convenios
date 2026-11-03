-- Mantém o catálogo permanente de 1.237 números e calcula todos os valores financeiros
-- com base nas linhas do RET_FONTES.txt. Nenhuma dependência dos antigos TXT ORCOM.
CREATE OR REPLACE VIEW public.orcom_adjustment_selection AS
WITH latest_cad AS (
  SELECT id FROM public.ret_fontes_imports
  WHERE file_name = 'CadConvenios.txt' AND status = 'success'
  ORDER BY finished_at DESC LIMIT 1
),
latest_ret AS (
  SELECT id FROM public.ret_fontes_imports
  WHERE file_name = 'RET_FONTES.txt' AND status = 'success'
  ORDER BY finished_at DESC LIMIT 1
),
catalog_cad AS (
  SELECT c.fields,
    NULLIF(BTRIM(c.fields->>'join_key'), '') AS adjustment_key,
    BTRIM(COALESCE(c.fields->>'year','')) AS adjustment_year,
    BTRIM(COALESCE(c.fields->>'number','')) AS adjustment_number,
    UPPER(BTRIM(COALESCE(c.fields->>'letter',''))) AS adjustment_letter,
    BTRIM(COALESCE(c.fields->>'entity', c.fields->'extra_fields'->>'R-SOCIAL','')) AS entity
  FROM public.ret_fontes_rows c
  JOIN latest_cad lc ON lc.id = c.import_id
  JOIN public.orcom_adjustment_catalog cat ON cat.adjustment_number =
    LPAD(BTRIM(COALESCE(c.fields->>'number','')), 5, '0') || '/' ||
    BTRIM(COALESCE(c.fields->>'year','')) ||
    CASE WHEN NULLIF(BTRIM(COALESCE(c.fields->>'letter','')), '') IS NULL
      THEN '' ELSE '-' || UPPER(BTRIM(c.fields->>'letter')) END
  WHERE UPPER(BTRIM(COALESCE(c.fields->'extra_fields'->>'AJUSTE2',''))) = 'CONCEDIDO'
    AND NULLIF(BTRIM(c.fields->>'join_key'), '') IS NOT NULL
),
ret_normalized AS (
  SELECT
    SUBSTRING(regexp_replace(COALESCE(r.fields->>0,''), '[^A-Za-z0-9]', '', 'g') FROM 5 FOR 5) ||
    SUBSTRING(regexp_replace(COALESCE(r.fields->>0,''), '[^A-Za-z0-9]', '', 'g') FROM 1 FOR 4) ||
    SUBSTRING(regexp_replace(COALESCE(r.fields->>0,''), '[^A-Za-z0-9]', '', 'g') FROM 10) AS adjustment_key,
    r.fields
  FROM public.ret_fontes_rows r
  JOIN latest_ret lr ON lr.id = r.import_id
),
ret_data AS (
  SELECT rn.adjustment_key,
    COALESCE(SUM(CASE WHEN UPPER(BTRIM(COALESCE(rn.fields->>4,''))) = 'V' THEN
      COALESCE(NULLIF(REPLACE(REPLACE(regexp_replace(COALESCE(rn.fields->>6,''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.'), '')::numeric,0) +
      COALESCE(NULLIF(REPLACE(REPLACE(regexp_replace(COALESCE(rn.fields->>7,''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.'), '')::numeric,0) +
      COALESCE(NULLIF(REPLACE(REPLACE(regexp_replace(COALESCE(rn.fields->>8,''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.'), '')::numeric,0)
      ELSE 0 END),0)::numeric(18,2) AS initial_amount,
    COALESCE(SUM(CASE WHEN UPPER(BTRIM(COALESCE(rn.fields->>4,''))) = 'A' THEN
      COALESCE(NULLIF(REPLACE(REPLACE(regexp_replace(COALESCE(rn.fields->>6,''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.'), '')::numeric,0) +
      COALESCE(NULLIF(REPLACE(REPLACE(regexp_replace(COALESCE(rn.fields->>7,''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.'), '')::numeric,0) +
      COALESCE(NULLIF(REPLACE(REPLACE(regexp_replace(COALESCE(rn.fields->>8,''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.'), '')::numeric,0)
      ELSE 0 END),0)::numeric(18,2) AS amendment_amount,
    COALESCE(SUM(CASE WHEN NULLIF(BTRIM(COALESCE(rn.fields->>9,'')), '') IS NOT NULL THEN
      COALESCE(NULLIF(REPLACE(REPLACE(regexp_replace(COALESCE(rn.fields->>10,''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.'), '')::numeric,
        COALESCE(NULLIF(REPLACE(REPLACE(regexp_replace(COALESCE(rn.fields->>11,''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.'), '')::numeric,0) +
        COALESCE(NULLIF(REPLACE(REPLACE(regexp_replace(COALESCE(rn.fields->>12,''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.'), '')::numeric,0))
      ELSE 0 END),0)::numeric(18,2) AS total_empenhado,
    COALESCE(SUM(CASE WHEN NULLIF(BTRIM(COALESCE(rn.fields->>17,'')), '') IS NOT NULL
      AND BTRIM(COALESCE(rn.fields->>23,'')) ~ '^20[0-9]{2}$'
      AND BTRIM(rn.fields->>23) >= '2020' THEN
      COALESCE(NULLIF(REPLACE(REPLACE(regexp_replace(COALESCE(rn.fields->>19,''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.'), '')::numeric,
        COALESCE(NULLIF(REPLACE(REPLACE(regexp_replace(COALESCE(rn.fields->>20,''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.'), '')::numeric,0) +
        COALESCE(NULLIF(REPLACE(REPLACE(regexp_replace(COALESCE(rn.fields->>21,''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.'), '')::numeric,0))
      ELSE 0 END),0)::numeric(18,2) AS total_pago_ret,
    COUNT(*) FILTER (WHERE NULLIF(BTRIM(COALESCE(rn.fields->>9,'')), '') IS NOT NULL) AS quantity_empenhos,
    COUNT(*) FILTER (WHERE NULLIF(BTRIM(COALESCE(rn.fields->>17,'')), '') IS NOT NULL
      AND BTRIM(COALESCE(rn.fields->>23,'')) ~ '^20[0-9]{2}$'
      AND BTRIM(rn.fields->>23) >= '2020') AS quantity_payments
  FROM ret_normalized rn GROUP BY rn.adjustment_key
)
SELECT c.adjustment_key,c.adjustment_year,c.adjustment_number,c.adjustment_letter,c.entity,
  jsonb_set(c.fields,'{extra_fields}',COALESCE(c.fields->'extra_fields','{}'::jsonb) -
    ARRAY['DIRETORIA','CPF','DT-INI_1','DT-FIM_2','CONSELHO1','CONSELHO2','CONSELHO3','CONSELHO4','DT-INI_3','DT-FIM_4','IRREGULAR','MOTIVO','CEP','TEL','EMAIL-ENT','CARGO-DIR','EMAIL-DIR','TP2_AJ','COD-FORNEC','SDO-CONVENIO'],true) AS fields,
  COALESCE(rd.initial_amount,0)::numeric(18,2) AS total_cadastrado_inicial,
  COALESCE(rd.amendment_amount,0)::numeric(18,2) AS total_cadastrado_aditamentos,
  (COALESCE(rd.initial_amount,0)+COALESCE(rd.amendment_amount,0))::numeric(18,2) AS total_cadastrado,
  COALESCE(rd.total_empenhado,0)::numeric(18,2) AS total_empenhado,
  COALESCE(rd.total_pago_ret,0)::numeric(18,2) AS total_pago_bruto,
  COALESCE(rd.total_pago_ret,0)::numeric(18,2) AS total_pago_valido,
  COALESCE(rd.quantity_empenhos,0)::bigint AS quantidade_empenhos,
  COALESCE(rd.quantity_payments,0)::bigint AS quantidade_movimentos_pagamento
FROM catalog_cad c LEFT JOIN ret_data rd ON rd.adjustment_key=c.adjustment_key;

CREATE OR REPLACE FUNCTION public.refresh_orcom_adjustment_selection_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET statement_timeout TO '120s'
AS $function$
DECLARE
  v_rows bigint;
  v_catalog_rows bigint;
  v_refreshed_at timestamptz := clock_timestamp();
BEGIN
  DELETE FROM public.orcom_adjustment_selection_snapshot WHERE true;
  INSERT INTO public.orcom_adjustment_selection_snapshot
  SELECT v.*,v_refreshed_at FROM public.orcom_adjustment_selection v;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  SELECT count(*) INTO v_catalog_rows FROM public.orcom_adjustment_catalog;
  RETURN jsonb_build_object('success',true,'row_count',v_rows,'catalog_count',v_catalog_rows,'refreshed_at',v_refreshed_at);
END;
$function$;
