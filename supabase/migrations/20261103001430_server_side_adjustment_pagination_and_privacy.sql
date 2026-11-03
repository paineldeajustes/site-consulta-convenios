-- Server-side pagination, aggregated movement context and privacy-safe adjustment selection.
-- Original CadConvenios import rows are preserved; the public query view excludes only sensitive extra_fields.

CREATE OR REPLACE VIEW public.orcom_adjustment_selection
WITH (security_invoker = true)
AS
WITH latest_cad AS (
         SELECT ret_fontes_imports.id
           FROM ret_fontes_imports
          WHERE ret_fontes_imports.file_name = 'CadConvenios.txt'::text AND ret_fontes_imports.status = 'success'::text
          ORDER BY ret_fontes_imports.finished_at DESC
         LIMIT 1
        ), latest_ret AS (
         SELECT ret_fontes_imports.id
           FROM ret_fontes_imports
          WHERE ret_fontes_imports.file_name = 'RET_FONTES.txt'::text AND ret_fontes_imports.status = 'success'::text
          ORDER BY ret_fontes_imports.finished_at DESC
         LIMIT 1
        ), successful_payment_imports AS (
         SELECT orcom_file_imports.id
           FROM orcom_file_imports
          WHERE orcom_file_imports.status = 'success'::text AND orcom_file_imports.file_type = 'pagamento'::text AND orcom_file_imports.exercise >= 2020
        ), recent_payment_keys AS (
         SELECT DISTINCT r.adjustment_key
           FROM successful_payment_imports spi
             JOIN orcom_movement_rows r ON r.import_id = spi.id
          WHERE r.file_type = 'pagamento'::text AND r.exercise >= 2020 AND (r.transaction_kind = ANY (ARRAY['O'::text, 'R'::text])) AND r.adjustment_key IS NOT NULL
        ), eligible_cad AS (
         SELECT c_1.fields,
            NULLIF(TRIM(BOTH FROM c_1.fields ->> 'join_key'::text), ''::text) AS adjustment_key,
            TRIM(BOTH FROM COALESCE(c_1.fields ->> 'year'::text, ''::text)) AS adjustment_year,
            TRIM(BOTH FROM COALESCE(c_1.fields ->> 'number'::text, ''::text)) AS adjustment_number,
            upper(TRIM(BOTH FROM COALESCE(c_1.fields ->> 'letter'::text, ''::text))) AS adjustment_letter,
            TRIM(BOTH FROM COALESCE(c_1.fields ->> 'entity'::text, (c_1.fields -> 'extra_fields'::text) ->> 'R-SOCIAL'::text, ''::text)) AS entity
           FROM ret_fontes_rows c_1
             JOIN latest_cad lc ON lc.id = c_1.import_id
          WHERE upper(TRIM(BOTH FROM COALESCE((c_1.fields -> 'extra_fields'::text) ->> 'AJUSTE2'::text, ''::text))) = 'CONCEDIDO'::text AND NULLIF(TRIM(BOTH FROM c_1.fields ->> 'join_key'::text), ''::text) IS NOT NULL AND (EXISTS ( SELECT 1
                   FROM recent_payment_keys p
                  WHERE p.adjustment_key = (c_1.fields ->> 'join_key'::text)))
        )
 SELECT c.adjustment_key,
    c.adjustment_year,
    c.adjustment_number,
    c.adjustment_letter,
    c.entity,
    jsonb_set(c.fields, '{extra_fields}'::text[], COALESCE(c.fields -> 'extra_fields'::text, '{}'::jsonb) - ARRAY['DIRETORIA'::text, 'CPF'::text, 'DT-INI_1'::text, 'DT-FIM_2'::text, 'CONSELHO1'::text, 'CONSELHO2'::text, 'CONSELHO3'::text, 'CONSELHO4'::text, 'DT-INI_3'::text, 'DT-FIM_4'::text, 'IRREGULAR'::text, 'MOTIVO'::text, 'CEP'::text, 'TEL'::text, 'EMAIL-ENT'::text, 'CARGO-DIR'::text, 'EMAIL-DIR'::text, 'TP2_AJ'::text, 'COD-FORNEC'::text, 'SDO-CONVENIO'::text], true) AS fields,
    COALESCE(ret_data.initial_amount, 0::numeric)::numeric(18,2) AS total_cadastrado_inicial,
    COALESCE(ret_data.amendment_amount, 0::numeric)::numeric(18,2) AS total_cadastrado_aditamentos,
    (COALESCE(ret_data.initial_amount, 0::numeric) + COALESCE(ret_data.amendment_amount, 0::numeric))::numeric(18,2) AS total_cadastrado,
    COALESCE(movement_data.total_empenhado, 0::numeric)::numeric(18,2) AS total_empenhado,
    COALESCE(movement_data.total_pago_bruto, 0::numeric)::numeric(18,2) AS total_pago_bruto,
    COALESCE(movement_data.total_pago_valido, 0::numeric)::numeric(18,2) AS total_pago_valido,
    COALESCE(movement_data.quantidade_empenhos, 0::bigint) AS quantidade_empenhos,
    COALESCE(movement_data.quantidade_movimentos_pagamento, 0::bigint) AS quantidade_movimentos_pagamento
   FROM eligible_cad c
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(
                CASE
                    WHEN upper(TRIM(BOTH FROM COALESCE(r.fields ->> 4, ''::text))) = 'V'::text THEN COALESCE(NULLIF(replace(regexp_replace(regexp_replace(COALESCE(r.fields ->> 6, ''::text), '[^0-9,.-]'::text, ''::text, 'g'::text), '\.'::text, ''::text, 'g'::text), ','::text, '.'::text), ''::text)::numeric, 0::numeric) + COALESCE(NULLIF(replace(regexp_replace(regexp_replace(COALESCE(r.fields ->> 7, ''::text), '[^0-9,.-]'::text, ''::text, 'g'::text), '\.'::text, ''::text, 'g'::text), ','::text, '.'::text), ''::text)::numeric, 0::numeric) + COALESCE(NULLIF(replace(regexp_replace(regexp_replace(COALESCE(r.fields ->> 8, ''::text), '[^0-9,.-]'::text, ''::text, 'g'::text), '\.'::text, ''::text, 'g'::text), ','::text, '.'::text), ''::text)::numeric, 0::numeric)
                    ELSE 0::numeric
                END), 0::numeric) AS initial_amount,
            COALESCE(sum(
                CASE
                    WHEN upper(TRIM(BOTH FROM COALESCE(r.fields ->> 4, ''::text))) = 'A'::text THEN COALESCE(NULLIF(replace(regexp_replace(regexp_replace(COALESCE(r.fields ->> 6, ''::text), '[^0-9,.-]'::text, ''::text, 'g'::text), '\.'::text, ''::text, 'g'::text), ','::text, '.'::text), ''::text)::numeric, 0::numeric) + COALESCE(NULLIF(replace(regexp_replace(regexp_replace(COALESCE(r.fields ->> 7, ''::text), '[^0-9,.-]'::text, ''::text, 'g'::text), '\.'::text, ''::text, 'g'::text), ','::text, '.'::text), ''::text)::numeric, 0::numeric) + COALESCE(NULLIF(replace(regexp_replace(regexp_replace(COALESCE(r.fields ->> 8, ''::text), '[^0-9,.-]'::text, ''::text, 'g'::text), '\.'::text, ''::text, 'g'::text), ','::text, '.'::text), ''::text)::numeric, 0::numeric)
                    ELSE 0::numeric
                END), 0::numeric) AS amendment_amount
           FROM ret_fontes_rows r
          WHERE r.import_id = (( SELECT latest_ret.id
                   FROM latest_ret)) AND ((SUBSTRING(regexp_replace(COALESCE(r.fields ->> 0, ''::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text) FROM 5 FOR 5) || SUBSTRING(regexp_replace(COALESCE(r.fields ->> 0, ''::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text) FROM 1 FOR 4)) || SUBSTRING(regexp_replace(COALESCE(r.fields ->> 0, ''::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text) FROM 10)) = c.adjustment_key) ret_data ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(r.amount) FILTER (WHERE r.file_type = 'empenho'::text), 0::numeric) AS total_empenhado,
            COALESCE(sum(r.amount) FILTER (WHERE r.file_type = 'pagamento'::text AND (r.transaction_kind = ANY (ARRAY['O'::text, 'R'::text]))), 0::numeric) AS total_pago_bruto,
            COALESCE(sum(r.amount) FILTER (WHERE r.file_type = 'pagamento'::text AND r.is_valid_payment = true), 0::numeric) AS total_pago_valido,
            count(*) FILTER (WHERE r.file_type = 'empenho'::text) AS quantidade_empenhos,
            count(*) FILTER (WHERE r.file_type = 'pagamento'::text AND (r.transaction_kind = ANY (ARRAY['O'::text, 'R'::text]))) AS quantidade_movimentos_pagamento
           FROM orcom_movement_rows r
             JOIN orcom_file_imports i ON i.id = r.import_id
          WHERE r.adjustment_key = c.adjustment_key AND i.status = 'success'::text AND (r.file_type = 'empenho'::text OR r.file_type = 'pagamento'::text AND r.exercise >= 2020)) movement_data ON true;

