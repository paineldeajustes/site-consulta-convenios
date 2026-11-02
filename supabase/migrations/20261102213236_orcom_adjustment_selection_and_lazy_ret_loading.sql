-- Índices e visão inicial de seleção do Painel de Ajustes.
create index if not exists orcom_movement_rows_recent_payment_idx
  on public.orcom_movement_rows (exercise, adjustment_key)
  where file_type='pagamento' and transaction_kind in ('O','R');

create index if not exists ret_fontes_rows_import_convenio_idx
  on public.ret_fontes_rows (import_id, (fields->>0));

create index if not exists ret_fontes_rows_import_normalized_convenio_idx
  on public.ret_fontes_rows (
    import_id,
    (
      substring(regexp_replace(coalesce(fields->>0,''), '[^A-Za-z0-9]', '', 'g') from 6 for 5)
      || substring(regexp_replace(coalesce(fields->>0,''), '[^A-Za-z0-9]', '', 'g') from 1 for 4)
      || substring(regexp_replace(coalesce(fields->>0,''), '[^A-Za-z0-9]', '', 'g') from 11)
    )
  );

create or replace view public.orcom_adjustment_selection
with (security_invoker=true)
as
with latest_cad as (
  select id from public.ret_fontes_imports
  where file_name='CadConvenios.txt' and status='success'
  order by finished_at desc limit 1
),
latest_ret as (
  select id from public.ret_fontes_imports
  where file_name='RET_FONTES.txt' and status='success'
  order by finished_at desc limit 1
),
recent_payment_keys as (
  select distinct r.adjustment_key
  from public.orcom_movement_rows r
  join public.orcom_file_imports i on i.id=r.import_id
  where i.status='success'
    and r.file_type='pagamento'
    and r.exercise>=2020
    and r.transaction_kind in ('O','R')
    and r.adjustment_key is not null
),
eligible_cad as (
  select
    c.fields,
    nullif(trim(c.fields->>'join_key'),'') as adjustment_key,
    trim(coalesce(c.fields->>'year','')) as adjustment_year,
    trim(coalesce(c.fields->>'number','')) as adjustment_number,
    upper(trim(coalesce(c.fields->>'letter',''))) as adjustment_letter,
    trim(coalesce(c.fields->>'entity',c.fields->'extra_fields'->>'R-SOCIAL','')) as entity
  from public.ret_fontes_rows c
  join latest_cad lc on lc.id=c.import_id
  where upper(trim(coalesce(c.fields->'extra_fields'->>'AJUSTE2','')))='CONCEDIDO'
    and nullif(trim(c.fields->>'join_key'),'') is not null
    and exists(select 1 from recent_payment_keys p where p.adjustment_key=c.fields->>'join_key')
)
select
  c.adjustment_key,c.adjustment_year,c.adjustment_number,c.adjustment_letter,c.entity,c.fields,
  coalesce(ret_data.initial_amount,0)::numeric(18,2) as total_cadastrado_inicial,
  coalesce(ret_data.amendment_amount,0)::numeric(18,2) as total_cadastrado_aditamentos,
  (coalesce(ret_data.initial_amount,0)+coalesce(ret_data.amendment_amount,0))::numeric(18,2) as total_cadastrado,
  coalesce(movement_data.total_empenhado,0)::numeric(18,2) as total_empenhado,
  coalesce(movement_data.total_pago_bruto,0)::numeric(18,2) as total_pago_bruto,
  coalesce(movement_data.total_pago_valido,0)::numeric(18,2) as total_pago_valido,
  coalesce(movement_data.quantidade_empenhos,0)::bigint as quantidade_empenhos,
  coalesce(movement_data.quantidade_movimentos_pagamento,0)::bigint as quantidade_movimentos_pagamento
from eligible_cad c
left join lateral (
  select
    coalesce(sum(case when upper(trim(coalesce(r.fields->>4,'')))='V' then
      coalesce(nullif(replace(regexp_replace(regexp_replace(coalesce(r.fields->>6,''),'[^0-9,.-]','','g'),'\.','','g'),',','.'),'')::numeric,0)
      +coalesce(nullif(replace(regexp_replace(regexp_replace(coalesce(r.fields->>7,''),'[^0-9,.-]','','g'),'\.','','g'),',','.'),'')::numeric,0)
      +coalesce(nullif(replace(regexp_replace(regexp_replace(coalesce(r.fields->>8,''),'[^0-9,.-]','','g'),'\.','','g'),',','.'),'')::numeric,0)
      else 0 end),0) as initial_amount,
    coalesce(sum(case when upper(trim(coalesce(r.fields->>4,'')))='A' then
      coalesce(nullif(replace(regexp_replace(regexp_replace(coalesce(r.fields->>6,''),'[^0-9,.-]','','g'),'\.','','g'),',','.'),'')::numeric,0)
      +coalesce(nullif(replace(regexp_replace(regexp_replace(coalesce(r.fields->>7,''),'[^0-9,.-]','','g'),'\.','','g'),',','.'),'')::numeric,0)
      +coalesce(nullif(replace(regexp_replace(regexp_replace(coalesce(r.fields->>8,''),'[^0-9,.-]','','g'),'\.','','g'),',','.'),'')::numeric,0)
      else 0 end),0) as amendment_amount
  from public.ret_fontes_rows r
  where r.import_id=(select id from latest_ret)
    and (substring(regexp_replace(coalesce(r.fields->>0,''),'[^A-Za-z0-9]','','g') from 6 for 5)
      ||substring(regexp_replace(coalesce(r.fields->>0,''),'[^A-Za-z0-9]','','g') from 1 for 4)
      ||substring(regexp_replace(coalesce(r.fields->>0,''),'[^A-Za-z0-9]','','g') from 11))=c.adjustment_key
) ret_data on true
left join lateral (
  select
    coalesce(sum(r.amount) filter(where r.file_type='empenho'),0) as total_empenhado,
    coalesce(sum(r.amount) filter(where r.file_type='pagamento' and r.transaction_kind in ('O','R')),0) as total_pago_bruto,
    coalesce(sum(r.amount) filter(where r.file_type='pagamento' and r.is_valid_payment=true),0) as total_pago_valido,
    count(*) filter(where r.file_type='empenho') as quantidade_empenhos,
    count(*) filter(where r.file_type='pagamento' and r.transaction_kind in ('O','R')) as quantidade_movimentos_pagamento
  from public.orcom_movement_rows r
  join public.orcom_file_imports i on i.id=r.import_id
  where r.adjustment_key=c.adjustment_key
    and i.status='success'
    and (r.exercise>=2020)
) movement_data on true;

revoke all on public.orcom_adjustment_selection from anon,public;
grant select on public.orcom_adjustment_selection to authenticated;
