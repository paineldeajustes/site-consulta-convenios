-- Authenticated panel users need the RET_FONTES rows only. CadConvenios source
-- rows contain sensitive responsible/contact fields and are read only by the
-- internal SECURITY DEFINER snapshot refresher, not directly over PostgREST.
DROP POLICY IF EXISTS "allowlisted users can read rows from successful imports"
ON public.ret_fontes_rows;

CREATE POLICY "allowlisted users can read successful RET_FONTES rows"
ON public.ret_fontes_rows
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ret_fontes_imports i
    WHERE i.id = ret_fontes_rows.import_id
      AND i.status = 'success'
      AND i.file_name = 'RET_FONTES.txt'
  )
  AND EXISTS (
    SELECT 1
    FROM public.panel_users pu
    WHERE pu.email = lower(COALESCE(((SELECT auth.jwt()) ->> 'email'), ''))
      AND pu.is_active = true
  )
);
