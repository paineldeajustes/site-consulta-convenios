(()=>{"use strict";
const $=id=>document.getElementById(id);
const DB_URL="https://qkjudfvlaatdcaosadun.supabase.co";
const DB_KEY="sb_publishable_B3A7uwmQWUs8oOivjgJ6Qw_6rqx4U0W";
const BUCKET="clareza-task-files";
let pendingFiles=[],notificationRows=[],openedDeepLink=false,recognition=null;
let voiceCreated=false;
const api=()=>window.ClarezaApp;
const db=()=>api()?.client?.();
const currentUser=()=>api()?.currentUser?.();
const currentHousehold=()=>api()?.taskHousehold?.();
const allTasks=()=>api()?.getTasks?.()||[];
const members=()=>api()?.getMembers?.()||[];
const attachments=()=>api()?.getAttachments?.()||[];
const escapeHtml=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate=d=>d?new Date(d+"T12:00:00").toLocaleDateString("pt-BR"):"—";
const fmtTime=t=>t?String(t).slice(0,5):"";
const labelStatus={
assigned:"Aguardando resposta do responsável",accepted:"Prazo aceito pelo responsável",
proposed_date:"Aguardando decisão do criador",accepted_late:"Nova data aceita — decisão final",
reaffirmed:"Prazo original mantido — decisão final",impossible_deadline:"Prazo informado como impossível",
impossible_task:"Tarefa informada como inexequível"
};
const labelAction={
created:"Tarefa criada",accepted:"Prazo aceito",proposed_date:"Proposta de nova data",
impossible_deadline:"Prazo impossível",impossible_task:"Tarefa inexequível",
accepted_late:"Nova data aceita",reaffirmed:"Prazo original mantido"
};
function toast(s){api()?.toast?.(s)}
function showError(s){const el=$("taskError");el.textContent=s;el.hidden=false}
function callToastOrError(err){toast(err?.message||String(err||"Ocorreu um erro."))}
function parseDatePhrase(text){
 let title=text.trim(),dueDate="",dueTime="";
 const now=new Date();
 const mTime=title.match(/\b(?:às?\s*)?(\d{1,2})(?:\s*[:h]\s*(\d{2}))?\s*h\b/i)||title.match(/\bàs\s+(\d{1,2}):(\d{2})\b/i);
 if(mTime){const hh=Number(mTime[1]),mm=Number(mTime[2]||0);if(hh>=0&&hh<24&&mm<60)dueTime=String(hh).padStart(2,"0")+":"+String(mm).padStart(2,"0");title=title.replace(mTime[0]," ");}
 const lower=title.toLocaleLowerCase("pt-BR");
 if(/\bamanhã\b/.test(lower)){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);dueDate=localISO(d);title=title.replace(/\bamanhã\b/ig," ")}
 else if(/\bhoje\b/.test(lower)){dueDate=localISO(now);title=title.replace(/\bhoje\b/ig," ")}
 const phrase=title.match(/\b(?:crie|criar|anote|adicionar|adicione|registre|registrar)\s+(?:uma\s+)?tarefa\s*(?:para|de|:)?\s*/i);
 if(phrase)title=title.slice(phrase[0].length);
 return {title:title.replace(/\s+/g," ").replace(/[,. ]+$/,"").trim(),dueDate,dueTime};
}
function localISO(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function populateAssignees(task){
 const select=$("taskAssignee");if(!select)return;
 const list=members(),user=currentUser();const chosen=task?.assignee_id||user?.id||"";
 select.innerHTML=list.map(m=>'<option value="'+m.user_id+'">'+escapeHtml(m.display_name||m.email)+(m.user_id===user?.id?" (você)":"")+'</option>').join("");
 if(!list.some(m=>m.user_id===chosen)&&user){const opt=document.createElement("option");opt.value=user.id;opt.textContent=user.user_metadata?.full_name||user.email||"Você";select.appendChild(opt)}
 select.value=chosen;
 select.disabled=!!task;
}
function statusWorkflow(task){
 const panel=$("workflowPanel");if(!task){panel.hidden=true;return}
 panel.hidden=false;
 const status=task.workflow_status||"accepted",me=currentUser()?.id;
 const isAssignee=task.assignee_id===me;
 const isCreator=task.created_by===me;
 const isAssigned=status==="assigned"&&isAssignee;
 const isProposal=status==="proposed_date"&&isCreator;
 $("workflowTitle").textContent="Acompanhamento e aceite";
 $("workflowStatusBadge").textContent=labelStatus[status]||status;
 $("workflowDescription").textContent="Responsável: "+(members().find(m=>m.user_id===task.assignee_id)?.display_name||"não identificado")+". Criador: "+(members().find(m=>m.user_id===task.created_by)?.display_name||task.created_by_name||"não identificado")+".";
 $("assigneeResponseFields").hidden=!isAssigned;
 $("creatorDecisionFields").hidden=!isProposal;
 const finalStatuses=["accepted","accepted_late","reaffirmed","impossible_deadline","impossible_task"];
 if(finalStatuses.includes(status)){
  $("workflowDescription").textContent+=" "+(task.final_reason||({
   accepted:"O responsável confirmou que cumprirá o prazo combinado.",
   accepted_late:"O criador aceitou a nova data proposta. Decisão final.",
   reaffirmed:"O criador manteve o prazo original. Decisão final.",
   impossible_deadline:"O prazo foi registrado como impossível de atender.",
   impossible_task:"A própria tarefa foi registrada como inexequível."
  }[status]||""));
 }
 if(status==="proposed_date"){
  $("proposalSummary").textContent="Prazo original: "+fmtDate(task.due_date)+(task.due_time?" às "+fmtTime(task.due_time):"")+". Nova data proposta: "+fmtDate(task.proposed_due_date)+(task.proposed_due_time?" às "+fmtTime(task.proposed_due_time):"")+". Justificativa do responsável: "+(task.proposal_reason||"Não informada");
 }
 if(status==="reaffirmed"&&task.final_reason)$("workflowDescription").textContent+=" Justificativa final: "+task.final_reason;
 $("assigneeResponse").value="accept";$("assigneePlannedDate").value="";$("assigneePlannedTime").value="";$("assigneeReason").value="";
 $("creatorDecision").value="accept_date";$("creatorReason").value="";
 $("creatorReasonWrap").hidden=true;
 syncResponseFields();
 renderWorkflowHistory(task);
}
function syncResponseFields(){
 const v=$("assigneeResponse").value;
 $("assigneeProposalFields").hidden=v!=="propose_date";
 $("assigneeReason").required=v!=="accept";
 $("assigneePlannedDate").required=v==="propose_date";
 $("creatorReasonWrap").hidden=$("creatorDecision").value!=="insist_deadline";
 $("creatorReason").required=$("creatorDecision").value==="insist_deadline";
}
$("assigneeResponse").addEventListener("change",syncResponseFields);
$("creatorDecision").addEventListener("change",syncResponseFields);
async function renderWorkflowHistory(task){
 const box=$("workflowHistory");box.innerHTML='<p class="hint">Carregando histórico…</p>';
 try{
  const {data,error}=await db().from("task_workflow_history").select("*").eq("task_id",task.id).order("created_at",{ascending:true});
  if(error)throw error;
  if(!data?.length){box.innerHTML='<p class="hint">Ainda não há movimentações além da criação.</p>';return}
  box.innerHTML='<p class="hint"><strong>Histórico do fluxo</strong></p>'+data.map(h=>{
   const actor=members().find(m=>m.user_id===h.actor_id);
   let detail=h.note?'<p>'+escapeHtml(h.note)+'</p>':"";
   if(h.proposed_date)detail+='<p>Data informada: '+fmtDate(h.proposed_date)+(h.proposed_time?" às "+fmtTime(h.proposed_time):"")+'</p>';
   return '<div class="workflow-history-item"><strong>'+escapeHtml(labelAction[h.action]||h.action)+' · '+escapeHtml(actor?.display_name||"Participante")+'</strong><p>'+new Date(h.created_at).toLocaleString("pt-BR")+'</p>'+detail+'</div>';
  }).join("");
 }catch(err){box.innerHTML='<p class="hint">Não foi possível carregar o histórico: '+escapeHtml(err.message||"erro")+'</p>'}
}
async function invokeTaskNotify(taskId){
 const {data:{session},error}=await db().auth.getSession();
 if(error||!session?.access_token)throw new Error("Sua sessão expirou. Entre novamente.");
 const response=await fetch(DB_URL+"/functions/v1/clareza-task-notify",{
  method:"POST",
  headers:{"Content-Type":"application/json","apikey":DB_KEY,"Authorization":"Bearer "+session.access_token},
  body:JSON.stringify({task_id:taskId})
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(result.error||"Não foi possível enviar as notificações.");
 return result;
}
async function uploadFiles(taskId){
 if(!pendingFiles.length)return;
 const dbClient=db(),user=currentUser(),hh=currentHousehold();
 const files=pendingFiles.slice();let uploaded=0,failures=[];
 for(const file of files){
  try{
   const safeName=file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"_").slice(-120)||"arquivo";
   const path=hh.household_id+"/"+taskId+"/"+crypto.randomUUID()+"_"+safeName;
   const {error:uploadError}=await dbClient.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});
   if(uploadError)throw uploadError;
   const {error:metadataError}=await dbClient.from("task_attachments").insert({
    household_id:hh.household_id,task_id:taskId,storage_path:path,file_name:file.name,mime_type:file.type,size_bytes:file.size,uploaded_by:user.id
   });
   if(metadataError){await dbClient.storage.from(BUCKET).remove([path]);throw metadataError}
   uploaded++;
  }catch(err){failures.push(file.name+": "+(err.message||"falha ao anexar"))}
 }
 pendingFiles=[];$("taskFiles").value="";renderSelectedFiles();
 if(failures.length)toast("Tarefa salva; alguns anexos falharam: "+failures.join(" | "));
 else if(uploaded)toast(uploaded+" anexo(s) salvo(s)");
}
function renderSelectedFiles(){
 const box=$("selectedFiles");
 box.innerHTML=pendingFiles.map((file,i)=>'<div class="file-row"><span>📎 '+escapeHtml(file.name)+' · '+(file.size/1024/1024).toFixed(1)+' MB</span><button type="button" class="file-remove" data-file-remove="'+i+'" aria-label="Remover anexo">×</button></div>').join("");
}
$("taskFiles").addEventListener("change",e=>{
 const input=e.target,allowed=["application/pdf","image/jpeg","image/png","image/webp","image/heic","image/heif"];
 for(const file of [...(input.files||[])]){
  if(!allowed.includes(file.type)){toast("Formato não permitido: "+file.name);continue}
  if(file.size>15*1024*1024){toast(file.name+" excede o limite de 15 MB.");continue}
  if(!pendingFiles.some(x=>x.name===file.name&&x.size===file.size&&x.lastModified===file.lastModified))pendingFiles.push(file);
 }
 input.value="";renderSelectedFiles();
});
$("selectedFiles").addEventListener("click",e=>{
 const b=e.target.closest("[data-file-remove]");if(!b)return;
 pendingFiles.splice(Number(b.dataset.fileRemove),1);renderSelectedFiles();
});
async function renderExistingAttachments(task){
 const box=$("existingAttachments");if(!box)return;
 const rows=attachments().filter(a=>a.task_id===task?.id);
 if(!rows.length){box.innerHTML="";return}
 box.innerHTML='<p class="hint"><strong>Arquivos já anexados</strong></p>';
 for(const attachment of rows){
  const row=document.createElement("div");row.className="attachment-link";
  const icon=attachment.mime_type==="application/pdf"?"📄":"🖼️";
  const name=document.createElement("span");name.textContent=icon+" "+attachment.file_name;
  const link=document.createElement("a");link.textContent="Abrir";link.href="#";link.target="_blank";link.rel="noopener";
  link.addEventListener("click",async e=>{
   e.preventDefault();
   const {data,error}=await db().storage.from(BUCKET).createSignedUrl(attachment.storage_path,3600);
   if(error){toast(error.message||"Não foi possível abrir o anexo.");return}
   window.open(data.signedUrl,"_blank","noopener");
  });
  row.append(name,link);
  if(attachment.uploaded_by===currentUser()?.id || currentHousehold()?.member_role==="owner"){
   const del=document.createElement("button");del.type="button";del.className="file-remove";del.textContent="×";del.title="Excluir anexo";
   del.addEventListener("click",async()=>{
    if(!confirm("Excluir o anexo "+attachment.file_name+"?"))return;
    const {error}=await db().storage.from(BUCKET).remove([attachment.storage_path]);if(error){toast(error.message);return}
    const {error:metaError}=await db().from("task_attachments").delete().eq("id",attachment.id);
    if(metaError){toast(metaError.message);return}
    await api().reloadTasks();await renderExistingAttachments(task);toast("Anexo excluído");
   });row.append(del);
  }
  box.append(row);
 }
}
async function onOpenTask(task){
 voiceCreated=false;pendingFiles=[];renderSelectedFiles();
 populateAssignees(task);
 if(task){
  const myId=currentUser()?.id;
  const taskAssignee=$("taskAssignee");
  if(task.assignee_id)taskAssignee.value=task.assignee_id;
  taskAssignee.disabled=true;
  $("attachmentSection").hidden=false;
  await renderExistingAttachments(task);
  statusWorkflow(task);
 }else{
  $("taskAssignee").disabled=false;
  $("taskAssignee").value=currentUser()?.id||"";
  $("workflowPanel").hidden=true;
  $("existingAttachments").innerHTML="";
  $("attachmentSection").hidden=false;
  $("assigneeResponseFields").hidden=true;$("creatorDecisionFields").hidden=true;
 }
}
async function sendAssigneeResponse(){
 const task=allTasks().find(t=>t.id===window.ClarezaWorkflow.currentTaskId);
 if(!task)throw new Error("Tarefa não encontrada. Atualize a lista.");
 const response=$("assigneeResponse").value;
 const plannedDate=$("assigneePlannedDate").value||null;
 const plannedTime=$("assigneePlannedTime").value||null;
 const reason=$("assigneeReason").value.trim()||null;
 if(response!=="accept"&&reason&&reason.length<8)throw new Error("A justificativa deve ter pelo menos oito caracteres.");
 if(response==="propose_date"&&!plannedDate)throw new Error("Informe a data em que conseguirá realizar a tarefa.");
 if(response==="propose_date"&&task.due_date&&plannedDate<=task.due_date)throw new Error("A nova data precisa ser posterior ao prazo original.");
 const button=$("sendAssigneeResponse");button.disabled=true;button.textContent="Enviando…";
 try{
  const {data,error}=await db().rpc("respond_task_assignment",{p_task_id:task.id,p_response:response,p_planned_date:plannedDate,p_planned_time:plannedTime,p_reason:reason});
  if(error)throw error;
  const delivery=await invokeTaskNotify(task.id).catch(err=>({deliveryError:err.message}));
  await api().reloadTasks();
  const updated=allTasks().find(t=>t.id===task.id);if(updated)api().openTask(updated);
  toast(delivery.deliveryError?"Resposta salva; notificação aguardando envio.":delivery.emailConfigured===false?"Resposta registrada. Push/inbox acionados; e-mail exige configurar o provedor.":"Resposta registrada e participantes notificados.");
 }catch(err){showError(err.message||"Não foi possível registrar a resposta.")}
 finally{button.disabled=false;button.textContent="Enviar resposta"}
}
$("sendAssigneeResponse").addEventListener("click",async()=>{
 try{await sendAssigneeResponse()}catch(err){showError(err.message||"Não foi possível enviar a resposta.")}
});
$("sendCreatorDecision").addEventListener("click",async()=>{
 const task=allTasks().find(t=>t.id===window.ClarezaWorkflow.currentTaskId);if(!task){showError("Tarefa não encontrada.");return}
 const decision=$("creatorDecision").value,reason=$("creatorReason").value.trim()||null;
 if(decision==="insist_deadline"&&(!reason||reason.length<8)){showError("Explique por que o prazo original precisa ser mantido (mínimo de oito caracteres).");return}
 const button=$("sendCreatorDecision");button.disabled=true;button.textContent="Registrando…";
 try{
  const {data,error}=await db().rpc("decide_task_proposal",{p_task_id:task.id,p_decision:decision,p_reason:reason});
  if(error)throw error;
  const delivery=await invokeTaskNotify(task.id).catch(err=>({deliveryError:err.message}));
  await api().reloadTasks();const updated=allTasks().find(t=>t.id===task.id);if(updated)api().openTask(updated);
  toast(delivery.deliveryError?"Decisão salva; notificação aguardando envio.":delivery.emailConfigured===false?"Decisão final registrada. Push/inbox acionados; e-mail exige configurar o provedor.":"Decisão final registrada e responsável notificado.");
 }catch(err){showError(err.message||"Não foi possível registrar a decisão.")}
 finally{button.disabled=false;button.textContent="Registrar decisão final"}
});
async function loadNotifications(){
 const user=currentUser(),dbClient=db();if(!user||!dbClient)return;
 try{
  const {data,error}=await dbClient.from("task_notifications").select("*").eq("recipient_id",user.id).order("created_at",{ascending:false}).limit(50);
  if(error)throw error;notificationRows=data||[];
  const unread=notificationRows.filter(n=>!n.read_at).length;
  $("notificationBadge").textContent=unread>99?"99+":String(unread);
  $("notificationBadge").hidden=unread===0;
  renderNotifications();
 }catch(err){console.warn("Clareza notifications",err)}
}
function renderNotifications(){
 const list=$("notificationsList");
 if(!notificationRows.length){list.innerHTML='<p class="hint">Você está em dia. Nenhuma notificação por enquanto.</p>';return}
 list.innerHTML=notificationRows.map(n=>'<div class="notification-item '+(!n.read_at?"unread":"")+'" role="button" tabindex="0" data-notification-id="'+n.id+'" data-task-id="'+(n.task_id||"")+'"><span class="notification-dot" aria-hidden="true"></span><div class="notification-copy"><strong>'+escapeHtml(n.title)+'</strong><p>'+escapeHtml(n.body)+'</p><time>'+new Date(n.created_at).toLocaleString("pt-BR")+(n.requires_action?" · Ação necessária":"")+'</time></div><span class="notification-go">›</span></div>').join("");
}
$("openNotifications").addEventListener("click",async()=>{
 const panel=$("notificationsPanel");panel.hidden=!panel.hidden;
 if(!panel.hidden){$("exportMenu").hidden=true;await loadNotifications();panel.scrollIntoView({behavior:"smooth",block:"nearest"})}
});
$("closeNotifications").addEventListener("click",()=>$("notificationsPanel").hidden=true);
async function openNotification(n){
 $("notificationsPanel").hidden=true;
 if(!n.read_at){await db().rpc("mark_task_notification_read",{p_notification_id:n.id});n.read_at=new Date().toISOString();renderNotifications();const unread=notificationRows.filter(x=>!x.read_at).length;$("notificationBadge").hidden=!unread;$("notificationBadge").textContent=String(unread)}
 if(!n.task_id){toast("Esta notificação não está vinculada a uma tarefa.");return}
 if(!allTasks().some(t=>t.id===n.task_id))await api().reloadTasks();
 const task=allTasks().find(t=>t.id===n.task_id);
 if(task){window.ClarezaWorkflow.currentTaskId=task.id;api().openTask(task);window.scrollTo({top:0,behavior:"smooth"})}
 else toast("A tarefa já não está disponível ou você não tem acesso a ela.");
}
$("notificationsList").addEventListener("click",async e=>{
 const row=e.target.closest("[data-notification-id]");if(!row)return;
 const n=notificationRows.find(x=>x.id===row.dataset.notificationId);if(n)await openNotification(n);
});
$("notificationsList").addEventListener("keydown",async e=>{
 if(e.key!=="Enter"&&e.key!==" ")return;const row=e.target.closest("[data-notification-id]");if(!row)return;e.preventDefault();
 const n=notificationRows.find(x=>x.id===row.dataset.notificationId);if(n)await openNotification(n);
});
async function dispatchNotifications(taskId){
 try{
  const result=await invokeTaskNotify(taskId);
  if(!result.emailConfigured)result.emailSetupRequired=true;
  return result;
 }catch(err){console.error(err);return {ok:false,deliveryError:err.message||String(err)}}
}
function onTasksLoaded(){
 loadNotifications();
 const url=new URL(location.href),taskId=url.searchParams.get("task_id"),notificationId=url.searchParams.get("notification_id");
 if(taskId&&!openedDeepLink){
  openedDeepLink=true;
  const task=allTasks().find(t=>t.id===taskId);
  if(task){window.ClarezaWorkflow.currentTaskId=task.id;api().openTask(task);
   if(notificationId)db().rpc("mark_task_notification_read",{p_notification_id:notificationId}).then(()=>loadNotifications());
   url.searchParams.delete("task_id");url.searchParams.delete("notification_id");url.searchParams.delete("notification");url.searchParams.delete("from_notification");history.replaceState(null,"",url.pathname+url.search+url.hash);
  }
 }
}
function csvDownload(){
 const list=allTasks(),memberList=members(),att=attachments();
 const headers=["ID","Tarefa","Detalhes","Prazo","Horário","Responsável","Criador","Prioridade","Contexto","Categoria","Status do fluxo","Data proposta","Justificativa","Concluída","Data de criação","Anexos"];
 const rows=list.map(t=>{
  const assignee=memberList.find(m=>m.user_id===t.assignee_id),creator=memberList.find(m=>m.user_id===t.created_by);
  return [t.id,t.title,t.notes,t.due_date,fmtTime(t.due_time),assignee?.display_name||assignee?.email,creator?.display_name||t.created_by_name,t.priority,t.context,t.category,labelStatus[t.workflow_status]||t.workflow_status,t.proposed_due_date,t.final_reason||t.proposal_reason,t.completed?"Sim":"Não",t.created_at,att.filter(a=>a.task_id===t.id).map(a=>a.file_name).join(", ")];
 });
 const escape=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
 const csv="\uFEFF"+[headers,...rows].map(row=>row.map(escape).join(";")).join("\r\n");
 downloadBlob(csv,"clareza-tarefas-"+localISO(new Date())+".csv","text/csv;charset=utf-8");
}
function downloadBlob(content,name,type){
 const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=name;a.style.display="none";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function exportJson(){
 const list=allTasks(),ids=list.map(t=>t.id);let history=[];
 if(ids.length){
  try{const {data,error}=await db().from("task_workflow_history").select("*").in("task_id",ids).order("created_at",{ascending:true});if(error)throw error;history=data||[]}
  catch(err){toast("Não consegui incluir o histórico no backup: "+(err.message||"erro"));return}
 }
 const payload={exported_at:new Date().toISOString(),application:"Clareza",tasks:list,attachments:attachments(),workflow_history:history};
 downloadBlob(JSON.stringify(payload,null,2),"clareza-backup-"+localISO(new Date())+".json","application/json");
}
function exportPrint(){
 const list=allTasks(),memberList=members(),att=attachments();
 const rows=list.map(t=>{
  const assignee=memberList.find(m=>m.user_id===t.assignee_id);
  const files=att.filter(a=>a.task_id===t.id).map(a=>a.file_name).join(", ");
  return '<article><h2>'+escapeHtml(t.title)+'</h2><p>'+escapeHtml(t.notes||"")+'</p><p><b>Prazo:</b> '+fmtDate(t.due_date)+' '+fmtTime(t.due_time)+' · <b>Responsável:</b> '+escapeHtml(assignee?.display_name||"Não definido")+'</p><p><b>Contexto:</b> '+escapeHtml(t.context)+' · <b>Prioridade:</b> '+escapeHtml(t.priority)+' · <b>Status:</b> '+escapeHtml(labelStatus[t.workflow_status]||t.workflow_status)+'</p>'+(files?'<p><b>Anexos:</b> '+escapeHtml(files)+'</p>':"")+'</article>';
 }).join("");
 const w=window.open("","_blank");if(!w){toast("Permita pop-ups para exportar PDF.");return}
 w.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Clareza — Exportação</title><style>body{font:14px Arial,sans-serif;max-width:900px;margin:25px auto;color:#20372d}h1{font-size:24px}article{padding:15px 0;border-bottom:1px solid #ccd5ce;page-break-inside:avoid}h2{font-size:17px}p{line-height:1.5}small{color:#627368}@media print{button{display:none}}</style></head><body><h1>Clareza — Exportação de tarefas</h1><p>Gerado em '+new Date().toLocaleString("pt-BR")+'</p>'+rows+'<script>window.onload=()=>window.print()<\/script></body></html>');
 w.document.close();
}
$("exportTasks").addEventListener("click",()=>{$("exportMenu").hidden=!$("exportMenu").hidden;$("notificationsPanel").hidden=true});
$("exportCsv").addEventListener("click",()=>{csvDownload();$("exportMenu").hidden=true});
$("exportJson").addEventListener("click",()=>{exportJson();$("exportMenu").hidden=true});
$("exportPrint").addEventListener("click",()=>{exportPrint();$("exportMenu").hidden=true});
function startVoice(){
 const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Speech){toast("Ditado por voz não está disponível neste navegador. Use o microfone do teclado do iPhone.");return}
 if(recognition){try{recognition.stop()}catch{}recognition=null;$("voiceTask").classList.remove("recording");return}
 recognition=new Speech();recognition.lang="pt-BR";recognition.interimResults=false;recognition.maxAlternatives=1;
 $("voiceTask").classList.add("recording");$("voiceStatus").hidden=false;$("voiceStatus").textContent="Ouvindo… diga a tarefa, a data e o horário.";
 recognition.onresult=e=>{
  const transcript=e.results?.[0]?.[0]?.transcript||"";
  const parsed=parseDatePhrase(transcript);
  $("taskTitle").value=parsed.title||transcript.trim();
  if(parsed.dueDate)$("taskDue").value=parsed.dueDate;
  if(parsed.dueTime)$("taskTime").value=parsed.dueTime;
  voiceCreated=true;if(window.ClarezaWorkflow)window.ClarezaWorkflow.voiceCreated=true;$("voiceStatus").textContent="Entendi: "+transcript;
 };
 recognition.onerror=e=>{$("voiceStatus").textContent=e.error==="not-allowed"?"Permita o uso do microfone para ditar tarefas.":"Não consegui reconhecer a fala. Tente novamente."};
 recognition.onend=()=>{$("voiceTask").classList.remove("recording");recognition=null};
 try{recognition.start()}catch(err){$("voiceTask").classList.remove("recording");recognition=null;toast("Não consegui iniciar o microfone.")}
}
$("voiceTask").addEventListener("click",startVoice);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)loadNotifications()});
setInterval(()=>{if(!document.hidden&&currentUser())loadNotifications()},60000);
window.ClarezaWorkflow={
 currentTaskId:null,voiceCreated:false,
 onOpenTask:async task=>{
  window.ClarezaWorkflow.currentTaskId=task?.id||null;
  voiceCreated=false;window.ClarezaWorkflow.voiceCreated=false;
  await onOpenTask(task);
 },
 onTasksLoaded,
 uploadFiles,
 dispatchNotifications,
 loadNotifications
};
})();