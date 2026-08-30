const $=id=>document.getElementById(id);
const weekGrid=$("weekGrid"),prevWeek=$("prevWeek"),nextWeek=$("nextWeek"),todayWeek=$("todayWeek");
const modal=$("modal"),form=$("requestForm"),requestId=$("requestId"),formDate=$("formDate"),slot=$("slot");
const studentNumber=$("studentNumber"),studentName=$("studentName"),songTitle=$("songTitle"),artistName=$("artistName"),url=$("url"),editCode=$("editCode");
const modalKicker=$("modalKicker"),modalTitle=$("modalTitle"),modalDescription=$("modalDescription"),checkBtn=$("checkBtn");
const inspectBox=$("inspectBox"),inspectText=$("inspectText"),inspectSteps=$("inspectSteps"),formMessage=$("formMessage"),deleteBtn=$("deleteBtn"),toast=$("toast");
let weekStart=getMonday(new Date()),requests=[],lastFingerprint="",lastPass=false;

function ymd(d){const x=new Date(d-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)}
function localToday(){return ymd(new Date())}
function getMonday(date){const d=new Date(date);d.setHours(0,0,0,0);const day=d.getDay()||7;d.setDate(d.getDate()-day+1);return d}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function fmtHead(d){return {weekday:new Intl.DateTimeFormat("ko-KR",{weekday:"short"}).format(d).replace("요일",""),day:d.getDate(),month:d.getMonth()+1}}
function fmtFull(v){return new Intl.DateTimeFormat("ko-KR",{month:"long",day:"numeric",weekday:"short"}).format(new Date(v+"T00:00:00"))}
function esc(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function notify(t){toast.textContent=t;toast.classList.remove("hidden");setTimeout(()=>toast.classList.add("hidden"),2200)}
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
  lastFingerprint="";lastPass=false;
  inspectBox.className="inspect neutral wide";
  inspectText.textContent="곡 정보를 입력하고 안전검사를 눌러주세요.";
  if(inspectSteps){
    inspectSteps.querySelectorAll(".inspect-step").forEach(el=>el.classList.remove("active","done","fail"));
    inspectSteps.querySelectorAll(".inspect-line").forEach(el=>el.classList.remove("done"));
  }
}
function setInspect(s,t){inspectBox.className=`inspect ${s} wide`;inspectText.textContent=t}

async function loadWeek(){
  const start=ymd(weekStart),end=ymd(addDays(weekStart,6));
  weekGrid.innerHTML='<div class="calendar-loading">주간 신청 현황을 불러오는 중...</div>';
  try{requests=await fetch(`/api/requests-range?start=${start}&end=${end}`).then(r=>r.json());renderWeek()}
  catch{weekGrid.innerHTML='<div class="calendar-loading">서버와 연결할 수 없습니다.</div>'}
}

function renderWeek(){
  weekGrid.innerHTML="";
  const today=localToday();

  // header row
  const corner=document.createElement("div");
  corner.className="week-corner";
  corner.innerHTML="<b>순서</b>";
  weekGrid.appendChild(corner);

  for(let c=0;c<7;c++){
    const d=addDays(weekStart,c),info=fmtHead(d),dateStr=ymd(d);
    const head=document.createElement("div");
    head.className=`day-head ${dateStr===today?"today":""}`;
    head.innerHTML=`<span>${info.weekday}</span><b>${info.month}/${info.day}</b>`;
    weekGrid.appendChild(head);
  }

  for(let s=1;s<=7;s++){
    const rowHead=document.createElement("div");
    rowHead.className="slot-head";
    rowHead.innerHTML=`<b>${s}</b><span>순서</span>`;
    weekGrid.appendChild(rowHead);

    for(let c=0;c<7;c++){
      const d=addDays(weekStart,c),dateStr=ymd(d),past=dateStr<today;
      const item=requests.find(x=>x.requestDate===dateStr&&x.slot===s);
      const cell=document.createElement("div");

      if(past){
        cell.className="calendar-cell past-cell";
        cell.innerHTML=`<span class="cell-slot">${s}</span><span class="cell-muted">지난 날짜</span>`;
      }else if(item){
        cell.className="calendar-cell filled-cell";
        cell.innerHTML=`<span class="cell-slot">${s}</span><strong title="${esc(item.songTitle)}">${esc(item.songTitle)}</strong><small title="${esc(item.artistName)}">${esc(item.artistName)}</small><button data-edit="${item.id}">수정</button>`;
      }else{
        cell.className="calendar-cell free-cell";
        cell.innerHTML=`<span class="cell-slot">${s}</span><button data-new-date="${dateStr}" data-new-slot="${s}"><b>＋</b><span>신청</span></button>`;
      }
      weekGrid.appendChild(cell);
    }
  }

  document.querySelectorAll("[data-new-date]").forEach(b=>b.onclick=()=>openNew(b.dataset.newDate,Number(b.dataset.newSlot)));
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>{const x=requests.find(r=>r.id===b.dataset.edit);if(x)openEdit(x)});
}

