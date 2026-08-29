const $ = id => document.getElementById(id);
const loginPanel=$("loginPanel"),adminPanel=$("adminPanel"),loginForm=$("loginForm"),
adminPassword=$("adminPassword"),loginMessage=$("loginMessage"),searchInput=$("searchInput"),
refreshBtn=$("refreshBtn"),logoutBtn=$("logoutBtn"),adminTitle=$("adminTitle"),adminSubtitle=$("adminSubtitle"),
requestTab=$("requestTab"),boardTab=$("boardTab"),requestView=$("requestView"),boardView=$("boardView"),
adminList=$("adminList"),adminEmpty=$("adminEmpty"),totalCount=$("totalCount"),todayCount=$("todayCount"),
boardAdminList=$("boardAdminList"),boardAdminEmpty=$("boardAdminEmpty"),postCount=$("postCount"),
commentCount=$("commentCount"),likeCount=$("likeCount"),
modal=$("adminModal"),closeModal=$("closeAdminModal"),editForm=$("adminEditForm"),editId=$("editId"),
editDate=$("editDate"),editSlot=$("editSlot"),editStudentNumber=$("editStudentNumber"),
editStudentName=$("editStudentName"),editSongTitle=$("editSongTitle"),editArtistName=$("editArtistName"),
editUrl=$("editUrl"),editMessage=$("editMessage"),deleteBtn=$("adminDeleteBtn"),
boardModal=$("boardAdminModal"),closeBoardModal=$("closeBoardAdminModal"),boardEditForm=$("boardEditForm"),
boardEditId=$("boardEditId"),boardEditTitle=$("boardEditTitle"),boardEditContent=$("boardEditContent"),
boardEditMessage=$("boardEditMessage"),adminDeletePostBtn=$("adminDeletePostBtn"),
boardAdminComments=$("boardAdminComments"),boardModalCommentCount=$("boardModalCommentCount");

let requests=[];
let posts=[];
let activeMode="requests";

function esc(v){
  return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}
function localToday(){
  const d=new Date(),z=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return z.toISOString().slice(0,10);
}
function formatDateTime(v){
  if(!v)return "";
  try{return new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(v));}
  catch{return String(v);}
}
function showLogin(msg=""){
  loginPanel.classList.remove("hidden");adminPanel.classList.add("hidden");loginMessage.textContent=msg;
}
function showAdmin(){loginPanel.classList.add("hidden");adminPanel.classList.remove("hidden");}

async function checkStatus(){
  try{
    const r=await fetch("/api/admin/status"),j=await r.json();
    if(j.authenticated){showAdmin();await Promise.all([loadRequests(false),loadPosts(false)]);renderActive();}
    else showLogin();
  }catch{showLogin("서버에 연결할 수 없습니다.");}
}

loginForm.addEventListener("submit",async e=>{
  e.preventDefault();loginMessage.textContent="로그인 확인 중...";
  const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:adminPassword.value})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){loginMessage.textContent=j.message||"로그인에 실패했습니다.";return;}
  adminPassword.value="";showAdmin();await Promise.all([loadRequests(false),loadPosts(false)]);renderActive();
});

logoutBtn.onclick=async()=>{
  await fetch("/api/admin/logout",{method:"POST"});requests=[];posts=[];showLogin("로그아웃되었습니다.");
};

async function loadRequests(renderAfter=true){
  const r=await fetch("/api/admin/requests");
  if(r.status===401){showLogin("로그인이 만료되었습니다.");return;}
  requests=await r.json();if(renderAfter&&activeMode==="requests")renderRequests();
}
async function loadPosts(renderAfter=true){
  const r=await fetch("/api/admin/posts");
  if(r.status===401){showLogin("로그인이 만료되었습니다.");return;}
  posts=await r.json();if(renderAfter&&activeMode==="board")renderPosts();
}

