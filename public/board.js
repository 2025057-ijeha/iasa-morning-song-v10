const $=id=>document.getElementById(id);
const postList=$("postList"),postCount=$("postCount"),searchInput=$("searchInput"),postModal=$("postModal"),newPostBtn=$("newPostBtn");
const postForm=$("postForm"),postTitle=$("postTitle"),postContent=$("postContent"),postDeleteCode=$("postDeleteCode"),postFormMessage=$("postFormMessage"),toast=$("toast");
let posts=[];
let voterId=localStorage.getItem("iasa-voter-id");
if(!voterId){voterId=crypto.randomUUID();localStorage.setItem("iasa-voter-id",voterId)}
function esc(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function date(v){return new Intl.DateTimeFormat("ko-KR",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(v))}
function notify(t){toast.textContent=t;toast.classList.remove("hidden");setTimeout(()=>toast.classList.add("hidden"),2200)}
async function load(){posts=await fetch("/api/posts").then(r=>r.json());render()}
function render(){
  const q=searchInput.value.trim().toLowerCase();
  const filtered=posts.filter(p=>(p.title+" "+p.content).toLowerCase().includes(q));
  postCount.textContent=`게시글 ${posts.length}개`;
  if(!filtered.length){postList.innerHTML='<div class="empty-board">아직 표시할 게시글이 없습니다.<br>첫 번째 의견을 남겨보세요.</div>';return}
  postList.innerHTML="";
  filtered.forEach(p=>{
    const el=document.createElement("article");el.className="post-card";
    el.innerHTML=`
      <div class="post-top"><div class="post-title">${esc(p.title)}</div><div class="post-date">${date(p.createdAt)}</div></div>
      <div class="post-body">${esc(p.content)}</div>
      <div class="post-actions">
        <button class="like-btn" data-like="${p.id}">♥ 좋아요 ${p.likes}</button>
        <button class="comment-toggle" data-toggle="${p.id}">댓글 ${p.comments.length}</button>
        <button class="delete-post" data-delete="${p.id}">삭제</button>
      </div>
      <div class="comments hidden" id="comments-${p.id}">
        <div class="comment-list">
          ${p.comments.length?p.comments.map(c=>`<div class="comment">${esc(c.content)}<div class="comment-time">${date(c.createdAt)}</div></div>`).join(""):'<div class="comment">아직 댓글이 없습니다.</div>'}
        </div>
        <form class="comment-form" data-comment-form="${p.id}">
          <input maxlength="500" placeholder="익명 댓글을 입력하세요" required>
          <button class="pill soft">댓글 달기</button>
        </form>
      </div>`;
    postList.appendChild(el);
  });
  bind();
}
function bind(){
  document.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>document.getElementById(`comments-${b.dataset.toggle}`).classList.toggle("hidden"));
  document.querySelectorAll("[data-like]").forEach(b=>b.onclick=async()=>{
    const r=await fetch(`/api/posts/${b.dataset.like}/like`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({voterId})});
    if(r.ok)load();
  });
  document.querySelectorAll("[data-comment-form]").forEach(f=>f.onsubmit=async e=>{
    e.preventDefault();const input=f.querySelector("input");const id=f.dataset.commentForm;
    const r=await fetch(`/api/posts/${id}/comments`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:input.value})});
    if(r.ok){notify("댓글을 남겼습니다.");await load();setTimeout(()=>document.getElementById(`comments-${id}`)?.classList.remove("hidden"),30)}
  });
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{
    const code=prompt("게시글 작성 시 설정한 삭제 비밀번호를 입력하세요.");
    if(!code)return;
    const r=await fetch(`/api/posts/${b.dataset.delete}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({deleteCode:code})});
    const j=await r.json();if(!r.ok){alert(j.message);return}notify("게시글을 삭제했습니다.");load();
  });
}
newPostBtn.onclick=()=>{postForm.reset();postFormMessage.textContent="";postModal.classList.remove("hidden");document.body.style.overflow="hidden"};
document.querySelectorAll("[data-close-post]").forEach(x=>x.onclick=()=>{postModal.classList.add("hidden");document.body.style.overflow=""});
postForm.onsubmit=async e=>{
  e.preventDefault();postFormMessage.textContent="";
  const r=await fetch("/api/posts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:postTitle.value,content:postContent.value,deleteCode:postDeleteCode.value})});
  const j=await r.json();if(!r.ok){postFormMessage.textContent=j.message;return}
  postModal.classList.add("hidden");document.body.style.overflow="";notify("익명 게시글을 작성했습니다.");load();
};
searchInput.oninput=render;
load();
