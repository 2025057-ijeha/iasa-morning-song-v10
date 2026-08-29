const express = require("express");
const path = require("path");
const crypto = require("crypto");
const storage = require("./storage");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "iasadormitory2026";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.createHash("sha256").update(`iasa:${ADMIN_PASSWORD}:session`).digest("hex");
const IS_PRODUCTION = process.env.NODE_ENV === "production";

app.use(express.json({ limit: "350kb" }));

function clean(v) { return String(v ?? "").trim(); }
function hash(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }
function safeEqual(a,b){
  const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  raw.split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i === -1) return;
    out[decodeURIComponent(part.slice(0, i).trim())] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function adminSignature(exp){return crypto.createHmac("sha256",SESSION_SECRET).update(`admin:${exp}`).digest("hex");}
function createAdminToken(){const exp=Date.now()+8*60*60*1000;return `${exp}.${adminSignature(exp)}`;}
function isAdmin(req){
  const token=parseCookies(req).iasa_admin;if(!token)return false;
  const [expRaw,sig]=token.split(".");const exp=Number(expRaw);
  if(!exp||!sig||Date.now()>exp)return false;
  return safeEqual(sig,adminSignature(expRaw));
}
function requireAdmin(req,res,next){if(!isAdmin(req))return res.status(401).json({message:"관리자 로그인이 필요합니다."});next();}
function adminCookie(token,maxAge=28800){return `iasa_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${IS_PRODUCTION?"; Secure":""}`;}
function asyncRoute(fn){return (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);}
function publicRequest(item){if(!item)return null;const {editHash,...safe}=item;return safe;}
function publicPost(post){if(!post)return null;const {deleteHash,likedBy,...safe}=post;return {...safe,likes:Array.isArray(likedBy)?likedBy.length:0,comments:post.comments||[]};}
function duplicateSlotError(err){return err && (err.code === "23505" || String(err.message||"").includes("DUPLICATE_SLOT"));}

/* ---------- 관리자 ---------- */
app.post("/api/admin/login", (req,res)=>{
  const password=clean(req.body?.password);
  if(!safeEqual(password,ADMIN_PASSWORD))return res.status(401).json({message:"관리자 비밀번호가 올바르지 않습니다."});
  res.setHeader("Set-Cookie",adminCookie(createAdminToken()));
  res.json({ok:true});
});
app.post("/api/admin/logout",requireAdmin,(req,res)=>{
  res.setHeader("Set-Cookie",adminCookie("",0));res.json({ok:true});
});
app.get("/api/admin/status",(req,res)=>res.json({authenticated:isAdmin(req)}));
app.get("/api/admin/requests",requireAdmin,asyncRoute(async(req,res)=>{
  const rows=await storage.listAllRequests();res.json(rows.map(publicRequest));
}));
app.put("/api/admin/requests/:id",requireAdmin,asyncRoute(async(req,res)=>{
  const current=await storage.getRequest(req.params.id);
  if(!current)return res.status(404).json({message:"신청 내역을 찾을 수 없습니다."});
  const requestDate=clean(req.body.requestDate || req.body.date || current.requestDate);
  const slot=Number(req.body.slot || current.slot);
  const studentNumber=clean(req.body.studentNumber || current.studentNumber);
  const studentName=clean(req.body.studentName || current.studentName);
  const songTitle=clean(req.body.songTitle || current.songTitle);
  const artistName=clean(req.body.artistName || current.artistName);
  const url=clean(req.body.url || current.url);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(requestDate))return res.status(400).json({message:"날짜 형식이 올바르지 않습니다."});
  if(!Number.isInteger(slot)||slot<1||slot>7)return res.status(400).json({message:"신청 순서는 1~7번만 가능합니다."});
  if(!studentNumber||!studentName||!songTitle||!artistName||!url)return res.status(400).json({message:"모든 항목을 입력해주세요."});
  if(!getYoutubeId(url))return res.status(400).json({message:"YouTube 영상 URL만 사용할 수 있습니다."});
  try{
    const updated=await storage.updateRequest(req.params.id,{requestDate,slot,studentNumber,studentName,songTitle,artistName,url,updatedAt:new Date().toISOString(),adminEdited:true});
    res.json({ok:true,request:publicRequest(updated)});
  }catch(err){if(duplicateSlotError(err))return res.status(409).json({message:"해당 날짜의 신청 순서에는 이미 다른 곡이 있습니다."});throw err;}
}));
app.delete("/api/admin/requests/:id",requireAdmin,asyncRoute(async(req,res)=>{
  const deleted=await storage.deleteRequest(req.params.id);
  if(!deleted)return res.status(404).json({message:"신청 내역을 찾을 수 없습니다."});
  res.json({ok:true,deleted:publicRequest(deleted)});
}));