function setMode(mode){
  activeMode=mode;searchInput.value="";
  const board=mode==="board";
  requestTab.classList.toggle("active",!board);boardTab.classList.toggle("active",board);
  requestView.classList.toggle("hidden",board);boardView.classList.toggle("hidden",!board);
  adminTitle.textContent=board?"게시판 관리":"신청곡 관리";
  adminSubtitle.textContent=board?"익명 게시글과 댓글을 확인하고 수정·삭제할 수 있습니다.":"전체 신청 내역을 날짜·순서별로 확인하고 수정할 수 있습니다.";
  searchInput.placeholder=board?"게시글 제목, 내용, 댓글 검색":"날짜, 이름, 곡, 가수 검색";
  renderActive();
}
requestTab.onclick=()=>setMode("requests");
boardTab.onclick=()=>setMode("board");

function renderActive(){activeMode==="board"?renderPosts():renderRequests();}

function renderRequests(){
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
        <button class="small-edit-btn" data-edit-request="${esc(x.id)}" type="button">수정</button>
      </div>
      <div class="admin-song"><h3>${esc(x.songTitle)}</h3><p>${esc(x.artistName)}</p></div>
      <div class="admin-meta"><span>학번 ${esc(x.studentNumber)}</span><span>${esc(x.studentName)}</span></div>
      <a class="admin-youtube" href="${esc(x.url)}" target="_blank" rel="noopener">YouTube 열기 ↗</a>
    </article>`).join("");
  adminList.querySelectorAll("[data-edit-request]").forEach(btn=>btn.onclick=()=>openEdit(btn.dataset.editRequest));
}

function renderPosts(){
  const q=searchInput.value.trim().toLowerCase();
  const filtered=posts.filter(p=>{
    const comments=(p.comments||[]).map(c=>c.content).join(" ");
    return !q||[p.title,p.content,comments].join(" ").toLowerCase().includes(q);
  });
  postCount.textContent=posts.length;
  commentCount.textContent=posts.reduce((n,p)=>n+(p.comments?.length||0),0);
  likeCount.textContent=posts.reduce((n,p)=>n+Number(p.likes||0),0);
  boardAdminEmpty.classList.toggle("hidden",filtered.length>0);
  boardAdminList.innerHTML=filtered.map(p=>`
    <article class="admin-board-card">
      <div class="admin-board-card-top">
        <div>
          <span class="admin-board-date">${esc(formatDateTime(p.createdAt))}</span>
          <h3>${esc(p.title)}</h3>
        </div>
        <button class="small-edit-btn" data-manage-post="${esc(p.id)}" type="button">관리</button>
      </div>
      <p class="admin-board-content">${esc(p.content)}</p>
      <div class="admin-board-meta">
        <span>♥ 좋아요 ${Number(p.likes||0)}</span>
        <span>댓글 ${p.comments?.length||0}</span>
      </div>
    </article>`).join("");
  boardAdminList.querySelectorAll("[data-manage-post]").forEach(btn=>btn.onclick=()=>openBoardEdit(btn.dataset.managePost));
}

searchInput.oninput=renderActive;
refreshBtn.onclick=async()=>{
  refreshBtn.disabled=true;
  try{if(activeMode==="board")await loadPosts();else await loadRequests();}
  finally{refreshBtn.disabled=false;}
};

function openEdit(id){
  const x=requests.find(r=>String(r.id)===String(id));if(!x)return;
  editId.value=x.id;editDate.value=x.requestDate;editSlot.value=x.slot;
  editStudentNumber.value=x.studentNumber||"";editStudentName.value=x.studentName||"";
  editSongTitle.value=x.songTitle||"";editArtistName.value=x.artistName||"";editUrl.value=x.url||"";
  editMessage.textContent="";modal.classList.remove("hidden");
}
function hideModal(){modal.classList.add("hidden");}
closeModal.onclick=hideModal;modal.addEventListener("click",e=>{if(e.target===modal)hideModal();});

editForm.addEventListener("submit",async e=>{
  e.preventDefault();editMessage.textContent="저장 중...";
  const body={requestDate:editDate.value,slot:Number(editSlot.value),studentNumber:editStudentNumber.value.trim(),studentName:editStudentName.value.trim(),songTitle:editSongTitle.value.trim(),artistName:editArtistName.value.trim(),url:editUrl.value.trim()};
  const r=await fetch(`/api/admin/requests/${encodeURIComponent(editId.value)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));if(!r.ok){editMessage.textContent=j.message||"수정하지 못했습니다.";return;}
  hideModal();await loadRequests();
});