function resetForm(){form.reset();requestId.value="";formMessage.textContent="";deleteBtn.classList.add("hidden");resetInspect()}
function openNew(date,n){resetForm();modalKicker.textContent="SONG REQUEST";modalTitle.textContent="기상곡 신청";modalDescription.textContent=`${fmtFull(date)} · ${n}번 순서`;formDate.value=date;slot.value=n;modal.classList.remove("hidden");document.body.style.overflow="hidden"}
function openEdit(x){resetForm();modalKicker.textContent="EDIT REQUEST";modalTitle.textContent="신청 수정";modalDescription.textContent="신청 비밀번호를 입력하면 수정할 수 있습니다.";requestId.value=x.id;formDate.value=x.requestDate;slot.value=x.slot;studentNumber.value=x.studentNumber;studentName.value=x.studentName;songTitle.value=x.songTitle;artistName.value=x.artistName;url.value=x.url;deleteBtn.classList.remove("hidden");modal.classList.remove("hidden");document.body.style.overflow="hidden"}
function close(){modal.classList.add("hidden");document.body.style.overflow=""}
document.querySelectorAll("[data-close]").forEach(x=>x.onclick=close);
[songTitle,artistName,url].forEach(x=>x.addEventListener("input",resetInspect));

async function inspect(){
  if(!songTitle.value.trim()||!artistName.value.trim()||!url.value.trim()){
    setInspect("fail","곡 제목, 가수, YouTube URL을 모두 입력해주세요.");
    setProgress(1,"fail");
    return false;
  }

  checkBtn.disabled=true;
  lastPass=false;
  setInspect("checking","① YouTube 링크와 영상 정보를 확인하고 있습니다...");
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

    if(!r.ok||!j.ok){
      lastPass=false;
      const failStep={
        youtube:1,"metadata-filter":1,"youtube-match":1,catalog:2,rating:3
      }[j.stage]||2;
      setProgress(failStep,"fail");
      setInspect("fail",(j.message||"곡 안전검사를 완료하지 못했습니다.")+(j.detail?` ${j.detail}`:""));
      return false;
    }

    setProgress(3,"active");
    const matched=j.matchedSong?`${j.matchedSong.title} · ${j.matchedSong.artist}`:"일치 음원";
    setInspect("checking",`③ ${matched}의 Explicit 등급을 확인하고 있습니다...`);
    await new Promise(resolve=>setTimeout(resolve,180));

    lastPass=true;
    setProgress(4,"done");
    setInspect("pass","④ "+(j.message||"검사 완료 · Explicit 표시 없음"));
    return true;
  }catch(err){
    lastPass=false;
    setProgress(2,"fail");
    setInspect("fail","곡 안전검사 서비스와 연결하지 못했습니다. 잠시 후 다시 시도해주세요.");
    return false;
  }finally{
    checkBtn.disabled=false;
  }
}
checkBtn.onclick=inspect;

form.onsubmit=async e=>{
  e.preventDefault();formMessage.textContent="";
  if(fingerprint()!==lastFingerprint||!lastPass){if(!await inspect()){formMessage.textContent="안전 검사를 통과해야 신청할 수 있습니다.";return}}
  const body={requestDate:formDate.value,slot:Number(slot.value),studentNumber:studentNumber.value.trim(),studentName:studentName.value.trim(),songTitle:songTitle.value.trim(),artistName:artistName.value.trim(),url:url.value.trim(),editCode:editCode.value};
  const editing=Boolean(requestId.value);
  const r=await fetch(editing?`/api/requests/${requestId.value}`:"/api/requests",{method:editing?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json();if(!r.ok){formMessage.textContent=j.message||"저장하지 못했습니다.";return}
  close();notify(editing?"수정되었습니다.":"신청되었습니다.");await loadWeek();
};
deleteBtn.onclick=async()=>{
  if(!editCode.value){formMessage.textContent="삭제 비밀번호를 입력해주세요.";return}
  if(!confirm("이 신청을 삭제할까요?"))return;
  const r=await fetch(`/api/requests/${requestId.value}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({editCode:editCode.value})});
  const j=await r.json();if(!r.ok){formMessage.textContent=j.message;return}close();notify("삭제되었습니다.");loadWeek();
};
prevWeek.onclick=()=>{weekStart=addDays(weekStart,-7);loadWeek()};
nextWeek.onclick=()=>{weekStart=addDays(weekStart,7);loadWeek()};
todayWeek.onclick=()=>{weekStart=getMonday(new Date());loadWeek()};
loadWeek();
