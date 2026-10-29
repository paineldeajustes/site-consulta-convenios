(()=>{"use strict";
const $=id=>document.getElementById(id);
const DB_URL="https://qkjudfvlaatdcaosadun.supabase.co";
const DB_KEY="sb_publishable_B3A7uwmQWUs8oOivjgJ6Qw_6rqx4U0W";
const BUCKET="clareza-task-files";
let pendingFiles=[],notificationRows=[],openedDeepLink=false;
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
$("addTaskCategory").addEventListener("click",async()=>{
 const name=(prompt("Nome da nova categoria:")||"").trim();if(!name)return;
 if(name.length>60){toast("Use até 60 caracteres no nome da categoria.");return}
 const button=$("addTaskCategory");button.disabled=true;
 try{
  const {data,error}=await db().rpc("add_task_category",{p_name:name,p_color:"#eaf2ff"});
  if(error)throw error;
  await window.ClarezaSettingsBridge?.load(true);
  await api().reloadTasks();
  $("taskCategory").value=(Array.isArray(data)?data[0]?.name:data?.name)||name;
  toast("Categoria salva e disponível nas próximas tarefas.");
 }catch(err){toast(err.message||"Não foi possível criar a categoria.")}
 finally{button.disabled=false}
});
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
function openAttachmentViewer(url,mimeType,fileName){
 const viewer=$("attachmentViewer"),frame=$("attachmentPdfFrame"),image=$("attachmentImagePreview"),external=$("openAttachmentExternal");
 if(!viewer||!frame||!image)return;
 $("attachmentViewerTitle").textContent=fileName||"Anexo";
 external.href=url;external.hidden=false;
 frame.hidden=true;image.hidden=true;frame.src="about:blank";image.removeAttribute("src");
 viewer.hidden=false;document.body.style.overflow="hidden";
 if(mimeType==="application/pdf"){
  frame.title=fileName||"Documento PDF";frame.src=url;frame.hidden=false;
 }else if(String(mimeType||"").startsWith("image/")){
  image.alt=fileName||"Imagem anexada à tarefa";image.src=url;image.hidden=false;
 }else{
  external.textContent="Baixar arquivo";
  external.href=url;
 }
}
function closeAttachmentViewer(){
 const viewer=$("attachmentViewer");if(!viewer)return;
 viewer.hidden=true;$("attachmentPdfFrame").src="about:blank";$("attachmentImagePreview").removeAttribute("src");
 $("attachmentPdfFrame").hidden=true;$("attachmentImagePreview").hidden=true;
 document.body.style.overflow=$("taskModal").hidden?"":"hidden";
 $("closeAttachmentViewer").blur();
}
$("closeAttachmentViewer").addEventListener("click",closeAttachmentViewer);
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("attachmentViewer").hidden)closeAttachmentViewer()});
async function renderExistingAttachments(task){
 const box=$("existingAttachments");if(!box)return;
 const rows=attachments().filter(a=>a.task_id===task?.id);
 if(!rows.length){box.innerHTML="";return}
 box.innerHTML='<p class="hint"><strong>Arquivos já anexados</strong></p>';
 for(const attachment of rows){
  const row=document.createElement("div");row.className="attachment-link";
  const icon=attachment.mime_type==="application/pdf"?"📄":"🖼️";
  const name=document.createElement("span");name.textContent=icon+" "+attachment.file_name;
  const link=document.createElement("a");link.textContent="Carregando…";link.href="#";link.rel="noopener";
  const {data:signed,error:signedError}=await db().storage.from(BUCKET).createSignedUrl(attachment.storage_path,3600);
  if(signedError){link.textContent="Indisponível";link.removeAttribute("href");}
  else{
   link.textContent="Abrir";link.href=signed.signedUrl;
   link.addEventListener("click",e=>{
    e.preventDefault();
    openAttachmentViewer(signed.signedUrl,attachment.mime_type,attachment.file_name);
   });
  }
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
async function populateVisibility(task){
 const field=$("taskVisibilityField"),select=$("taskVisibilityMode"),list=$("taskVisibleUsersList");
 const me=currentUser()?.id,isCreator=!task||task.created_by===me;
 field.hidden=!!task&&!isCreator;
 if(!isCreator){select.value="environment";list.hidden=true;list.innerHTML="";return}
 let mode="environment",selectedIds=task?members().map(m=>m.user_id):(me?[me]:[]);
 if(task){
  const {data,error}=await db().rpc("get_task_visibility",{p_task_id:task.id});
  if(!error&&data?.length){
   mode=data.find(x=>x.visibility_mode)?.visibility_mode||"environment";
   const ids=data.filter(x=>x.user_id).map(x=>x.user_id);
   if(ids.length)selectedIds=ids;
  }else mode=task.visibility_mode||"environment";
 }
 select.value=mode;
 list.innerHTML=members().map(m=>'<label class="task-visible-user"><input type="checkbox" data-visible-user="'+m.user_id+'" '+(selectedIds.includes(m.user_id)?"checked":"")+'><span>'+escapeHtml(m.display_name||m.email)+(m.user_id===me?" (você)":"")+'</span></label>').join("");
 list.hidden=mode!=="selected";
}
$("taskVisibilityMode").addEventListener("change",async()=>{
 const list=$("taskVisibleUsersList"),visible=$("taskVisibilityMode").value==="selected";
 list.hidden=!visible;
 if(visible&&!list.querySelector("[data-visible-user]")){
  const task=allTasks().find(t=>t.id===window.ClarezaWorkflow.currentTaskId)||null;
  await populateVisibility(task);
  list.hidden=false;
 }
});
function getVisibleUserIds(){
 if($("taskVisibilityMode").value!=="selected")return [];
 return [...$("taskVisibleUsersList").querySelectorAll("[data-visible-user]:checked")].map(x=>x.dataset.visibleUser);
}
async function renderChangeRequests(task){
 const box=$("taskChangeRequests"),me=currentUser()?.id;
 if(!task){box.hidden=true;box.innerHTML="";return}
 try{
  const {data,error}=await db().from("task_change_requests").select("*").eq("task_id",task.id).order("created_at",{ascending:false});
  if(error)throw error;
  const rows=data||[];
  if(!rows.length){box.hidden=true;box.innerHTML="";return}
  box.hidden=false;
  box.innerHTML='<p class="hint"><strong>Solicitações de alteração/exclusão</strong></p>'+rows.map(r=>{
   const requester=members().find(m=>m.user_id===r.requester_id);
   const status={pending:"Aguardando análise",approved:"Aprovada",rejected:"Recusada"}[r.status]||r.status;
   const proposal=r.request_type==="delete"?"Solicita excluir esta tarefa.":("Título proposto: "+(r.proposed_data?.title||task.title)+"; prazo: "+fmtDate(r.proposed_data?.due_date||task.due_date)+(r.proposed_data?.due_time?" às "+fmtTime(r.proposed_data.due_time):"")+".");
   return '<article class="change-request-item"><div class="workflow-head"><strong>'+escapeHtml(requester?.display_name||"Participante")+' · '+(r.request_type==="delete"?"Exclusão":"Alteração")+'</strong><span class="workflow-status-chip '+(r.status==="pending"?"pending":"")+'">'+status+'</span></div><p>'+escapeHtml(proposal)+'</p><p>'+escapeHtml(r.reason)+'</p>'+(r.decision_note?'<p>Observação: '+escapeHtml(r.decision_note)+'</p>':"")+(r.status==="pending"&&task.created_by===me?'<div class="change-request-actions"><button class="btn" data-change-action="approve" data-request-id="'+r.id+'">Aprovar</button><button class="btn secondary" data-change-action="reject" data-request-id="'+r.id+'">Recusar</button></div>':"")+'</article>';
  }).join("");
 }catch(err){box.hidden=false;box.innerHTML='<p class="hint">Não foi possível carregar as solicitações: '+escapeHtml(err.message||"erro")+'</p>'}
}
$("taskChangeRequests").addEventListener("click",async e=>{
 const b=e.target.closest("[data-change-action]");if(!b)return;
 const requestId=b.dataset.requestId,decision=b.dataset.changeAction;
 let note=null;if(decision==="reject")note=prompt("Justificativa para recusar a solicitação (opcional):")||null;
 b.disabled=true;b.textContent=decision==="approve"?"Aprovando…":"Registrando…";
 try{
  const {data,error}=await db().rpc("review_task_change_request",{p_request_id:requestId,p_decision:decision,p_note:note});
  if(error)throw error;
  const request=(await db().from("task_change_requests").select("task_id,request_type").eq("id",requestId).maybeSingle()).data;
  const taskId=request?.task_id||window.ClarezaWorkflow.currentTaskId;
  const delivery=taskId?await dispatchNotifications(taskId):null;
  await api().reloadTasks();
  if(request?.request_type==="delete"&&decision==="approve"){
   api().closeTaskModal?.();toast("Solicitação aprovada: tarefa excluída.");
  }else{
   const task=allTasks().find(t=>t.id===taskId);if(task)api().openTask(task);
   toast(delivery?.deliveryError?"Decisão registrada; notificação pendente.":"Solicitação analisada e participante notificado.");
  }
 }catch(err){toast(err.message||"Não foi possível analisar a solicitação.")}
 finally{b.disabled=false;b.textContent=decision==="approve"?"Aprovar":"Recusar"}
});
async function renderEnvironmentGroups(){
 const box=$("environmentGroupSettings"),message=$("environmentGroupMessage");
 if(!box)return;
 if(currentHousehold()?.member_role!=="owner"){
  box.innerHTML='<p class="settings-help">Apenas o administrador pode alterar os integrantes dos grupos. As tarefas que você pode ver dependem do ambiente e das autorizações do criador.</p>';return;
 }
 box.innerHTML='<p class="settings-help">Carregando…</p>';
 const {data,error}=await db().rpc("get_task_environment_groups");
 if(error){box.innerHTML="";message.textContent=error.message||"Não foi possível carregar os grupos.";message.hidden=false;return}
 message.hidden=true;
 const rows=data||[],settings=api()?.getSettings?.()?.household;
 const fallback={trabalho:"Trabalho",casa:"Casa",pessoal:"Pessoal",outros:"Outros"};
 const options=settings?.context_options||[];
 const keys=["trabalho","casa","pessoal","outros"];
 box.innerHTML=keys.map(key=>{
  const list=rows.filter(r=>r.environment_key===key);
  const label=options.find(o=>o.key===key)?.label||fallback[key];
  return '<section class="environment-group-card"><div><strong>'+escapeHtml(label)+'</strong><p>Quem pode visualizar tarefas deste ambiente.</p></div><div class="environment-group-members">'+list.map(m=>'<label class="environment-member"><input type="checkbox" data-env-user="'+m.user_id+'" '+(m.is_member?"checked":"")+' '+(m.is_creator?"disabled":"")+'><span>'+escapeHtml(m.display_name||m.email)+'</span></label>').join("")+'</div><button type="button" class="btn secondary" data-env-save="'+key+'">Salvar grupo</button></section>';
 }).join("");
}
$("environmentGroupSettings").addEventListener("click",async e=>{
 const button=e.target.closest("[data-env-save]");if(!button)return;
 const key=button.dataset.envSave;
 const ids=[...button.closest(".environment-group-card").querySelectorAll("[data-env-user]:checked")].map(x=>x.dataset.envUser);
 button.disabled=true;button.textContent="Salvando…";
 try{
  const {error}=await db().rpc("save_task_environment_group_members",{p_environment_key:key,p_user_ids:ids});if(error)throw error;
  $("environmentGroupMessage").textContent="Grupo salvo. A visibilidade será aplicada na próxima atualização dos integrantes.";$("environmentGroupMessage").hidden=false;
  await api().reloadTasks();await renderEnvironmentGroups();
 }catch(err){$("environmentGroupMessage").textContent=err.message||"Não foi possível salvar o grupo.";$("environmentGroupMessage").hidden=false;button.disabled=false;button.textContent="Salvar grupo"}
});
async function loadEnvironmentGroups(){await renderEnvironmentGroups()}
$("openSettings").addEventListener("click",()=>{setTimeout(loadEnvironmentGroups,250)});
async function onOpenTask(task){
 voiceCreated=false;pendingFiles=[];renderSelectedFiles();
 populateAssignees(task);
 const me=currentUser()?.id,isCreator=!task||task.created_by===me;
 await populateVisibility(task);
 $("changeRequestFields").hidden=!task||isCreator;
 $("changeRequestReason").value="";
 $("saveTask").textContent=task&&!isCreator?"Solicitar alteração ao criador":task?"Salvar alterações":"Salvar tarefa";
 $("deleteTask").textContent=task&&!isCreator?"Solicitar exclusão":"Excluir tarefa";
 $("deleteTask").hidden=!task;
 $("taskFiles").disabled=!isCreator;$("taskFiles").hidden=!isCreator;
 if(task){
  const taskAssignee=$("taskAssignee");if(task.assignee_id)taskAssignee.value=task.assignee_id;taskAssignee.disabled=true;
  $("attachmentSection").hidden=false;await renderExistingAttachments(task);statusWorkflow(task);await renderChangeRequests(task);
 }else{
  $("taskAssignee").disabled=false;$("taskAssignee").value=currentUser()?.id||"";
  $("workflowPanel").hidden=true;$("taskChangeRequests").hidden=true;$("taskChangeRequests").innerHTML="";
  $("existingAttachments").innerHTML="";$("attachmentSection").hidden=false;$("taskFiles").disabled=false;$("taskFiles").hidden=false;
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
 if(response==="propose_date"&&task.due_date){
  const proposedTime=plannedTime||"23:59",originalTime=(task.due_time||"23:59").slice(0,5);
  if(plannedDate<task.due_date||(plannedDate===task.due_date&&proposedTime<=originalTime))throw new Error("A nova data ou horário precisa ser posterior ao prazo original.");
 }
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
 const headers=["ID","Tarefa","Detalhes","Prazo vigente","Horário","Prazo original","Responsável","Criador","Prioridade","Contexto","Categoria","Status do fluxo","Data proposta","Justificativa","Concluída","Data de criação","Anexos"];
 const rows=list.map(t=>{
  const assignee=memberList.find(m=>m.user_id===t.assignee_id),creator=memberList.find(m=>m.user_id===t.created_by);
  return [t.id,t.title,t.notes,t.due_date,fmtTime(t.due_time),t.original_due_date||"",assignee?.display_name||assignee?.email,creator?.display_name||t.created_by_name,t.priority,t.context,t.category,labelStatus[t.workflow_status]||t.workflow_status,t.proposed_due_date,t.final_reason||t.proposal_reason,t.completed?"Sim":"Não",t.created_at,att.filter(a=>a.task_id===t.id).map(a=>a.file_name).join(", ")];
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
$("exportCsv").addEventListener("click",()=>csvDownload());
$("exportJson").addEventListener("click",()=>exportJson());
$("exportPrint").addEventListener("click",()=>exportPrint());
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
 loadNotifications,
 getVisibleUserIds,
 loadEnvironmentGroups
};
})();