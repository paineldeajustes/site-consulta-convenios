-- A view da seleção respeita RLS e os privilégios do usuário efetivo.
-- A atualização do snapshot continua sendo executada pela função SECURITY DEFINER.
ALTER VIEW public.orcom_adjustment_selection SET (security_invoker = true);