/* ---------- 관리자 게시판 관리 ---------- */
app.get("/api/admin/posts",requireAdmin,asyncRoute(async(req,res)=>{
  const rows=await storage.listPosts();
  res.json(rows.map(publicPost));
}));
app.put("/api/admin/posts/:id",requireAdmin,asyncRoute(async(req,res)=>{
  const title=clean(req.body.title),content=clean(req.body.content);
  if(!title||!content)return res.status(400).json({message:"제목과 내용을 모두 입력해주세요."});
  if(title.length>120)return res.status(400).json({message:"제목은 120자 이하로 입력해주세요."});
  if(content.length>5000)return res.status(400).json({message:"내용은 5000자 이하로 입력해주세요."});
  const updated=await storage.updatePost(req.params.id,{title,content});
  if(!updated)return res.status(404).json({message:"게시글을 찾을 수 없습니다."});
  res.json({ok:true,post:publicPost(updated)});
}));
app.delete("/api/admin/posts/:id",requireAdmin,asyncRoute(async(req,res)=>{
  const deleted=await storage.deletePost(req.params.id);
  if(!deleted)return res.status(404).json({message:"게시글을 찾을 수 없습니다."});
  res.json({ok:true});
}));
app.delete("/api/admin/posts/:postId/comments/:commentId",requireAdmin,asyncRoute(async(req,res)=>{
  const deleted=await storage.deleteComment(req.params.postId,req.params.commentId);
  if(!deleted)return res.status(404).json({message:"댓글을 찾을 수 없습니다."});
  res.json({ok:true});
}));

app.use(express.static(path.join(__dirname,"public")));

function isHttpUrl(value){try{const u=new URL(value);return u.protocol==="http:"||u.protocol==="https:";}catch{return false;}}
function getYoutubeId(value){
  try{
    const u=new URL(value),host=u.hostname.replace(/^www\./,"").toLowerCase();
    if(host==="youtu.be")return u.pathname.split("/").filter(Boolean)[0]||null;
    if(["youtube.com","m.youtube.com","music.youtube.com"].includes(host)){
      if(u.pathname==="/watch")return u.searchParams.get("v");
      const parts=u.pathname.split("/").filter(Boolean);if(["shorts","embed","live"].includes(parts[0]))return parts[1]||null;
    }
  }catch{}
  return null;
}

