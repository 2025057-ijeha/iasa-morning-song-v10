const $=id=>document.getElementById(id);
const postList=$("postList"),postCount=$("postCount"),searchInput=$("searchInput"),postModal=$("postModal"),newPostBtn=$("newPostBtn");
const postForm=$("postForm"),postTitle=$("postTitle"),postContent=$("postContent"),postDeleteCode=$("postDeleteCode"),postFormMessage=$("postFormMessage"),toast=$("toast");
const latestSortBtn=$("latestSortBtn"),popularSortBtn=$("popularSortBtn"),sortDescription=$("sortDescription");
const detailModal=$("detailModal"),detailTitle=$("detailTitle"),detailDate=$("detailDate"),detailCommentCount=$("detailCommentCount"),detailLikeCount=$("detailLikeCount"),detailContent=$("detailContent"),detailLikeBtn=$("detailLikeBtn"),detailDeleteBtn=$("detailDeleteBtn"),detailCommentsLabel=$("detailCommentsLabel"),detailCommentList=$("detailCommentList"),detailCommentForm=$("detailCommentForm"),detailCommentInput=$("detailCommentInput");
let posts=[];let sortMode="latest";let activePostId=null;
let voterId=localStorage.getItem("iasa-voter-id");
if(!voterId){voterId=crypto.randomUUID();localStorage.setItem("iasa-voter-id",voterId)}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function date(v){return new Intl.DateTimeFormat("ko-KR",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(v))}
function notify(t){toast.textContent=t;toast.classList.remove("hidden");setTimeout(()=>toast.classList.add("hidden"),2200)}
async function load(){posts=await fetch("/api/posts").then(r=>r.json());render();if(activePostId)renderDetail(activePostId)}
function getVisiblePosts(){
  const q=searchInput.value.trim().toLowerCase();
  const filtered=posts.filter(p=>(`${p.title||""} ${p.content||""}`).toLowerCase().includes(q));
  return [...filtered].sort((a,b)=>{
    if(sortMode==="popular"){
      const score=p=>Number(p.likes||0)*3+(p.comments?.length||0)*2;
      const diff=score(b)-score(a);if(diff)return diff;
    }
    return new Date(b.createdAt)-new Date(a.createdAt);
  });
}
function render(){
  const filtered=getVisiblePosts();
  postCount.textContent=`게시글 ${posts.length}개`;
  sortDescription.textContent=sortMode==="popular"?"좋아요와 댓글 반응이 많은 글부터 표시됩니다.":"최신 글부터 표시됩니다.";
  latestSortBtn.classList.toggle("active",sortMode==="latest");popularSortBtn.classList.toggle("active",sortMode==="popular");
  if(!filtered.length){postList.innerHTML='<div class="empty-board-v2"><span>✦</span><strong>아직 표시할 게시글이 없습니다</strong><p>첫 번째 의견을 남겨보세요.</p></div>';return}
  postList.innerHTML=filtered.map(p=>`
    <button class="board-post-row" type="button" data-open-post="${esc(p.id)}">
      <span class="board-row-title"><strong>${esc(p.title)}</strong><small>${esc((p.content||"").replace(/\s+/g," ").slice(0,78))}${(p.content||"").length>78?"…":""}</small></span>
      <span class="board-row-stat"><b>${p.comments?.length||0}</b><small>댓글</small></span>
      <span class="board-row-stat"><b>${Number(p.likes||0)}</b><small>좋아요</small></span>
      <span class="board-row-date">${date(p.createdAt)}</span>
      <span class="board-row-arrow">›</span>
    </button>`).join("");
  postList.querySelectorAll("[data-open-post]").forEach(btn=>btn.onclick=()=>openDetail(btn.dataset.openPost));
}
function openDetail(id){activePostId=String(id);renderDetail(activePostId);detailModal.classList.remove("hidden");document.body.style.overflow="hidden"}
function closeDetail(){detailModal.classList.add("hidden");document.body.style.overflow="";activePostId=null}
function renderDetail(id){
  const p=posts.find(x=>String(x.id)===String(id));if(!p){closeDetail();return}
  detailTitle.textContent=p.title||"";detailDate.textContent=date(p.createdAt);detailCommentCount.textContent=`댓글 ${p.comments?.length||0}`;detailLikeCount.textContent=`좋아요 ${Number(p.likes||0)}`;detailContent.textContent=p.content||"";
  detailLikeBtn.textContent=`♥ 좋아요 ${Number(p.likes||0)}`;detailCommentsLabel.textContent=`${p.comments?.length||0}개`;
  detailCommentList.innerHTML=(p.comments?.length||0)?p.comments.map(c=>`<div class="board-detail-comment"><p>${esc(c.content)}</p><span>${date(c.createdAt)}</span></div>`).join(""):'<div class="board-detail-no-comment">아직 댓글이 없습니다. 첫 댓글을 남겨보세요.</div>';
}
latestSortBtn.onclick=()=>{sortMode="latest";render()};popularSortBtn.onclick=()=>{sortMode="popular";render()};
searchInput.oninput=render;
detailLikeBtn.onclick=async()=>{if(!activePostId)return;const r=await fetch(`/api/posts/${activePostId}/like`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({voterId})});if(r.ok){await load();notify("좋아요를 반영했습니다.")}};
detailCommentForm.onsubmit=async e=>{e.preventDefault();if(!activePostId)return;const value=detailCommentInput.value.trim();if(!value)return;const r=await fetch(`/api/posts/${activePostId}/comments`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:value})});if(r.ok){detailCommentInput.value="";await load();notify("댓글을 남겼습니다.")}};
detailDeleteBtn.onclick=async()=>{if(!activePostId)return;const code=prompt("게시글 작성 시 설정한 삭제 비밀번호를 입력하세요.");if(!code)return;const r=await fetch(`/api/posts/${activePostId}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({deleteCode:code})});const j=await r.json();if(!r.ok){alert(j.message);return}closeDetail();notify("게시글을 삭제했습니다.");load()};
document.querySelectorAll("[data-close-detail]").forEach(x=>x.onclick=closeDetail);
newPostBtn.onclick=()=>{postForm.reset();postFormMessage.textContent="";postModal.classList.remove("hidden");document.body.style.overflow="hidden"};
document.querySelectorAll("[data-close-post]").forEach(x=>x.onclick=()=>{postModal.classList.add("hidden");document.body.style.overflow=""});
postForm.onsubmit=async e=>{e.preventDefault();postFormMessage.textContent="";const r=await fetch("/api/posts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:postTitle.value,content:postContent.value,deleteCode:postDeleteCode.value})});const j=await r.json();if(!r.ok){postFormMessage.textContent=j.message;return}postModal.classList.add("hidden");document.body.style.overflow="";notify("익명 게시글을 작성했습니다.");load()};
load();