CREATE OR REPLACE FUNCTION public.orcom_adjustment_selection_page(p_page integer DEFAULT 1, p_page_size integer DEFAULT 100, p_year text DEFAULT NULL::text, p_letter text DEFAULT NULL::text, p_search text DEFAULT NULL::text)
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

CREATE OR REPLACE FUNCTION public.orcom_adjustment_movement_context(p_adjustment_key text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH movements AS MATERIALIZED (
    SELECT
      r.file_type,
      r.exercise,
      r.document_number,
      r.fields,
      r.amount,
      r.category_code,
      r.source_code,
      r.transaction_kind,
      r.date_value,
      r.is_valid_payment
    FROM public.orcom_movement_rows r
    JOIN public.orcom_file_imports i ON i.id = r.import_id
    WHERE r.adjustment_key = p_adjustment_key
      AND i.status = 'success'
      AND (
        r.file_type = 'empenho'
        OR (r.file_type = 'pagamento' AND r.exercise >= 2020 AND r.transaction_kind IN ('O','R'))
      )
  ),
  summary AS (
    SELECT
      COUNT(*) FILTER (WHERE file_type = 'empenho') AS empenho_count,
      COUNT(*) FILTER (WHERE file_type = 'pagamento') AS pagamento_count,
      COALESCE(SUM(amount) FILTER (WHERE file_type = 'empenho'),0) AS total_empenhado,
      COALESCE(SUM(amount) FILTER (WHERE file_type = 'pagamento'),0) AS total_pago_bruto,
      COALESCE(SUM(amount) FILTER (WHERE file_type = 'pagamento' AND is_valid_payment = true),0) AS total_pago_valido
    FROM movements
  ),
  source_summary AS (
    SELECT
      COALESCE(source_code,'') AS source_code,
      COALESCE(SUM(amount) FILTER (WHERE file_type='empenho'),0) AS total_empenhado,
      COALESCE(SUM(amount) FILTER (WHERE file_type='pagamento'),0) AS total_pago_bruto,
      COALESCE(SUM(amount) FILTER (WHERE file_type='pagamento' AND is_valid_payment=true),0) AS total_pago_valido
    FROM movements
    GROUP BY COALESCE(source_code,'')
  ),
  emp_years AS (
    SELECT DISTINCT COALESCE(NULLIF(fields->>'ANO-NE',''),exercise::text) AS value
    FROM movements WHERE file_type='empenho'
  ),
  emp_numbers AS (
    SELECT DISTINCT
      COALESCE(
        NULLIF(BTRIM(fields->>'NUM-NE'),'') || '/' || COALESCE(NULLIF(BTRIM(fields->>'ANO-NE'),''),exercise::text),
        NULLIF(BTRIM(document_number),'')
      ) AS value
    FROM movements WHERE file_type='empenho'
  ),
  emp_sources AS (
    SELECT DISTINCT source_code AS value FROM movements WHERE file_type='empenho' AND source_code IS NOT NULL
  ),
  emp_custeio AS (
    SELECT DISTINCT amount AS value FROM movements WHERE file_type='empenho' AND category_code='3' AND amount IS NOT NULL
  ),
  emp_capital AS (
    SELECT DISTINCT amount AS value FROM movements WHERE file_type='empenho' AND category_code='4' AND amount IS NOT NULL
  ),
  pay_years AS (
    SELECT DISTINCT EXTRACT(YEAR FROM date_value)::integer AS value
    FROM movements WHERE file_type='pagamento' AND date_value IS NOT NULL
  ),
  pay_ops AS (
    SELECT DISTINCT COALESCE(NULLIF(BTRIM(fields->>'OP'),''),NULLIF(BTRIM(document_number),'')) AS value
    FROM movements WHERE file_type='pagamento'
  ),
  pay_numbers AS (
    SELECT DISTINCT
      CASE
        WHEN BTRIM(COALESCE(fields->>'EMPENHO','')) ~ '^[0-9]{9}$'
          THEN SUBSTRING(BTRIM(fields->>'EMPENHO') FROM 5 FOR 5) || '/' || SUBSTRING(BTRIM(fields->>'EMPENHO') FROM 1 FOR 4)
        ELSE NULLIF(BTRIM(fields->>'EMPENHO'),'')
      END AS value
    FROM movements WHERE file_type='pagamento'
  ),
  pay_sources AS (
    SELECT DISTINCT source_code AS value FROM movements WHERE file_type='pagamento' AND source_code IS NOT NULL
  ),
  pay_custeio AS (
    SELECT DISTINCT amount AS value FROM movements WHERE file_type='pagamento' AND category_code='3' AND amount IS NOT NULL
  ),
  pay_capital AS (
    SELECT DISTINCT amount AS value FROM movements WHERE file_type='pagamento' AND category_code='4' AND amount IS NOT NULL
  )
  SELECT jsonb_build_object(
    'summary', (SELECT to_jsonb(summary) FROM summary),
    'sources', COALESCE(
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.source_code) FROM source_summary s),
      '[]'::jsonb
    ),
    'facets', jsonb_build_object(
      'empenhos', jsonb_build_object(
        'years', COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM emp_years WHERE value IS NOT NULL),'[]'::jsonb),
        'numbers', COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM emp_numbers WHERE value IS NOT NULL),'[]'::jsonb),
        'sources', COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM emp_sources WHERE value IS NOT NULL),'[]'::jsonb),
        'custeio', COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM emp_custeio WHERE value IS NOT NULL),'[]'::jsonb),
        'capital', COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM emp_capital WHERE value IS NOT NULL),'[]'::jsonb)
      ),
      'pagamentos', jsonb_build_object(
        'years', COALESCE((SELECT jsonb_agg(value ORDER BY value DESC) FROM pay_years WHERE value IS NOT NULL),'[]'::jsonb),
        'ops', COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM pay_ops WHERE value IS NOT NULL),'[]'::jsonb),
        'empenhos', COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM pay_numbers WHERE value IS NOT NULL),'[]'::jsonb),
        'sources', COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM pay_sources WHERE value IS NOT NULL),'[]'::jsonb),
        'custeio', COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM pay_custeio WHERE value IS NOT NULL),'[]'::jsonb),
        'capital', COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM pay_capital WHERE value IS NOT NULL),'[]'::jsonb)
      )
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.orcom_adjustment_movement_page(p_adjustment_key text, p_file_type text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 100, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH base AS MATERIALIZED (
    SELECT r.*
    FROM public.orcom_movement_rows r
    JOIN public.orcom_file_imports i ON i.id = r.import_id
    WHERE r.adjustment_key = p_adjustment_key
      AND i.status = 'success'
      AND (
        (p_file_type = 'empenho' AND r.file_type = 'empenho')
        OR
        (p_file_type = 'pagamento' AND r.file_type = 'pagamento' AND r.exercise >= 2020 AND r.transaction_kind IN ('O','R'))
      )
  ),
  filtered AS MATERIALIZED (
    SELECT b.*
    FROM base b
    WHERE
      (
        NULLIF(COALESCE(p_filters->>'year',''),'') IS NULL
        OR (
          p_file_type='empenho'
          AND COALESCE(NULLIF(BTRIM(b.fields->>'ANO-NE'),''),b.exercise::text) = p_filters->>'year'
        )
        OR (
          p_file_type='pagamento'
          AND b.date_value IS NOT NULL
          AND EXTRACT(YEAR FROM b.date_value)::text = p_filters->>'year'
        )
      )
      AND (
        NULLIF(COALESCE(p_filters->>'number',''),'') IS NULL
        OR (
          p_file_type='empenho'
          AND COALESCE(
            NULLIF(BTRIM(b.fields->>'NUM-NE'),'') || '/' || COALESCE(NULLIF(BTRIM(b.fields->>'ANO-NE'),''),b.exercise::text),
            NULLIF(BTRIM(b.document_number),'')
          ) = p_filters->>'number'
        )
        OR (
          p_file_type='pagamento'
          AND (
            CASE
              WHEN BTRIM(COALESCE(b.fields->>'EMPENHO','')) ~ '^[0-9]{9}$'
                THEN SUBSTRING(BTRIM(b.fields->>'EMPENHO') FROM 5 FOR 5) || '/' || SUBSTRING(BTRIM(b.fields->>'EMPENHO') FROM 1 FOR 4)
              ELSE NULLIF(BTRIM(b.fields->>'EMPENHO'),'')
            END
          ) = p_filters->>'number'
        )
      )
      AND (
        NULLIF(COALESCE(p_filters->>'source',''),'') IS NULL
        OR COALESCE(b.source_code,'') = p_filters->>'source'
      )
      AND (
        NULLIF(COALESCE(p_filters->>'custeio',''),'') IS NULL
        OR (
          (p_filters->>'custeio') ~ '^-?[0-9]+([.][0-9]+)?$'
          AND b.category_code='3'
          AND b.amount=(p_filters->>'custeio')::numeric
        )
      )
      AND (
        NULLIF(COALESCE(p_filters->>'capital',''),'') IS NULL
        OR (
          (p_filters->>'capital') ~ '^-?[0-9]+([.][0-9]+)?$'
          AND b.category_code='4'
          AND b.amount=(p_filters->>'capital')::numeric
        )
      )
      AND (
        p_file_type <> 'pagamento'
        OR NULLIF(COALESCE(p_filters->>'date_from',''),'') IS NULL
        OR b.date_value >= (p_filters->>'date_from')::date
      )
      AND (
        p_file_type <> 'pagamento'
        OR NULLIF(COALESCE(p_filters->>'date_to',''),'') IS NULL
        OR b.date_value <= (p_filters->>'date_to')::date
      )
      AND (
        p_file_type <> 'pagamento'
        OR NULLIF(COALESCE(p_filters->>'quadrimester',''),'') IS NULL
        OR (
          EXTRACT(MONTH FROM b.date_value) >= ((p_filters->>'quadrimester')::integer - 1) * 4 + 1
          AND EXTRACT(MONTH FROM b.date_value) <= (p_filters->>'quadrimester')::integer * 4
        )
      )
      AND (
        p_file_type <> 'pagamento'
        OR NULLIF(COALESCE(p_filters->>'op',''),'') IS NULL
        OR COALESCE(NULLIF(BTRIM(b.fields->>'OP'),''),NULLIF(BTRIM(b.document_number),'')) = p_filters->>'op'
      )
  ),
  totals AS (
    SELECT
      COUNT(*) AS total_count,
      COALESCE(SUM(amount),0) AS total_amount,
      COALESCE(SUM(amount) FILTER (WHERE category_code='3'),0) AS total_custeio,
      COALESCE(SUM(amount) FILTER (WHERE category_code='4'),0) AS total_capital,
      COALESCE(SUM(amount) FILTER (WHERE category_code NOT IN ('3','4') OR category_code IS NULL),0) AS total_other,
      COALESCE(SUM(amount) FILTER (WHERE p_file_type='pagamento' AND is_valid_payment=true),0) AS total_valid,
      COUNT(*) FILTER (WHERE p_file_type='pagamento' AND is_valid_payment IS DISTINCT FROM true) AS exceptions
    FROM filtered
  ),
  page_rows AS (
    SELECT *
    FROM filtered
    ORDER BY
      CASE WHEN p_file_type='empenho' THEN exercise END ASC NULLS LAST,
      CASE WHEN p_file_type='pagamento' THEN date_value END DESC NULLS LAST,
      exercise ASC,
      row_number ASC
    LIMIT LEAST(GREATEST(COALESCE(p_page_size,100),1),1000)
    OFFSET (GREATEST(COALESCE(p_page,1),1)-1) * LEAST(GREATEST(COALESCE(p_page_size,100),1),1000)
  )
  SELECT jsonb_build_object(
    'page', GREATEST(COALESCE(p_page,1),1),
    'page_size', LEAST(GREATEST(COALESCE(p_page_size,100),1),1000),
    'total_count', (SELECT total_count FROM totals),
    'totals', (SELECT to_jsonb(totals) FROM totals),
    'rows', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY
        CASE WHEN p_file_type='empenho' THEN p.exercise END ASC NULLS LAST,
        CASE WHEN p_file_type='pagamento' THEN p.date_value END DESC NULLS LAST,
        p.exercise ASC,p.row_number ASC)
       FROM page_rows p),
      '[]'::jsonb
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.orcom_adjustment_selection_page(integer,integer,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.orcom_adjustment_movement_context(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.orcom_adjustment_movement_page(text,text,integer,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orcom_adjustment_selection_page(integer,integer,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.orcom_adjustment_movement_context(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.orcom_adjustment_movement_page(text,text,integer,integer,jsonb) TO authenticated;
