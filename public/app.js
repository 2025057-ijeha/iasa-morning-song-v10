const $ = id => document.getElementById(id);
const datePicker=$("datePicker"),slotGrid=$("slotGrid"),scheduleTitle=$("scheduleTitle"),aiBadge=$("aiBadge");
const modal=$("modal"),form=$("requestForm"),requestId=$("requestId"),formDate=$("formDate"),slot=$("slot");
const studentNumber=$("studentNumber"),studentName=$("studentName"),songTitle=$("songTitle"),artistName=$("artistName"),url=$("url"),editCode=$("editCode");
const modalKicker=$("modalKicker"),modalTitle=$("modalTitle"),modalDescription=$("modalDescription"),checkBtn=$("checkBtn");
const inspectBox=$("inspectBox"),inspectText=$("inspectText"),inspectSteps=$("inspectSteps"),formMessage=$("formMessage"),deleteBtn=$("deleteBtn"),toast=$("toast");
let requests=[],lastFingerprint="",lastDecision="";

function localToday(){const d=new Date();return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function fmtDate(v){return new Intl.DateTimeFormat("ko-KR",{month:"long",day:"numeric",weekday:"short"}).format(new Date(v+"T00:00:00"))}
function esc(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function notify(text){toast.textContent=text;toast.classList.remove("hidden");setTimeout(()=>toast.classList.add("hidden"),2200)}
function fingerprint(){return [songTitle.value.trim(),artistName.value.trim(),url.value.trim()].join("|")}
function setProgress(step,status="active"){
  if(!inspectSteps)return;
  inspectSteps.querySelectorAll(".inspect-step").forEach((el,i)=>{
    el.classList.remove("active","done","fail");
    const n=i+1;
    if(n<step) el.classList.add("done");
    else if(n===step) el.classList.add(status);
  });
  inspectSteps.querySelectorAll(".inspect-line").forEach((line,i)=>{
    line.classList.toggle("done", i < step-1);
  });
}
function resetInspect(){
  lastFingerprint="";lastDecision="";
  inspectBox.className="inspect neutral wide";
  inspectText.textContent="곡 제목, 가수, 유튜브 주소를 입력한 뒤 안전검사를 눌러주세요.";
  if(inspectSteps){
    inspectSteps.querySelectorAll(".inspect-step").forEach(el=>el.classList.remove("active","done","fail"));
    inspectSteps.querySelectorAll(".inspect-line").forEach(el=>el.classList.remove("done"));
  }
}
function setInspect(state,text){
  inspectBox.className=`inspect ${state} wide`;
  inspectText.textContent=text
}

async function loadStatus(){
  try{
    const s=await fetch("/api/system-status").then(r=>r.json());
    aiBadge.textContent=s.message;
    aiBadge.className=`ai-badge ${s.aiEnabled?"on":"off"}`;
  }catch{}
}
async function loadRequests(){
  scheduleTitle.textContent=`${fmtDate(datePicker.value)} 신청 현황`;
  slotGrid.innerHTML='<div class="slot-card"><span>불러오는 중...</span></div>';
  try{
    const r=await fetch(`/api/requests?date=${encodeURIComponent(datePicker.value)}`);
    requests=await r.json();render();
  }catch{slotGrid.innerHTML='<div class="slot-card">서버와 연결할 수 없습니다.</div>'}
}
function render(){
  slotGrid.innerHTML="";
  for(let i=1;i<=7;i++){
    const item=requests.find(x=>x.slot===i);
    const card=document.createElement("article");
    card.className=`slot-card ${item?"":"empty"}`;
    if(item){
      card.innerHTML=`<div><span class="slot-number">${i}번</span><h3 class="song-title">${esc(item.songTitle)}</h3><div class="artist">${esc(item.artistName)}</div><div class="requester">${esc(item.studentNumber)} · ${esc(item.studentName)}</div></div>
      ${item.inspectionStatus==="review"?'<div class="public-review-badge">관리자 확인 필요</div>':item.inspectionStatus==="admin_pass"?'<div class="public-pass-badge">관리자 확인 완료</div>':""}
      <div class="card-actions"><a href="${esc(item.url)}" target="_blank" rel="noopener">YouTube ↗</a><button data-edit="${item.id}">수정</button></div>`;
    }else{
      card.innerHTML=`<div><span class="slot-number">${i}번</span><h3 class="empty-title">신청 가능</h3><div class="empty-copy">${i}번째 기상곡 자리가 비어 있습니다.</div></div>
      <div><button class="pill primary" data-new="${i}">${i}번 신청하기</button></div>`;
    }
    slotGrid.appendChild(card);
  }
  document.querySelectorAll("[data-new]").forEach(b=>b.onclick=()=>openNew(Number(b.dataset.new)));
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>{const x=requests.find(r=>r.id===b.dataset.edit);if(x)openEdit(x)});
}
function resetForm(){form.reset();requestId.value="";formMessage.textContent="";deleteBtn.classList.add("hidden");resetInspect()}
function openNew(n){resetForm();modalKicker.textContent="SONG REQUEST";modalTitle.textContent="기상곡 신청";modalDescription.textContent=`${fmtDate(datePicker.value)} · ${n}번 순서`;formDate.value=datePicker.value;slot.value=String(n);modal.classList.remove("hidden");document.body.style.overflow="hidden"}
function openEdit(x){resetForm();modalKicker.textContent="EDIT REQUEST";modalTitle.textContent="신청 수정";modalDescription.textContent="신청 시 설정한 비밀번호로 수정할 수 있습니다.";requestId.value=x.id;formDate.value=x.requestDate;slot.value=x.slot;studentNumber.value=x.studentNumber;studentName.value=x.studentName;songTitle.value=x.songTitle;artistName.value=x.artistName;url.value=x.url;deleteBtn.classList.remove("hidden");modal.classList.remove("hidden");document.body.style.overflow="hidden"}
function close(){modal.classList.add("hidden");document.body.style.overflow=""}
document.querySelectorAll("[data-close]").forEach(x=>x.onclick=close);
document.addEventListener("keydown",e=>{if(e.key==="Escape")close()});
[songTitle,artistName,url].forEach(x=>x.addEventListener("input",resetInspect));

async function inspect(){
  if(!songTitle.value.trim()||!artistName.value.trim()||!url.value.trim()){
    setInspect("fail","곡 제목, 가수, YouTube URL을 모두 입력해주세요.");
    setProgress(1,"fail");
    return false;
  }

  checkBtn.disabled=true;
  lastDecision="";
  setInspect("checking","① YouTube 링크를 확인하고 있습니다...");
  setProgress(1,"active");

  try{
    await new Promise(resolve=>setTimeout(resolve,120));
    setProgress(2,"active");
    setInspect("checking","② 곡 제목과 가수로 한국·해외 음원 카탈로그를 검색하고 있습니다...");

    const r=await fetch("/api/check-song",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        songTitle:songTitle.value.trim(),
        artistName:artistName.value.trim(),
        url:url.value.trim()
      })
    });
    const j=await r.json();

    lastFingerprint=fingerprint();

    if(j.status==="block"||!j.canSubmit){
      lastDecision="block";
      const failStep={youtube:1,"metadata-filter":1,rating:3}[j.stage]||2;
      setProgress(failStep,"fail");
      setInspect("fail",(j.message||"이 곡은 신청할 수 없습니다.")+(j.detail?` ${j.detail}`:""));
      return false;
    }

    if(j.status==="review"){
      lastDecision="review";
      const reviewStep={
        youtube:1,"youtube-service":1,catalog:2,service:2,"youtube-match":2,conflict:3,rating:3,"rating-unknown":3
      }[j.stage]||3;
      setProgress(reviewStep,"active");
      setInspect("review",(j.message||"관리자 검사 필요 · 자동검사를 확정하지 못했습니다.")+" "+(j.detail||"신청은 저장할 수 있으며 관리자가 확인합니다."));
      return true;
    }

    setProgress(3,"active");
    const matched=j.matchedSong?`${j.matchedSong.title} · ${j.matchedSong.artist}`:"일치 음원";
    setInspect("checking",`③ ${matched}의 Explicit 등급을 확인하고 있습니다...`);
    await new Promise(resolve=>setTimeout(resolve,180));

    lastDecision="pass";
    setProgress(4,"done");
    setInspect("pass","④ "+(j.message||"검사 완료 · Explicit 표시 없음"));
    return true;
  }catch(err){
    lastDecision="";
    setProgress(2,"fail");
    setInspect("fail","사이트 서버와 연결하지 못했습니다. 연결을 확인한 뒤 다시 검사해주세요.");
    return false;
  }finally{
    checkBtn.disabled=false;
  }
}
checkBtn.onclick=inspect;