/* 1차 오프라인 규칙 필터 */
const LOCAL_BLOCK=[
  "씨발","시발","ㅅㅂ","ㅆㅂ","개새끼","개새","병신","븅신","좆","좃","존나","졸라","지랄",
  "닥쳐","꺼져","창녀","걸레","보지","자지","섹스","성관계","야동","포르노","음란","19금","후방주의",
  "노출","강간","마약","대마","코카인","필로폰",
  "fuck","fucking","f*ck","f**k","motherfucker","shit","bullshit","bitch","bitches","asshole",
  "dick","pussy","cock","cunt","slut","whore","porn","porno","sex","sexual","nude","nudity","nsfw",
  "rape","cocaine","heroin","meth"
];
function normalizeForFilter(text){return String(text||"").toLowerCase().normalize("NFKC").replace(/[\s._\-*~!@#$%^&()+=[\]{}:;"'<>?,/\\|]/g,"");}
function localFilter(text){const compact=normalizeForFilter(text);return [...new Set(LOCAL_BLOCK.filter(term=>compact.includes(normalizeForFilter(term))))];}

async function youtubeMetadata(videoId){
  const watch=`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const oembed=`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
  const r=await fetch(oembed,{headers:{"User-Agent":"Mozilla/5.0"}});if(!r.ok)throw new Error("YOUTUBE_NOT_FOUND");
  const j=await r.json();return {title:clean(j.title),channel:clean(j.author_name)};
}
async function youtubeTranscript(videoId){
  try{
    const pkg=await import("youtube-transcript");const fetchTranscript=pkg.fetchTranscript||pkg.default?.fetchTranscript;
    if(!fetchTranscript)return {text:"",available:false};
    const items=await fetchTranscript(videoId);const text=(items||[]).map(x=>x.text||"").join(" ").replace(/\s+/g," ").trim();
    return {text:text.slice(0,26000),available:Boolean(text)};
  }catch{return {text:"",available:false};}
}
async function prepareSongInspection(body){
  const url=clean(body.url),songTitle=clean(body.songTitle),artistName=clean(body.artistName),videoId=getYoutubeId(url);
  if(!videoId)return {ok:false,status:"block",stage:"url",message:"YouTube 영상 링크만 신청할 수 있습니다."};
  let meta;try{meta=await youtubeMetadata(videoId);}catch{return {ok:false,status:"block",stage:"youtube",message:"YouTube 영상을 확인할 수 없습니다. 공개 영상 링크인지 확인해주세요."};}
  const transcriptInfo=await youtubeTranscript(videoId);
  const combined=[songTitle,artistName,meta.title,meta.channel,transcriptInfo.text].join("\n"),localHits=localFilter(combined);
  if(localHits.length)return {ok:false,status:"block",stage:"local-filter",message:"욕설·선정적 표현 등 학교 방송에 부적절한 내용이 감지되어 신청할 수 없습니다.",detail:"1차 안전 필터에서 부적절 표현이 감지되었습니다.",transcriptAvailable:transcriptInfo.available};
  if(!transcriptInfo.available)return {ok:false,status:"review",stage:"transcript",message:"이 영상에서는 자막/가사를 가져오지 못했습니다.",detail:"가사 검사를 위해 자막(CC)이 제공되는 YouTube 영상 링크로 다시 시도해주세요.",transcriptAvailable:false};
  const analysisText=[`신청곡 제목: ${songTitle}`,`가수: ${artistName}`,`YouTube 제목: ${meta.title}`,`채널: ${meta.channel}`,`자막/가사: ${transcriptInfo.text}`].join("\n").slice(0,26000);
  return {ok:true,status:"ready-for-browser-ai",stage:"browser-ai-ready",message:"YouTube 정보와 자막을 가져왔습니다. 브라우저 무료 AI 검사를 진행합니다.",transcriptAvailable:true,analysisText,meta};
}
function validateRequest(body){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(clean(body.requestDate)))return "올바른 날짜를 선택해주세요.";
  const slot=Number(body.slot);if(!Number.isInteger(slot)||slot<1||slot>7)return "신청 순서는 1~7번만 가능합니다.";
  if(!clean(body.studentNumber))return "학번을 입력해주세요.";if(!clean(body.studentName))return "이름을 입력해주세요.";
  if(!clean(body.songTitle))return "신청곡 제목을 입력해주세요.";if(!clean(body.artistName))return "가수 이름을 입력해주세요.";
  if(!isHttpUrl(clean(body.url)))return "올바른 URL을 입력해주세요.";if(clean(body.editCode).length<4)return "수정 비밀번호는 4자 이상 입력해주세요.";
  return null;
}

/* ---------- Song API ---------- */
app.post("/api/check-song",asyncRoute(async(req,res)=>{
  if(["songTitle","artistName","url"].some(k=>!clean(req.body[k])))return res.status(400).json({ok:false,message:"곡 제목, 가수, YouTube URL을 먼저 입력해주세요."});
  const result=await prepareSongInspection(req.body);res.status(result.ok?200:422).json(result);
}));
app.get("/api/requests",asyncRoute(async(req,res)=>{
  const rows=await storage.listRequestsByDate(clean(req.query.date));res.json(rows.map(publicRequest));
}));
app.get("/api/requests-range",asyncRoute(async(req,res)=>{
  const start=clean(req.query.start),end=clean(req.query.end);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))return res.status(400).json({message:"날짜 범위가 필요합니다."});
  const rows=await storage.listRequestsRange(start,end);res.json(rows.map(publicRequest));
}));
app.post("/api/requests",asyncRoute(async(req,res)=>{
  const error=validateRequest(req.body);if(error)return res.status(400).json({message:error});
  const inspection=await prepareSongInspection(req.body);if(!inspection.ok)return res.status(422).json({message:inspection.message,inspection});
  if(req.body.clientAiPassed!==true)return res.status(422).json({message:"브라우저 무료 AI 검사를 먼저 통과해주세요."});
  const item={id:crypto.randomUUID(),requestDate:clean(req.body.requestDate),slot:Number(req.body.slot),studentNumber:clean(req.body.studentNumber),studentName:clean(req.body.studentName),songTitle:clean(req.body.songTitle),artistName:clean(req.body.artistName),url:clean(req.body.url),editHash:hash(clean(req.body.editCode)),createdAt:new Date().toISOString(),adminEdited:false};
  try{const saved=await storage.createRequest(item);res.status(201).json({message:"기상곡 신청이 완료되었습니다.",item:publicRequest(saved)});}catch(err){if(duplicateSlotError(err))return res.status(409).json({message:"이미 신청된 순서입니다."});throw err;}
}));
app.put("/api/requests/:id",asyncRoute(async(req,res)=>{
  const error=validateRequest(req.body);if(error)return res.status(400).json({message:error});
  const current=await storage.getRequest(req.params.id);if(!current)return res.status(404).json({message:"신청 내역을 찾을 수 없습니다."});
  if(!safeEqual(current.editHash,hash(clean(req.body.editCode))))return res.status(403).json({message:"수정 비밀번호가 일치하지 않습니다."});
  const inspection=await prepareSongInspection(req.body);if(!inspection.ok)return res.status(422).json({message:inspection.message,inspection});
  if(req.body.clientAiPassed!==true)return res.status(422).json({message:"브라우저 무료 AI 검사를 먼저 통과해주세요."});
  const changes={requestDate:clean(req.body.requestDate),slot:Number(req.body.slot),studentNumber:clean(req.body.studentNumber),studentName:clean(req.body.studentName),songTitle:clean(req.body.songTitle),artistName:clean(req.body.artistName),url:clean(req.body.url),updatedAt:new Date().toISOString()};
  try{await storage.updateRequest(req.params.id,changes);res.json({message:"수정되었습니다."});}catch(err){if(duplicateSlotError(err))return res.status(409).json({message:"해당 순서는 이미 신청되어 있습니다."});throw err;}
}));
app.delete("/api/requests/:id",asyncRoute(async(req,res)=>{
  const current=await storage.getRequest(req.params.id);if(!current)return res.status(404).json({message:"신청 내역을 찾을 수 없습니다."});
  if(!safeEqual(current.editHash,hash(clean(req.body.editCode))))return res.status(403).json({message:"수정 비밀번호가 일치하지 않습니다."});
  await storage.deleteRequest(req.params.id);res.json({message:"삭제되었습니다."});
}));

