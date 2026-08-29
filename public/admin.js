
const $ = id => document.getElementById(id);
const loginPanel=$("loginPanel"),adminPanel=$("adminPanel"),loginForm=$("loginForm"),
adminPassword=$("adminPassword"),loginMessage=$("loginMessage"),adminList=$("adminList"),
adminEmpty=$("adminEmpty"),searchInput=$("searchInput"),refreshBtn=$("refreshBtn"),
logoutBtn=$("logoutBtn"),totalCount=$("totalCount"),todayCount=$("todayCount"),
modal=$("adminModal"),closeModal=$("closeAdminModal"),editForm=$("adminEditForm"),
editId=$("editId"),editDate=$("editDate"),editSlot=$("editSlot"),
editStudentNumber=$("editStudentNumber"),editStudentName=$("editStudentName"),
editSongTitle=$("editSongTitle"),editArtistName=$("editArtistName"),editUrl=$("editUrl"),
editMessage=$("editMessage"),deleteBtn=$("adminDeleteBtn");

let requests=[];

function esc(v){
  return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}
function localToday(){
  const d=new Date(), z=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return z.toISOString().slice(0,10);
}
function showLogin(msg=""){
  loginPanel.classList.remove("hidden");
  adminPanel.classList.add("hidden");
  loginMessage.textContent=msg;
}
function showAdmin(){
  loginPanel.classList.add("hidden");
  adminPanel.classList.remove("hidden");
}
async function checkStatus(){
  try{
    const r=await fetch("/api/admin/status");
    const j=await r.json();
    if(j.authenticated){showAdmin();await loadRequests();}
    else showLogin();
  }catch{showLogin("서버에 연결할 수 없습니다.");}
}
loginForm.addEventListener("submit",async e=>{
  e.preventDefault();
  loginMessage.textContent="로그인 확인 중...";
  const r=await fetch("/api/admin/login",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({password:adminPassword.value})
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok){loginMessage.textContent=j.message||"로그인에 실패했습니다.";return;}
  adminPassword.value="";
  showAdmin();
  await loadRequests();
});
logoutBtn.onclick=async()=>{
  await fetch("/api/admin/logout",{method:"POST"});
  requests=[];
  showLogin("로그아웃되었습니다.");
};

async function loadRequests(){
  const r=await fetch("/api/admin/requests");
  if(r.status===401){showLogin("로그인이 만료되었습니다.");return;}
  requests=await r.json();
  render();
}
function render(){
  const q=searchInput.value.trim().toLowerCase();
  const filtered=requests.filter(x=>{
    const hay=[x.requestDate,x.slot,x.studentNumber,x.studentName,x.songTitle,x.artistName,x.url].join(" ").toLowerCase();
    return !q||hay.includes(q);
  });
  totalCount.textContent=requests.length;
  todayCount.textContent=requests.filter(x=>x.requestDate===localToday()).length;
  adminEmpty.classList.toggle("hidden",filtered.length>0);
  adminList.innerHTML=filtered.map(x=>`
    <article class="admin-request-card">
      <div class="admin-request-top">
        <div class="admin-date-slot"><span>${esc(x.requestDate)}</span><b>${esc(x.slot)}번</b></div>
        <button class="small-edit-btn" data-edit="${esc(x.id)}" type="button">수정</button>
      </div>
      <div class="admin-song">
        <h3>${esc(x.songTitle)}</h3>
        <p>${esc(x.artistName)}</p>
      </div>
      <div class="admin-meta">
        <span>학번 ${esc(x.studentNumber)}</span>
        <span>${esc(x.studentName)}</span>
      </div>
      <a class="admin-youtube" href="${esc(x.url)}" target="_blank" rel="noopener">YouTube 열기 ↗</a>
    </article>
  `).join("");
  adminList.querySelectorAll("[data-edit]").forEach(btn=>btn.onclick=()=>openEdit(btn.dataset.edit));
}
searchInput.oninput=render;
refreshBtn.onclick=loadRequests;

function openEdit(id){
  const x=requests.find(r=>String(r.id)===String(id));
  if(!x)return;
  editId.value=x.id;
  editDate.value=x.requestDate;
  editSlot.value=x.slot;
  editStudentNumber.value=x.studentNumber||"";
  editStudentName.value=x.studentName||"";
  editSongTitle.value=x.songTitle||"";
  editArtistName.value=x.artistName||"";
  editUrl.value=x.url||"";
  editMessage.textContent="";
  modal.classList.remove("hidden");
}
function hideModal(){modal.classList.add("hidden");}
closeModal.onclick=hideModal;
modal.addEventListener("click",e=>{if(e.target===modal)hideModal();});

editForm.addEventListener("submit",async e=>{
  e.preventDefault();
  editMessage.textContent="저장 중...";
  const body={
    requestDate:editDate.value,slot:Number(editSlot.value),
    studentNumber:editStudentNumber.value.trim(),
    studentName:editStudentName.value.trim(),
    songTitle:editSongTitle.value.trim(),
    artistName:editArtistName.value.trim(),
    url:editUrl.value.trim()
  };
  const r=await fetch(`/api/admin/requests/${encodeURIComponent(editId.value)}`,{
    method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok){editMessage.textContent=j.message||"수정하지 못했습니다.";return;}
  hideModal();
  await loadRequests();
});

deleteBtn.onclick=async()=>{
  if(!confirm("이 신청곡을 정말 삭제할까요?"))return;
  editMessage.textContent="삭제 중...";
  const r=await fetch(`/api/admin/requests/${encodeURIComponent(editId.value)}`,{method:"DELETE"});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){editMessage.textContent=j.message||"삭제하지 못했습니다.";return;}
  hideModal();
  await loadRequests();
};

checkStatus();