form.onsubmit=async e=>{
  e.preventDefault();formMessage.textContent="";
  if(fingerprint()!==lastFingerprint||!["pass","review"].includes(lastDecision)){if(!await inspect()){formMessage.textContent="차단 판정을 받은 곡은 신청할 수 없습니다.";return}}
  const body={requestDate:formDate.value,slot:Number(slot.value),studentNumber:studentNumber.value.trim(),studentName:studentName.value.trim(),songTitle:songTitle.value.trim(),artistName:artistName.value.trim(),url:url.value.trim(),editCode:editCode.value};
  const editing=Boolean(requestId.value);
  try{
    const r=await fetch(editing?`/api/requests/${requestId.value}`:"/api/requests",{method:editing?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const j=await r.json();if(!r.ok){formMessage.textContent=j.message||"저장하지 못했습니다.";return}
    datePicker.value=formDate.value;close();notify(j.review?"신청 저장 완료 · 관리자 검사 필요":(editing?"신청이 수정되었습니다.":"기상곡 신청이 완료되었습니다."));await loadRequests();
  }catch{formMessage.textContent="서버와 연결할 수 없습니다."}
};
deleteBtn.onclick=async()=>{
  if(!editCode.value){formMessage.textContent="삭제하려면 수정 비밀번호를 입력해주세요.";return}
  if(!confirm("이 신청을 삭제할까요?"))return;
  const r=await fetch(`/api/requests/${requestId.value}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({editCode:editCode.value})});
  const j=await r.json();if(!r.ok){formMessage.textContent=j.message;return}close();notify("삭제되었습니다.");loadRequests();
};
datePicker.onchange=loadRequests;
datePicker.value=localToday();loadStatus();loadRequests();
