-- Remove o armazenamento histórico dos TXT_EMPENHO/TXT_PAGAMENTO.
-- Catálogo numérico e snapshot da consulta permanecem preservados.
DROP VIEW IF EXISTS public.orcom_adjustment_movement_summary;
DROP FUNCTION IF EXISTS public.orcom_adjustment_movement_context(text);
DROP FUNCTION IF EXISTS public.orcom_adjustment_movement_page(text,text,integer,integer,jsonb);
DROP TABLE IF EXISTS public.orcom_movement_rows;
DROP TABLE IF EXISTS public.orcom_file_imports;
