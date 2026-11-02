(function(){
"use strict";
const $=id=>document.getElementById(id);
let shared=null,personal=null,categories=[],memberSettings=[],loadedFor=null,loading=false;
const defaults={
 display_name:"Agenda compartilhada",default_context:"pessoal",default_priority:"media",
 default_notification_offsets:[1440,120,60,0],overdue_morning_enabled:true,overdue_morning_time:"09:00:00",
 overdue_afternoon_enabled:true,overdue_afternoon_time:"15:00:00",confirm_before_complete:true,
 context_options:[
  {key:"trabalho",label:"Trabalho",color:"#eaf2ff"},
  {key:"casa",label:"Casa",color:"#f3eafb"},
  {key:"pessoal",label:"Pessoal",color:"#e8f5eb"},
  {key:"outros",label:"Outros",color:"#edf1f2"}
 ]
};
function safeColor(value,fallback){
 return typeof value==="string"&&/^#[0-9a-fA-F]{6}$/.test(value)?value:fallback;
}
function message(id,text,error){
 const el=$(id);if(!el)return;
 el.textContent=text||"";el.hidden=!text;el.className="msg"+(error?" error":"");
}
function client(){return window.ClarezaApp?.client?.()}
function user(){return window.ClarezaApp?.user?.()}
function household(){return window.ClarezaApp?.household?.()}
function isOwner(){return household()?.member_role==="owner"}
function displayName(){
 const u=user();return String(personal?.display_name||u?.user_metadata?.full_name||"").trim();
}
function timeValue(value,fallback){
 if(!value)return fallback;
 return String(value).slice(0,5);
}
function offsetsFromUi(prefix){
 const result=[];
 if($(prefix+"ReminderDay")?.checked)result.push(1440);
 if($(prefix+"Reminder2h")?.checked)result.push(120);
 if($(prefix+"Reminder1h")?.checked)result.push(60);
 if($(prefix+"ReminderAtTime")?.checked)result.push(0);
 return result;
}
function applyContextOptions(opts){
 const stored=Array.isArray(opts)&&opts.length?opts:defaults.context_options;
 const all=["trabalho","casa","pessoal","outros"].map(key=>{
  const base=defaults.context_options.find(o=>o.key===key);
  const saved=stored.find(o=>o.key===key)||base;
  return {...base,...saved,enabled:saved.enabled!==false};
 });
 let active=all.filter(o=>o.enabled);
 if(!active.length)active=all;
 const escapeOption=value=>String(value||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const taskSelect=$("taskContext");
 if(taskSelect){
  const previous=taskSelect.value;
  taskSelect.innerHTML=all.map(o=>'<option value="'+o.key+'" '+(o.enabled?"":"disabled")+'>'+escapeOption(o.label||o.key)+(o.enabled?"":" · indisponível para novas tarefas")+'</option>').join("");
  if(all.some(o=>o.key===previous))taskSelect.value=previous;
  else if(active.length)taskSelect.value=active[0].key;
 }
 const defaultSelect=$("settingsDefaultContext");
 if(defaultSelect){
  const previous=defaultSelect.value;
  defaultSelect.innerHTML=active.map(o=>'<option value="'+o.key+'">'+escapeOption(o.label||o.key)+'</option>').join("");
  defaultSelect.value=active.some(o=>o.key===previous)?previous:active[0].key;
 }
}
function applyTheme(theme,compact){
 const app=$("app");if(!app)return;
 let actual=theme||"light";
 if(actual==="system")actual=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
 app.dataset.theme=actual;
 document.body.dataset.theme=actual;
 document.body.style.backgroundColor=actual==="dark"?"#141a17":"";
 document.body.style.color=actual==="dark"?"#eaf0eb":"";
 app.classList.toggle("compact",!!compact);
}
async function load(force){
 const api=window.ClarezaApp,db=client(),u=user(),h=household();
 if(!api||!db||!u||!h?.household_id||loading)return;
 if(!force&&loadedFor===h.household_id+":"+u.id&&shared&&personal)return;
 loading=true;
 try{
  const {data,error}=await db.rpc("get_or_create_task_settings");
  if(error)throw error;
  const row=Array.isArray(data)?data[0]:data;
  shared={...defaults,...(row||{})};
  if(typeof shared.context_options==="string"){try{shared.context_options=JSON.parse(shared.context_options)}catch{shared.context_options=defaults.context_options}}
  if(!Array.isArray(shared.context_options))shared.context_options=defaults.context_options;
  personal={display_name:row?.profile_display_name||u.user_metadata?.full_name||"",theme:row?.theme||"light",compact_mode:!!row?.compact_mode};
  const {data:catData,error:catError}=await db.from("task_categories").select("*").eq("household_id",h.household_id).order("name",{ascending:true});
  if(catError)throw catError;
  categories=catData||[];
  if(isOwner()){
   const {data:memberData,error:memberSettingsError}=await db.rpc("get_task_member_settings");
   if(memberSettingsError)throw memberSettingsError;
   memberSettings=memberData||[];
  }else memberSettings=[];
  loadedFor=h.household_id+":"+u.id;
  api.setSettings?.(shared,personal,categories);
  populate();
 }catch(err){
  message("profileSettingsMessage","Não foi possível carregar as configurações: "+(err.message||"tente novamente."),true);
 }finally{loading=false}
}
function populate(){
 const h=shared||defaults,p=personal||{};
 $("settingsDisplayName").value=p.display_name||"";
 $("settingsEmail").value=user()?.email||"";
 $("settingsTheme").value=p.theme||"light";
 $("settingsCompact").checked=!!p.compact_mode;
 $("settingsHouseholdName").value=h.display_name||"Agenda compartilhada";
 if($("appSubtitle"))$("appSubtitle").textContent=h.display_name||"Seu espaço de organização";
 $("settingsDefaultContext").value=h.default_context||"pessoal";
 $("settingsDefaultPriority").value=h.default_priority||"media";
 $("settingsReminderDay").checked=(h.default_notification_offsets||defaults.default_notification_offsets).includes(1440);
 $("settingsReminder2h").checked=(h.default_notification_offsets||defaults.default_notification_offsets).includes(120);
 $("settingsReminder1h").checked=(h.default_notification_offsets||defaults.default_notification_offsets).includes(60);
 $("settingsReminderAtTime").checked=(h.default_notification_offsets||defaults.default_notification_offsets).includes(0);
 $("settingsOverdueMorning").checked=h.overdue_morning_enabled!==false;
 $("settingsMorningTime").value=timeValue(h.overdue_morning_time,"09:00");
 $("settingsOverdueAfternoon").checked=h.overdue_afternoon_enabled!==false;
 $("settingsAfternoonTime").value=timeValue(h.overdue_afternoon_time,"15:00");
 $("settingsConfirmComplete").checked=h.confirm_before_complete!==false;
 $("taskOverdueMorningText").textContent="Se atrasar: "+timeValue(h.overdue_morning_time,"09:00");
 $("taskOverdueAfternoonText").textContent="Se atrasar: "+timeValue(h.overdue_afternoon_time,"15:00");
 $("settingsAdminBadge").textContent=isOwner()?"Administrador":"Membro";
 $("settingsAccessRole").textContent=isOwner()?"Administrador":"Membro";
 $("settingsScreen").dataset.readonly=isOwner()?"false":"true";
 const ownerOnly=["settingsHouseholdName","settingsDefaultContext","settingsDefaultPriority","settingsReminderDay","settingsReminder2h","settingsReminder1h","settingsReminderAtTime","settingsOverdueMorning","settingsMorningTime","settingsOverdueAfternoon","settingsAfternoonTime","settingsConfirmComplete"];
 for(const id of ownerOnly){const el=$(id);if(el)el.disabled=!isOwner()}
 $("saveHouseholdSettings").hidden=!isOwner();
 $("saveReminderSettings").hidden=!isOwner();
 $("newCategoryForm").hidden=!isOwner();
 $("settingsAccessSection").hidden=!isOwner();
 $("assigneeManagementSection").hidden=!isOwner();
 $("contextSettingsList").innerHTML=(h.context_options||defaults.context_options).map(o=>'<div class="context-setting-row owner-setting" data-context="'+o.key+'"><div><label for="contextLabel_'+o.key+'">Nome exibido</label><input type="text" id="contextLabel_'+o.key+'" maxlength="32" value="'+escapeHtml(o.label)+'" '+(isOwner()?"":"disabled")+'></div><div><label for="contextColor_'+o.key+'">Cor do cartão</label><input type="color" id="contextColor_'+o.key+'" value="'+safeColor(o.color,"#edf1f2")+'" '+(isOwner()?"":"disabled")+'></div><label class="context-enabled-toggle"><input type="checkbox" id="contextEnabled_'+o.key+'" '+(o.enabled===false?"":"checked")+' '+(isOwner()?"":"disabled")+'><span>Disponível para novas tarefas</span></label></div>').join("");
 applyContextOptions(h.context_options);
 renderCategories();
 renderMemberSettings();
}
function escapeHtml(s){
 return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function renderCategories(){
 const list=$("categorySettingsList");
 if(!categories.length){list.innerHTML='<p class="sharecopy">Ainda não há categorias salvas. Você poderá criar uma acima.</p>';return}
 list.innerHTML=categories.map(c=>'<div class="category-setting-row" data-category-id="'+c.id+'"><div class="field"><label>Nome da categoria</label><input type="text" maxlength="60" data-category-name value="'+escapeHtml(c.name)+'" '+(isOwner()?"":"disabled")+'></div><div class="field"><label>Cor</label><input type="color" data-category-color value="'+safeColor(c.color,"#edf1f2")+'" '+(isOwner()?"":"disabled")+'></div><div class="category-setting-actions"><button type="button" class="btn secondary" data-category-save '+(isOwner()?"":"disabled")+' >Salvar</button><button type="button" class="btn danger" data-category-delete '+(isOwner()?"":"disabled")+' >Excluir</button></div></div>').join("");
}
function renderMemberSettings(){
 const list=$("assigneeSettingsList");if(!list)return;
 if(!isOwner()){list.innerHTML='<p class="settings-help">Somente o administrador pode alterar quem recebe novas atribuições.</p>';return}
 if(!memberSettings.length){list.innerHTML='<p class="settings-help">Nenhum participante encontrado.</p>';return}
 list.innerHTML=memberSettings.map(m=>{
  const isSelf=m.role==="owner",active=m.can_be_assignee!==false;
  return '<article class="assignee-setting-row" data-member-id="'+m.user_id+'"><div class="assignee-setting-person"><strong>'+escapeHtml(m.assignee_label||m.display_name)+'</strong><span>'+escapeHtml(m.email||"")+'</span><small>'+(m.role==="owner"?"Administrador":"Participante")+' · '+Number(m.active_assigned_count||0)+' tarefa(s) em andamento atribuída(s)</small><span class="assignee-status '+(active?"is-active":"is-inactive")+'">'+(active?"Ativo para novas atribuições":"Desativado para novas atribuições")+'</span></div><div class="assignee-setting-controls"><div class="field"><label>Nome exibido na agenda</label><input type="text" maxlength="60" data-member-label value="'+escapeHtml(m.assignee_label||"")+'" placeholder="'+escapeHtml(m.display_name||"Nome do participante")+'"></div><label class="assignee-enabled-toggle"><input type="checkbox" data-member-enabled '+(active?"checked":"")+' '+(isSelf?"disabled":"")+'><span>Pode receber novas tarefas</span></label><button type="button" class="btn secondary" data-member-save>Salvar responsável</button></div></article>';
 }).join("");
}
function contextOptionsFromForm(){
 return ["trabalho","casa","pessoal","outros"].map(key=>{
  const old=(shared?.context_options||defaults.context_options).find(o=>o.key===key)||defaults.context_options.find(o=>o.key===key);
  return {
   key,
   label:$("contextLabel_"+key).value.trim()||old.label,
   color:safeColor($("contextColor_"+key).value,old.color),
   enabled:$("contextEnabled_"+key)?.checked!==false
  };
 });
}

async function saveShared(){
 if(!isOwner()){message("householdSettingsMessage","Somente o administrador pode alterar estas opções.",true);return}
 const name=$("settingsHouseholdName").value.trim();
 if(!name){message("householdSettingsMessage","Informe um nome para a agenda.",true);return}
 const offsets=offsetsFromUi("settings");
 const contextOptions=contextOptionsFromForm();
 const activeContexts=contextOptions.filter(o=>o.enabled);
 if(!activeContexts.length){message("householdSettingsMessage","Mantenha pelo menos um contexto ativo para criar novas tarefas.",true);return}
 const requestedDefault=$("settingsDefaultContext").value;
 const defaultContext=activeContexts.some(o=>o.key===requestedDefault)?requestedDefault:activeContexts[0].key;
 $("settingsDefaultContext").value=defaultContext;
 const args={
  p_display_name:name,p_default_context:defaultContext,p_default_priority:$("settingsDefaultPriority").value,
  p_default_notification_offsets:offsets,
  p_overdue_morning_enabled:$("settingsOverdueMorning").checked,p_overdue_morning_time:$("settingsMorningTime").value||"09:00",
  p_overdue_afternoon_enabled:$("settingsOverdueAfternoon").checked,p_overdue_afternoon_time:$("settingsAfternoonTime").value||"15:00",
  p_confirm_before_complete:$("settingsConfirmComplete").checked,p_context_options:contextOptions
 };
 const buttons=[$("saveHouseholdSettings"),$("saveReminderSettings")];buttons.forEach(b=>{b.disabled=true});
 try{
  const {error}=await client().rpc("save_task_household_settings",args);if(error)throw error;
  message("householdSettingsMessage","Configurações compartilhadas salvas.");
  message("reminderSettingsMessage","Padrões de lembrete atualizados.");
  await load(true);
  if(window.ClarezaApp?.reloadTasks)await window.ClarezaApp.reloadTasks();
 }catch(err){message("householdSettingsMessage",err.message||"Não foi possível salvar.",true)}
 finally{buttons.forEach(b=>{b.disabled=false})}
}
$("openSettings").addEventListener("click",async()=>{
 if($("app").hidden||$("accessPendingPanel").hidden===false)return;
 $("mainContent").hidden=true;$("settingsScreen").hidden=false;
 try{await load(true)}catch(_e){}
});
$("backToTasks").addEventListener("click",()=>{
 $("settingsScreen").hidden=true;$("mainContent").hidden=false;
 const prefs=window.ClarezaApp?.getSettings?.()?.user;
 if(prefs)window.ClarezaApp?.applyUserSettings?.(prefs);
 window.ClarezaApp?.render?.();
});
$("saveProfileSettings").addEventListener("click",async()=>{
 const button=$("saveProfileSettings"),name=$("settingsDisplayName").value.trim(),theme=$("settingsTheme").value,compact=$("settingsCompact").checked;
 if(name.length>60){message("profileSettingsMessage","O nome deve ter até 60 caracteres.",true);return}
 button.disabled=true;
 try{
  const {error}=await client().rpc("save_task_user_settings",{p_display_name:name,p_theme:theme,p_compact_mode:compact});
  if(error)throw error;
  personal={...(personal||{}),display_name:name,theme,compact_mode:compact};
  window.ClarezaSettingsBridge?.applyTheme?.(theme,compact);
  window.ClarezaApp?.applyUserSettings?.(personal);
  window.ClarezaApp?.render?.();
  message("profileSettingsMessage","Perfil e aparência salvos.");
  if(window.ClarezaApp?.setDisplayName)window.ClarezaApp.setDisplayName(name);
 }catch(err){message("profileSettingsMessage",err.message||"Não foi possível salvar.",true)}
 finally{button.disabled=false}
});
$("saveHouseholdSettings").addEventListener("click",saveShared);
$("saveReminderSettings").addEventListener("click",saveShared);
$("newCategoryForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!isOwner())return;
 const name=$("newCategoryName").value.trim(),color=safeColor($("newCategoryColor").value,"#eaf2ff");
 if(!name)return;
 if(categories.some(c=>String(c.name||"").trim().toLocaleLowerCase("pt-BR")===name.toLocaleLowerCase("pt-BR"))){
  message("categorySettingsMessage","Já existe uma categoria com esse nome.",true);return;
 }
 const button=$("addCategoryBtn");button.disabled=true;
 try{
  const h=household();const {error}=await client().from("task_categories").insert({household_id:h.household_id,name,color,created_by:user().id});
  if(error)throw error;
  $("newCategoryName").value="";message("categorySettingsMessage","Categoria adicionada.");await load(true);
  if(window.ClarezaApp?.reloadTasks)await window.ClarezaApp.reloadTasks();
 }catch(err){message("categorySettingsMessage",err.message||"Não foi possível adicionar a categoria.",true)}
 finally{button.disabled=false}
});
$("assigneeSettingsList").addEventListener("click",async e=>{
 const button=e.target.closest("[data-member-save]");if(!button||!isOwner())return;
 const row=button.closest("[data-member-id]"),targetId=row?.dataset.memberId;
 if(!targetId)return;
 const label=row.querySelector("[data-member-label]").value.trim()||null;
 const enabled=row.querySelector("[data-member-enabled]").checked;
 const current=memberSettings.find(m=>m.user_id===targetId);
 if(label&&label.length>60){message("assigneeSettingsMessage","O nome exibido deve ter até 60 caracteres.",true);return}
 if(!enabled&&current?.can_be_assignee!==false&&Number(current?.active_assigned_count||0)>0&&!confirm("Desativar para novas tarefas? As "+Number(current.active_assigned_count)+" atribuição(ões) em andamento serão preservadas."))return;
 button.disabled=true;button.textContent="Salvando…";
 try{
  const {error}=await client().rpc("save_task_member_settings",{p_target_user_id:targetId,p_can_be_assignee:enabled,p_assignee_label:label});
  if(error)throw error;
  message("assigneeSettingsMessage",enabled?"Responsável atualizado e disponível para novas tarefas.":"Responsável desativado para novas tarefas. Acesso à agenda e atribuições existentes foram preservados.");
  await load(true);
  if(window.ClarezaApp?.reloadTasks)await window.ClarezaApp.reloadTasks();
 }catch(err){message("assigneeSettingsMessage",err.message||"Não foi possível atualizar o responsável.",true);button.disabled=false;button.textContent="Salvar responsável"}
});
$("categorySettingsList").addEventListener("click",async e=>{
 const row=e.target.closest("[data-category-id]");if(!row||!isOwner())return;
 const id=row.dataset.categoryId;
 if(e.target.closest("[data-category-save]")){
  const name=row.querySelector("[data-category-name]").value.trim(),color=safeColor(row.querySelector("[data-category-color]").value,"#edf1f2");
  if(!name){message("categorySettingsMessage","Informe o nome da categoria.",true);return}
  if(categories.some(c=>c.id!==id&&String(c.name||"").trim().toLocaleLowerCase("pt-BR")===name.toLocaleLowerCase("pt-BR"))){
   message("categorySettingsMessage","Já existe uma categoria com esse nome.",true);return;
  }
  const b=e.target.closest("[data-category-save]");b.disabled=true;b.textContent="Salvando…";
  try{
   const {data,error}=await client().rpc("manage_task_category",{p_category_id:id,p_action:"rename",p_name:name,p_color:color});
   if(error)throw error;
   const count=Number(data?.updated_tasks||0);
   message("categorySettingsMessage","Categoria atualizada"+(count?" e aplicada a "+count+" tarefa(s).":"."));
   await load(true);if(window.ClarezaApp?.reloadTasks)await window.ClarezaApp.reloadTasks();
  }catch(err){message("categorySettingsMessage",err.message||"Não foi possível salvar a categoria.",true);b.disabled=false;b.textContent="Salvar"}
 }
 if(e.target.closest("[data-category-delete]")){
  const name=row.querySelector("[data-category-name]").value;
  const usage=(window.ClarezaApp?.getTasks?.()||[]).filter(t=>String(t.category||"")===name).length;
  const detail=usage?" "+usage+" tarefa(s) ficarão sem categoria, mas serão mantidas.":"";
  if(!confirm('Excluir a categoria "'+name+'"?'+detail))return;
  const b=e.target.closest("[data-category-delete]");b.disabled=true;b.textContent="Excluindo…";
  try{
   const {data,error}=await client().rpc("manage_task_category",{p_category_id:id,p_action:"delete"});
   if(error)throw error;
   const count=Number(data?.uncategorized_tasks||0);
   message("categorySettingsMessage","Categoria excluída. "+count+" tarefa(s) foram mantidas sem categoria.");
   await load(true);if(window.ClarezaApp?.reloadTasks)await window.ClarezaApp.reloadTasks();
  }catch(err){message("categorySettingsMessage",err.message||"Não foi possível excluir a categoria.",true);b.disabled=false;b.textContent="Excluir"}
 }
});
$("changePasswordForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const p1=$("settingsNewPassword").value,p2=$("settingsNewPasswordConfirm").value,button=$("changePasswordBtn");
 if(p1.length<8){message("passwordSettingsMessage","Use pelo menos oito caracteres.",true);return}
 if(p1!==p2){message("passwordSettingsMessage","As senhas não coincidem.",true);return}
 button.disabled=true;button.textContent="Alterando…";
 try{const {error}=await client().auth.updateUser({password:p1});if(error)throw error;$("settingsNewPassword").value="";$("settingsNewPasswordConfirm").value="";message("passwordSettingsMessage","Senha alterada com sucesso.")}
 catch(err){message("passwordSettingsMessage",err.message||"Não foi possível alterar a senha.",true)}
 finally{button.disabled=false;button.textContent="Alterar senha"}
});
window.ClarezaSettingsBridge={
 load, get:()=>({shared,personal,categories}), applyContextOptions, applyTheme,
 onContextOptionsChange:applyContextOptions
};
window.addEventListener("load",()=>{if(!$("app").hidden)load(false)});
})();