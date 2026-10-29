(function(){
"use strict";
const $=id=>document.getElementById(id);
let shared=null,personal=null,categories=[],loadedFor=null,loading=false;
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
 const list=Array.isArray(opts)&&opts.length?opts:defaults.context_options;
 const sorted=["trabalho","casa","pessoal","outros"].map(k=>list.find(x=>x.key===k)||defaults.context_options.find(x=>x.key===k));
 for(const id of ["taskContext","settingsDefaultContext"]){
  const select=$(id);if(!select)continue;
  const previous=select.value;
  select.innerHTML=sorted.map(o=>'<option value="'+o.key+'">'+String(o.label||o.key).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))+'</option>').join("");
  if(sorted.some(o=>o.key===previous))select.value=previous;
 }
}
function applyTheme(theme,compact){
 const app=$("app");if(!app)return;
 let actual=theme||"light";
 if(actual==="system")actual=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
 app.dataset.theme=actual;
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
 $("contextSettingsList").innerHTML=(h.context_options||defaults.context_options).map(o=>'<div class="context-setting-row owner-setting" data-context="'+o.key+'"><div><label for="contextLabel_'+o.key+'">Nome exibido</label><input type="text" id="contextLabel_'+o.key+'" maxlength="32" value="'+escapeHtml(o.label)+'" '+(isOwner()?"":"disabled")+'></div><div><label for="contextColor_'+o.key+'">Cor do cartão</label><input type="color" id="contextColor_'+o.key+'" value="'+safeColor(o.color,"#edf1f2")+'" '+(isOwner()?"":"disabled")+'></div></div>').join("");
 renderCategories();
}
function escapeHtml(s){
 return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function renderCategories(){
 const list=$("categorySettingsList");
 if(!categories.length){list.innerHTML='<p class="sharecopy">Ainda não há categorias salvas. Você poderá criar uma acima.</p>';return}
 list.innerHTML=categories.map(c=>'<div class="category-setting-row" data-category-id="'+c.id+'"><div class="field"><label>Nome da categoria</label><input type="text" maxlength="60" data-category-name value="'+escapeHtml(c.name)+'" '+(isOwner()?"":"disabled")+'></div><div class="field"><label>Cor</label><input type="color" data-category-color value="'+safeColor(c.color,"#edf1f2")+'" '+(isOwner()?"":"disabled")+'></div><div class="field"><label>&nbsp;</label><button type="button" class="btn secondary" data-category-save '+(isOwner()?"":"disabled")+' aria-label="Salvar categoria">✓</button><button type="button" class="btn danger" data-category-delete '+(isOwner()?"":"disabled")+' aria-label="Excluir categoria" style="margin-top:5px">×</button></div></div>').join("");
}
function contextOptionsFromForm(){
 return ["trabalho","casa","pessoal","outros"].map(key=>{
  const old=(shared?.context_options||defaults.context_options).find(o=>o.key===key)||defaults.context_options.find(o=>o.key===key);
  return {key,label:$("contextLabel_"+key).value.trim()||old.label,color:safeColor($("contextColor_"+key).value,old.color)};
 });
}
async function saveShared(){
 if(!isOwner()){message("householdSettingsMessage","Somente o administrador pode alterar estas opções.",true);return}
 const name=$("settingsHouseholdName").value.trim();
 if(!name){message("householdSettingsMessage","Informe um nome para a agenda.",true);return}
 const offsets=offsetsFromUi("settings");
 const args={
  p_display_name:name,p_default_context:$("settingsDefaultContext").value,p_default_priority:$("settingsDefaultPriority").value,
  p_default_notification_offsets:offsets,
  p_overdue_morning_enabled:$("settingsOverdueMorning").checked,p_overdue_morning_time:$("settingsMorningTime").value||"09:00",
  p_overdue_afternoon_enabled:$("settingsOverdueAfternoon").checked,p_overdue_afternoon_time:$("settingsAfternoonTime").value||"15:00",
  p_confirm_before_complete:$("settingsConfirmComplete").checked,p_context_options:contextOptionsFromForm()
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
 const button=$("addCategoryBtn");button.disabled=true;
 try{
  const h=household();const {error}=await client().from("task_categories").insert({household_id:h.household_id,name,color,created_by:user().id});
  if(error)throw error;
  $("newCategoryName").value="";message("categorySettingsMessage","Categoria adicionada.");await load(true);
  if(window.ClarezaApp?.reloadTasks)await window.ClarezaApp.reloadTasks();
 }catch(err){message("categorySettingsMessage",err.message||"Não foi possível adicionar a categoria.",true)}
 finally{button.disabled=false}
});
$("categorySettingsList").addEventListener("click",async e=>{
 const row=e.target.closest("[data-category-id]");if(!row||!isOwner())return;
 const id=row.dataset.categoryId;
 if(e.target.closest("[data-category-save]")){
  const name=row.querySelector("[data-category-name]").value.trim(),color=safeColor(row.querySelector("[data-category-color]").value,"#edf1f2");
  if(!name){message("categorySettingsMessage","Informe o nome da categoria.",true);return}
  const b=e.target.closest("[data-category-save]");b.disabled=true;
  try{const {error}=await client().from("task_categories").update({name,color,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;message("categorySettingsMessage","Categoria atualizada.");await load(true);if(window.ClarezaApp?.reloadTasks)await window.ClarezaApp.reloadTasks()}
  catch(err){message("categorySettingsMessage",err.message||"Não foi possível salvar a categoria.",true);b.disabled=false}
 }
 if(e.target.closest("[data-category-delete]")){
  const name=row.querySelector("[data-category-name]").value;
  if(!confirm('Excluir a categoria "'+name+'"? As tarefas existentes não serão apagadas.'))return;
  const b=e.target.closest("[data-category-delete]");b.disabled=true;
  try{const {error}=await client().from("task_categories").delete().eq("id",id);if(error)throw error;message("categorySettingsMessage","Categoria excluída. As tarefas antigas continuam preservadas.");await load(true);if(window.ClarezaApp?.reloadTasks)await window.ClarezaApp.reloadTasks()}
  catch(err){message("categorySettingsMessage",err.message||"Não foi possível excluir a categoria.",true);b.disabled=false}
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