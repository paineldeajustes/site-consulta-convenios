-- Initial adjustment-number catalogue and physical-row retention cleanup.
-- Import history rows in *_imports remain intact; only their superseded data rows are deleted.

CREATE TABLE IF NOT EXISTS public.orcom_adjustment_catalog (
  adjustment_key text PRIMARY KEY,
  adjustment_number text NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orcom_adjustment_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orcom_adjustment_catalog FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.orcom_adjustment_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orcom_adjustment_catalog TO service_role;

DROP POLICY IF EXISTS "active panel users read adjustment catalog"
  ON public.orcom_adjustment_catalog;
CREATE POLICY "active panel users read adjustment catalog"
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

-- Keep the latest successful copy of each cadastro file only.
WITH latest_success AS (
  SELECT DISTINCT ON (file_name) id
  FROM public.ret_fontes_imports
  WHERE file_name IN ('RET_FONTES.txt','CadConvenios.txt')
    AND status = 'success'
  ORDER BY file_name, finished_at DESC, id DESC
)
DELETE FROM public.ret_fontes_rows r
WHERE r.import_id IN (
  SELECT i.id
  FROM public.ret_fontes_imports i
  WHERE i.file_name IN ('RET_FONTES.txt','CadConvenios.txt')
    AND i.id NOT IN (SELECT id FROM latest_success)
);

-- ORCOM history stays in orcom_file_imports; failed and superseded rows
-- have no value for the current consultation and can be removed physically.
DELETE FROM public.orcom_movement_rows r
WHERE r.import_id IN (
  SELECT i.id FROM public.orcom_file_imports i
  WHERE i.status IN ('failed','superseded')
);
