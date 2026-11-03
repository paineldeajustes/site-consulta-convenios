const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({
    success: false,
    disabled: true,
    error: "A importação de TXT_EMPENHO/TXT_PAGAMENTO foi desativada. Empenhos e pagamentos agora são lidos exclusivamente das colunas correspondentes do RET_FONTES.txt."
  }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
  });
});