/* ---------- Board API ---------- */
app.get("/api/posts",asyncRoute(async(req,res)=>{const posts=await storage.listPosts();res.json(posts.map(publicPost));}));
app.post("/api/posts",asyncRoute(async(req,res)=>{
  const title=clean(req.body.title),content=clean(req.body.content),deleteCode=clean(req.body.deleteCode);
  if(title.length<2||title.length>80)return res.status(400).json({message:"제목은 2~80자로 입력해주세요."});
  if(content.length<1||content.length>2000)return res.status(400).json({message:"내용은 1~2000자로 입력해주세요."});
  if(deleteCode.length<4)return res.status(400).json({message:"삭제 비밀번호는 4자 이상 입력해주세요."});
  const post={id:crypto.randomUUID(),title,content,deleteHash:hash(deleteCode),likedBy:[],comments:[],createdAt:new Date().toISOString()};
  const saved=await storage.createPost(post);res.status(201).json(publicPost(saved));
}));
app.post("/api/posts/:id/like",asyncRoute(async(req,res)=>{
  const voterId=clean(req.body.voterId);if(!voterId)return res.status(400).json({message:"좋아요 식별 정보가 없습니다."});
  const post=await storage.getPost(req.params.id);if(!post)return res.status(404).json({message:"게시글을 찾을 수 없습니다."});
  const result=await storage.toggleLike(req.params.id,voterId);res.json(result);
}));
app.post("/api/posts/:id/comments",asyncRoute(async(req,res)=>{
  const content=clean(req.body.content);if(!content||content.length>500)return res.status(400).json({message:"댓글은 1~500자로 입력해주세요."});
  const post=await storage.getPost(req.params.id);if(!post)return res.status(404).json({message:"게시글을 찾을 수 없습니다."});
  const c={id:crypto.randomUUID(),content,createdAt:new Date().toISOString()};const saved=await storage.addComment(req.params.id,c);res.status(201).json(saved);
}));
app.delete("/api/posts/:id",asyncRoute(async(req,res)=>{
  const post=await storage.getPost(req.params.id);if(!post)return res.status(404).json({message:"게시글을 찾을 수 없습니다."});
  if(!safeEqual(post.deleteHash,hash(clean(req.body.deleteCode))))return res.status(403).json({message:"삭제 비밀번호가 일치하지 않습니다."});
  await storage.deletePost(req.params.id);res.json({message:"게시글이 삭제되었습니다."});
}));

app.get("/api/system-status",(req,res)=>{
  res.json({aiEnabled:true,model:"TensorFlow.js Toxicity",message:"무료 브라우저 AI · API 키 불필요",storage:storage.mode,persistent:storage.mode==="supabase"});
});
app.get("/api/health",asyncRoute(async(req,res)=>{
  res.json({ok:true,storage:storage.mode,persistent:storage.mode==="supabase",time:new Date().toISOString()});
}));

app.use((err,req,res,next)=>{
  console.error("[server error]",err);
  const dbHint=storage.mode==="supabase"?" Supabase 설정과 테이블 생성 여부를 확인해주세요.":"";
  res.status(500).json({message:"서버 처리 중 오류가 발생했습니다."+dbHint});
});

app.listen(PORT,()=>{
  console.log(`IASA 기상곡 신청: http://localhost:${PORT}`);
  console.log(`주간 캘린더: http://localhost:${PORT}/calendar.html`);
  console.log(`익명 게시판: http://localhost:${PORT}/board.html`);
  console.log(`저장 방식: ${storage.mode}${storage.mode==="supabase"?" (영구 저장)":" (로컬 테스트용)"}`);
  console.log("AI 방식: 무료 브라우저 AI · API 키/유료 AI/학생 기기 설치 불필요");
});
