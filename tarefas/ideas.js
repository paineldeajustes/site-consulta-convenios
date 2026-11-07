/* Clareza — Diário de Ideias. Cada registro pertence ao usuário e à tarefa. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const app=()=>window.ClarezaApp;
const db=()=>app()?.client?.();
const me=()=>app()?.currentUser?.();
const fields="id,task_id,author_id,kind,body,is_pinned,created_at";
const types={idea:"Ideia",alternative:"Alternativa",decision:"Decisão",next_step:"Próximo passo"};
let taskId=null,ideas=[],request=0,busy=false,historyOpen=true;

function msg(text="",error=false){
 const el=$("ideasMessage");
 if(!el)return;
 el.textContent=text;el.hidden=!text;el.classList.toggle("is-error",error);
}
function node(tag,cls,text){
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(text!==undefined)el.textContent=text;
 return el;
}
function displayDate(iso){
 try{return new Date(iso).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});}
 catch{return iso||""}
}
function itemCard(item,isFocus){
 const card=node("article",isFocus?"ideas-focus":"ideas-history-item");
 const meta=node("div","ideas-entry-meta");
 const tag=node("span","ideas-kind",types[item.kind]||"Ideia");
 const stamp=node("span","",displayDate(item.created_at));
 meta.append(tag,stamp);
 if(item.is_pinned)meta.append(node("span","","📌 Em destaque"));
 card.append(meta,node("p","ideas-entry-body",item.body));
 const actions=node("div","ideas-entry-action");
 const button=node("button","ideas-pin",item.is_pinned?"Desafixar destaque":"Fixar como raciocínio atual");
 button.type="button";button.disabled=busy;
 button.setAttribute("aria-label",item.is_pinned?"Remover destaque desta anotação":"Destacar esta anotação como raciocínio atual");
 button.addEventListener("click",()=>setPin(item));
 actions.append(button);card.append(actions);
 return card;
}
function render(){
 const count=ideas.length;
 $("ideasCount").textContent=count+" "+(count===1?"registro":"registros");
 const focus=ideas.find(row=>row.is_pinned)||ideas[0]||null;
 const area=$("ideasCurrent");
 area.replaceChildren();
 area.classList.toggle("is-empty",!focus);
 if(focus)area.append(itemCard(focus,true));
 else area.append(node("p","ideas-history-empty","Nenhuma ideia registrada ainda. Comece anotando por onde deseja continuar."));
 const older=ideas.filter(row=>row.id!==focus?.id);
 $("ideasHistoryCount").textContent="Histórico ("+older.length+")";
 $("ideasHistoryChevron").textContent=historyOpen?"⌃":"⌄";
 $("ideasHistoryList").hidden=!historyOpen;
 const list=$("ideasHistoryList");list.replaceChildren();
 if(!older.length)list.append(node("p","ideas-history-empty","As anotações anteriores aparecerão aqui, da mais nova para a mais antiga."));
 else older.forEach(entry=>list.append(itemCard(entry,false)));
 $("ideasAdd").disabled=busy||!taskId||!$("ideasDraft").value.trim();
}
async function open(task){
 const n=++request;taskId=task?.id||null;ideas=[];busy=false;historyOpen=true;
 $("ideasDraft").value="";$("ideasKind").value="idea";
 $("ideasComposer").hidden=!taskId;
 $("ideasUnsaved").hidden=!!taskId;
 msg("");
 if(!taskId){render();return}
 $("ideasCurrent").replaceChildren(node("p","ideas-history-empty","Carregando suas ideias…"));
 $("ideasHistoryList").replaceChildren();
 $("ideasAdd").disabled=true;
 const client=db(), user=me();
 if(!client||!user?.id){msg("Faça login para consultar suas ideias.",true);render();return}
 try{
  const {data,error}=await client.from("task_ideas").select(fields)
    .eq("task_id",taskId).eq("author_id",user.id)
    .order("created_at",{ascending:false}).limit(500);
  if(error)throw error;
  if(n!==request)return;
  ideas=data||[];render();
 }catch(error){
  if(n!==request)return;
  msg("Não foi possível carregar as ideias: "+(error.message||"Verifique sua conexão."),true);
  render();
 }
}
async function add(){
 const body=$("ideasDraft").value.trim(),kind=$("ideasKind").value;
 if(!taskId||busy||!body)return;
 if(body.length>6000){msg("O texto deve ter no máximo 6.000 caracteres.",true);return}
 const id=taskId,n=request;busy=true;render();msg("");
 try{
  const user=me();
  if(!user?.id)throw new Error("Entre novamente para registrar ideias.");
  const {data,error}=await db().from("task_ideas")
   .insert({task_id:id,author_id:user.id,kind,body})
   .select(fields).single();
  if(error)throw error;
  if(n!==request)return;
  ideas=[data,...ideas];
  $("ideasDraft").value="";$("ideasKind").value="idea";
  msg("Ideia registrada. O histórico foi preservado.");
 }catch(error){if(n===request)msg("Não foi possível salvar: "+(error.message||"Tente novamente."),true)}
 finally{if(n===request){busy=false;render()}}
}
async function setPin(entry){
 if(!taskId||busy)return;
 const id=taskId,n=request;busy=true;render();msg("");
 try{
  const client=db();
  const pinned=ideas.find(row=>row.is_pinned);
  if(pinned){
   const {error}=await client.from("task_ideas")
    .update({is_pinned:false}).eq("id",pinned.id).eq("task_id",id);
   if(error)throw error;
  }
  if(!entry.is_pinned){
   const {error}=await client.from("task_ideas")
    .update({is_pinned:true}).eq("id",entry.id).eq("task_id",id);
   if(error)throw error;
  }
  const {data,error}=await client.from("task_ideas").select(fields)
   .eq("task_id",id).eq("author_id",me().id)
   .order("created_at",{ascending:false}).limit(500);
  if(error)throw error;
  if(n!==request)return;
  ideas=data||[];
  msg(entry.is_pinned?"Destaque removido. O registro mais recente volta a aparecer primeiro.":"Linha de raciocínio fixada em destaque.");
 }catch(error){
  if(n===request){
   msg("Não foi possível alterar o destaque: "+(error.message||"Tente novamente."),true);
   // Recarrega os dados para recuperar um eventual destaque anterior.
   const {data}=await db().from("task_ideas").select(fields)
    .eq("task_id",id).eq("author_id",me()?.id).order("created_at",{ascending:false}).limit(500);
   if(n===request&&data)ideas=data;
  }
 }finally{if(n===request){busy=false;render()}}
}
$("ideasAdd").addEventListener("click",add);
$("ideasDraft").addEventListener("input",()=>render());
$("ideasDraft").addEventListener("keydown",e=>{
 if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();add()}
});
$("ideasHistoryToggle").addEventListener("click",()=>{
 historyOpen=!historyOpen;render();
 $("ideasHistoryToggle").setAttribute("aria-expanded",String(historyOpen));
});
window.ClarezaIdeas={onOpenTask:open,onCloseTask:()=>{request++;taskId=null;ideas=[];busy=false}};
})();