-- Mantém empenhos históricos e restringe somente pagamentos ao exercício de 2020 em diante.
do $$
declare view_sql text;
begin
  view_sql := pg_get_viewdef('public.orcom_adjustment_selection'::regclass,true);
  if position('AND r.exercise >= 2020) movement_data ON true' in view_sql)=0 then
    raise exception 'Não foi possível localizar o filtro de exercício esperado no resumo de movimentos.';
  end if;
  view_sql := replace(
    view_sql,
    'AND r.exercise >= 2020) movement_data ON true',
    'AND (r.file_type = ''empenho'' OR (r.file_type = ''pagamento'' AND r.exercise >= 2020))) movement_data ON true'
  );
  execute 'create or replace view public.orcom_adjustment_selection with (security_invoker = true) as ' || view_sql;
end
$$;