deleteBtn.onclick=async()=>{
  if(!confirm("이 신청곡을 정말 삭제할까요?"))return;
  editMessage.textContent="삭제 중...";
  const r=await fetch(`/api/admin/requests/${encodeURIComponent(editId.value)}`,{method:"DELETE"});
  const j=await r.json().catch(()=>({}));if(!r.ok){editMessage.textContent=j.message||"삭제하지 못했습니다.";return;}
  hideModal();await loadRequests();
};

function openBoardEdit(id){
  const p=posts.find(x=>String(x.id)===String(id));if(!p)return;
  boardEditId.value=p.id;boardEditTitle.value=p.title||"";boardEditContent.value=p.content||"";boardEditMessage.textContent="";
  renderBoardComments(p);boardModal.classList.remove("hidden");
}
function hideBoardModal(){boardModal.classList.add("hidden");}
closeBoardModal.onclick=hideBoardModal;boardModal.addEventListener("click",e=>{if(e.target===boardModal)hideBoardModal();});

function renderBoardComments(post){
  const comments=post?.comments||[];boardModalCommentCount.textContent=`${comments.length}개`;
  boardAdminComments.innerHTML=comments.length?comments.map(c=>`
    <div class="admin-comment-row">
      <div><p>${esc(c.content)}</p><span>${esc(formatDateTime(c.createdAt))}</span></div>
      <button type="button" class="admin-comment-delete" data-delete-comment="${esc(c.id)}">삭제</button>
    </div>`).join(""):'<div class="admin-no-comments">댓글이 없습니다.</div>';
  boardAdminComments.querySelectorAll("[data-delete-comment]").forEach(btn=>btn.onclick=()=>deleteAdminComment(post.id,btn.dataset.deleteComment));
}

boardEditForm.addEventListener("submit",async e=>{
  e.preventDefault();boardEditMessage.textContent="저장 중...";
  const r=await fetch(`/api/admin/posts/${encodeURIComponent(boardEditId.value)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:boardEditTitle.value.trim(),content:boardEditContent.value.trim()})});
  const j=await r.json().catch(()=>({}));if(!r.ok){boardEditMessage.textContent=j.message||"게시글을 수정하지 못했습니다.";return;}
  hideBoardModal();await loadPosts();
});

adminDeletePostBtn.onclick=async()=>{
  if(!confirm("이 게시글과 모든 댓글·좋아요를 정말 삭제할까요?"))return;
  boardEditMessage.textContent="삭제 중...";
  const r=await fetch(`/api/admin/posts/${encodeURIComponent(boardEditId.value)}`,{method:"DELETE"});
  const j=await r.json().catch(()=>({}));if(!r.ok){boardEditMessage.textContent=j.message||"게시글을 삭제하지 못했습니다.";return;}
  hideBoardModal();await loadPosts();
};

async function deleteAdminComment(postId,commentId){
  if(!confirm("이 댓글을 삭제할까요?"))return;
  const r=await fetch(`/api/admin/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,{method:"DELETE"});
  const j=await r.json().catch(()=>({}));if(!r.ok){alert(j.message||"댓글을 삭제하지 못했습니다.");return;}
  await loadPosts(false);
  const p=posts.find(x=>String(x.id)===String(postId));
  if(p)renderBoardComments(p);
  renderPosts();
}

checkStatus();
