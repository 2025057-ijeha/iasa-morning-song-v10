const express = require("express");
const path = require("path");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const storage = require("./storage");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "wpgktkfkdgo0226";
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
app.get("/api/admin/requests/export.xlsx",requireAdmin,asyncRoute(async(req,res)=>{
  const rows=(await storage.listAllRequests()).map(publicRequest)
    .sort((a,b)=>String(a.requestDate).localeCompare(String(b.requestDate)) || Number(a.slot)-Number(b.slot));
  const workbook=new ExcelJS.Workbook();
  workbook.creator="IASA Morning Song";
  const ws=workbook.addWorksheet("기상곡 신청 목록",{views:[{state:"frozen",ySplit:2}]});
  ws.columns=[
    {width:16},{width:9},{width:13},{width:13},{width:30},{width:28},{width:48},{width:18}
  ];
  ws.mergeCells("A1:H1");
  ws.getCell("A1").value="시트 수정한 학번/이름 확인 가능합니다. 심의를 준수해서 노래를 신청해 주세요.";
  ws.getCell("A1").font={bold:true,size:11,color:{argb:"FF26352A"}};
  ws.getCell("A1").alignment={vertical:"middle",horizontal:"left"};
  ws.getCell("A1").fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFEAF4E7"}};
  ws.getRow(1).height=25;
  const headers=["요일","연번","학번","이름","노래 제목","아티스트","노래 유튜브 링크(선택)","검사 상태"];
  const hr=ws.getRow(2);hr.values=headers;hr.height=24;
  hr.eachCell(c=>{c.font={bold:true,color:{argb:"FFFFFFFF"}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF4D815A"}};c.alignment={horizontal:"center",vertical:"middle"};});
  const wd=["일","월","화","수","목","금","토"];let last=null;
  for(const x of rows){
    if(last!==null&&x.requestDate!==last)ws.addRow([]);
    const d=new Date(`${x.requestDate}T00:00:00`);
    const label=`${wd[d.getDay()]}(${d.getMonth()+1}/${d.getDate()})`;
    const statusLabel=x.inspectionStatus==="review"?"관리자 검사 필요":x.inspectionStatus==="admin_pass"?"관리자 확인 완료":x.inspectionStatus==="blocked"?"차단 판정":"자동검사 통과";
    const r=ws.addRow([x.requestDate===last?"":label,Number(x.slot)||"",x.studentNumber||"",x.studentName||"",x.songTitle||"",x.artistName||"",x.url||"",statusLabel]);
    r.height=22;
    r.eachCell((c,col)=>{c.alignment={vertical:"middle",horizontal:[2,3,4].includes(col)?"center":"left",wrapText:true};c.border={top:{style:"hair",color:{argb:"FFE1E8DF"}},bottom:{style:"hair",color:{argb:"FFE1E8DF"}},left:{style:"hair",color:{argb:"FFE1E8DF"}},right:{style:"hair",color:{argb:"FFE1E8DF"}}};});
    if(x.requestDate!==last){r.getCell(1).font={bold:true,color:{argb:"FF356B43"}};r.getCell(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF1F7EF"}};}
    if(x.url){r.getCell(7).value={text:x.url,hyperlink:x.url};r.getCell(7).font={color:{argb:"FF2F6E9E"},underline:true};}
    if(x.inspectionStatus==="review")r.getCell(8).font={bold:true,color:{argb:"FF9A6A15"}};
    else if(x.inspectionStatus==="blocked")r.getCell(8).font={bold:true,color:{argb:"FFC8463A"}};
    else r.getCell(8).font={bold:true,color:{argb:"FF39784A"}};
    last=x.requestDate;
  }
  ws.autoFilter={from:"A2",to:"G2"};
  const buffer=await workbook.xlsx.writeBuffer();
  const stamp=new Date().toISOString().slice(0,10);
  res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition",`attachment; filename="iasa-${stamp}.xlsx"; filename*=UTF-8''${encodeURIComponent(`IASA_기상곡_신청목록_${stamp}.xlsx`)}`);
  res.send(Buffer.from(buffer));
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
    const songChanged=songTitle!==current.songTitle||artistName!==current.artistName||url!==current.url;
    const updated=await storage.updateRequest(req.params.id,{
      requestDate,slot,studentNumber,studentName,songTitle,artistName,url,updatedAt:new Date().toISOString(),adminEdited:true,
      ...(songChanged?{
        inspectionStatus:"review",
        inspectionMessage:"관리자 검사 필요 · 관리자가 곡 정보를 수정했습니다.",
        inspectionDetail:"곡 제목·가수·YouTube 링크가 변경되어 다시 확인이 필요합니다.",
        inspectionSource:"",
        matchedSongTitle:"",
        matchedSongArtist:"",
        inspectedAt:new Date().toISOString()
      }:{})
    });
    res.json({ok:true,request:publicRequest(updated)});
  }catch(err){if(duplicateSlotError(err))return res.status(409).json({message:"해당 날짜의 신청 순서에는 이미 다른 곡이 있습니다."});throw err;}
}));
app.delete("/api/admin/requests/:id",requireAdmin,asyncRoute(async(req,res)=>{
  const deleted=await storage.deleteRequest(req.params.id);
  if(!deleted)return res.status(404).json({message:"신청 내역을 찾을 수 없습니다."});
  res.json({ok:true,deleted:publicRequest(deleted)});
}));
app.post("/api/admin/requests/:id/approve",requireAdmin,asyncRoute(async(req,res)=>{
  const current=await storage.getRequest(req.params.id);
  if(!current)return res.status(404).json({message:"신청 내역을 찾을 수 없습니다."});
  const updated=await storage.updateRequest(req.params.id,{
    inspectionStatus:"admin_pass",
    inspectionMessage:"관리자 확인 완료",
    inspectionDetail:"관리자가 직접 확인한 신청곡입니다.",
    inspectedAt:new Date().toISOString()
  });
  res.json({ok:true,request:publicRequest(updated)});
}));
app.post("/api/admin/requests/:id/recheck",requireAdmin,asyncRoute(async(req,res)=>{
  const current=await storage.getRequest(req.params.id);
  if(!current)return res.status(404).json({message:"신청 내역을 찾을 수 없습니다."});
  const inspection=await prepareSongInspection(current,{force:true});
  const record=inspection.status==="block"?{
    inspectionStatus:"blocked",
    inspectionMessage:inspection.message,
    inspectionDetail:inspection.detail||"자동 재검사에서 차단 판정이 확인되었습니다.",
    inspectionSource:clean(inspection.sources?.join(" + ")||inspection.matchedSong?.source||""),
    matchedSongTitle:clean(inspection.matchedSong?.title),
    matchedSongArtist:clean(inspection.matchedSong?.artist),
    inspectedAt:new Date().toISOString()
  }:inspectionRecord(inspection);
  const updated=await storage.updateRequest(req.params.id,record);
  res.json({ok:true,inspection,request:publicRequest(updated)});
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

/* ---------- 곡 제목·가수 기반 안전검사 v10.5 ----------
   원칙
   1) 가사/YouTube 자막은 읽지 않습니다.
   2) 입력한 곡 제목·가수와 실제 음원 후보의 일치도를 먼저 검증합니다.
   3) Apple/iTunes + Deezer 두 공개 음원 카탈로그의 Explicit 정보를 함께 확인합니다.
   4) Explicit/금지표현이 확인되면 차단합니다.
   5) 음원을 못 찾거나 외부 검사 서비스가 불안정하거나 결과가 애매하면 "관리자 검사 필요"로 저장할 수 있습니다.
*/
const LOCAL_BLOCK=[
  "씨발","시발","ㅅㅂ","ㅆㅂ","개새끼","개새","병신","븅신","좆","좃","존나","졸라","지랄",
  "창녀","걸레","보지","자지","섹스","성관계","야동","포르노","음란","19금","후방주의",
  "강간","마약","대마","코카인","필로폰",
  "fuck","fucking","f*ck","f**k","motherfucker","shit","bullshit","bitch","bitches","asshole",
  "dick","pussy","cock","cunt","slut","whore","porn","porno","sex","sexual","nude","nudity","nsfw",
  "rape","cocaine","heroin","meth","explicit","uncensored"
];
const INSPECTION_CACHE=new Map();
const INSPECTION_CACHE_MS=15*60*1000;

function normalizeForFilter(text){
  return String(text||"").toLowerCase().normalize("NFKC")
    .replace(/[\s._\-*~!@#$%^&()+=[\]{}:;"'<>?,/\\|]/g,"");
}
function localFilter(text){
  const compact=normalizeForFilter(text);
  return [...new Set(LOCAL_BLOCK.filter(term=>compact.includes(normalizeForFilter(term))))];
}
function normalizeMusicText(text){
  return clean(text).toLowerCase().normalize("NFKC")
    .replace(/\([^)]*\)|\[[^\]]*\]/g," ")
    .replace(/\b(feat|ft|featuring|prod|remaster(?:ed)?|version|ver|official|audio|lyrics?|mv|music video|visualizer)\b\.?/gi," ")
    .replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ]+/gi," ")
    .replace(/\s+/g," ").trim();
}
function textSimilarity(a,b){
  const A=normalizeMusicText(a),B=normalizeMusicText(b);
  if(!A||!B)return 0;
  if(A===B)return 1;
  if(A.includes(B)||B.includes(A))return Math.min(A.length,B.length)>=2?0.94:0.8;
  const aa=new Set(A.split(" ").filter(Boolean)),bb=new Set(B.split(" ").filter(Boolean));
  let inter=0;for(const x of aa)if(bb.has(x))inter++;
  const union=new Set([...aa,...bb]).size||1;
  return inter/union;
}
function candidateMetrics(inputTitle,inputArtist,youtubeText,item){
  const titleScore=textSimilarity(inputTitle,item.trackName||"");
  const artistScore=textSimilarity(inputArtist,item.artistName||"");
  const ytTitleScore=textSimilarity(inputTitle,youtubeText||"");
  const inputArtistYtScore=textSimilarity(inputArtist,youtubeText||"");
  const catalogTitleYtScore=textSimilarity(item.trackName||"",youtubeText||"");
  const catalogArtistYtScore=textSimilarity(item.artistName||"",youtubeText||"");

  const titleVerified=
    titleScore>=0.80 ||
    (titleScore>=0.68 && catalogTitleYtScore>=0.82);

  // 한국어/영문 예명 차이는 YouTube 제목·채널에 두 표기가 함께 존재할 때만 보조 인정.
  const artistVerified=
    artistScore>=0.74 ||
    (inputArtistYtScore>=0.90 && catalogArtistYtScore>=0.82);

  const score=
    titleScore*0.44 + artistScore*0.26 +
    catalogTitleYtScore*0.12 + catalogArtistYtScore*0.08 +
    ytTitleScore*0.05 + inputArtistYtScore*0.05;

  return {
    titleScore,artistScore,ytTitleScore,inputArtistYtScore,catalogTitleYtScore,catalogArtistYtScore,
    titleVerified,artistVerified,verified:titleVerified&&artistVerified,score
  };
}
function inspectionCacheKey(body){
  return [normalizeMusicText(body.songTitle),normalizeMusicText(body.artistName),getYoutubeId(clean(body.url))||clean(body.url)].join("|");
}
function getCachedInspection(key){
  const hit=INSPECTION_CACHE.get(key);
  if(!hit)return null;
  if(Date.now()-hit.at>INSPECTION_CACHE_MS){INSPECTION_CACHE.delete(key);return null;}
  return hit.value;
}
function setCachedInspection(key,value){
  INSPECTION_CACHE.set(key,{at:Date.now(),value});
  if(INSPECTION_CACHE.size>300){
    const first=INSPECTION_CACHE.keys().next().value;
    if(first)INSPECTION_CACHE.delete(first);
  }
}
async function fetchJson(url,headers={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6500);
  try{
    const r=await fetch(url,{headers,signal:controller.signal});
    if(!r.ok)throw new Error(`HTTP_${r.status}`);
    return await r.json();
  }finally{clearTimeout(timer);}
}
async function youtubeMetadata(videoId){
  const watch=`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const oembed=`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
  const j=await fetchJson(oembed,{"User-Agent":"Mozilla/5.0"});
  return {title:clean(j.title),channel:clean(j.author_name)};
}

/* Apple/iTunes */
async function appleSearchTerm(term,country){
  const endpoint=`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${country}&media=music&entity=song&limit=40`;
  const j=await fetchJson(endpoint,{"User-Agent":"IASA-Morning-Song/10.5","Accept":"application/json"});
  return Array.isArray(j.results)?j.results:[];
}
function appleItem(raw,country){
  return {
    source:"Apple",
    sourceId:String(raw.trackId||""),
    trackName:clean(raw.trackName),
    artistName:clean(raw.artistName),
    albumName:clean(raw.collectionName),
    explicitness:clean(raw.trackExplicitness||raw.collectionExplicitness||"unknown"),
    country
  };
}
async function searchApple(songTitle,artistName,youtubeText){
  const errors=[],items=[];
  const combined=`${songTitle} ${artistName}`;
  // 먼저 가장 정확한 검색 2회만 수행. 부족할 때만 제목 단독 검색을 추가합니다.
  for(const country of ["KR","US"]){
    try{items.push(...(await appleSearchTerm(combined,country)).map(x=>appleItem(x,country)));}
    catch(err){errors.push(`Apple ${country}: ${String(err.message||err)}`);}
  }
  let ranked=rankCandidates(songTitle,artistName,youtubeText,items);
  if(!ranked.some(x=>x._metrics.verified)){
    for(const country of ["KR","US"]){
      try{items.push(...(await appleSearchTerm(songTitle,country)).map(x=>appleItem(x,country)));}
      catch(err){errors.push(`Apple ${country} title: ${String(err.message||err)}`);}
    }
    ranked=rankCandidates(songTitle,artistName,youtubeText,items);
  }
  return {source:"Apple",ranked,errors,available:errors.length<4};
}

/* Deezer - 별도 API 키 없이 공개 검색 결과의 explicit_lyrics를 보조 판정에 사용 */
async function deezerSearchTerm(term){
  const endpoint=`https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=50`;
  const j=await fetchJson(endpoint,{"User-Agent":"IASA-Morning-Song/10.5","Accept":"application/json"});
  return Array.isArray(j.data)?j.data:[];
}
function deezerItem(raw){
  const hasExplicit=typeof raw.explicit_lyrics==="boolean";
  return {
    source:"Deezer",
    sourceId:String(raw.id||""),
    trackName:clean(raw.title_short||raw.title),
    artistName:clean(raw.artist?.name),
    albumName:clean(raw.album?.title),
    explicitness:hasExplicit?(raw.explicit_lyrics?"explicit":"notExplicit"):"unknown",
    country:"GLOBAL"
  };
}
async function searchDeezer(songTitle,artistName,youtubeText){
  const errors=[],items=[];
  try{items.push(...(await deezerSearchTerm(`${songTitle} ${artistName}`)).map(deezerItem));}
  catch(err){errors.push(`Deezer: ${String(err.message||err)}`);}
  let ranked=rankCandidates(songTitle,artistName,youtubeText,items);
  if(!ranked.some(x=>x._metrics.verified)){
    try{items.push(...(await deezerSearchTerm(songTitle)).map(deezerItem));}
    catch(err){errors.push(`Deezer title: ${String(err.message||err)}`);}
    ranked=rankCandidates(songTitle,artistName,youtubeText,items);
  }
  return {source:"Deezer",ranked,errors,available:errors.length<2};
}
function rankCandidates(songTitle,artistName,youtubeText,items){
  const dedup=new Map();
  for(const item of items){
    const key=`${item.source}:${item.sourceId||`${normalizeMusicText(item.trackName)}|${normalizeMusicText(item.artistName)}`}`;
    if(!dedup.has(key))dedup.set(key,item);
  }
  return [...dedup.values()].map(item=>{
    const m=candidateMetrics(songTitle,artistName,youtubeText,item);
    return {...item,_metrics:m,_score:m.score};
  }).sort((a,b)=>b._score-a._score);
}
function publicCandidate(x){
  if(!x)return null;
  return {
    source:x.source,title:x.trackName,artist:x.artistName,album:x.albumName,country:x.country,
    explicitness:x.explicitness,score:Number(x._score.toFixed(2)),
    titleScore:Number(x._metrics.titleScore.toFixed(2)),
    artistScore:Number(x._metrics.artistScore.toFixed(2))
  };
}
function inspectionRecord(result){
  const m=result.matchedSong||{};
  return {
    inspectionStatus:result.status==="pass"?"pass":"review",
    inspectionMessage:clean(result.message),
    inspectionDetail:clean(result.detail),
    inspectionSource:clean(result.sources?.join(" + ")||m.source||""),
    matchedSongTitle:clean(m.title),
    matchedSongArtist:clean(m.artist),
    inspectedAt:new Date().toISOString()
  };
}
async function prepareSongInspection(body,{force=false}={}){
  const url=clean(body.url),songTitle=clean(body.songTitle),artistName=clean(body.artistName),videoId=getYoutubeId(url);
  if(!videoId){
    return {ok:false,canSubmit:false,status:"block",stage:"youtube",message:"YouTube 영상 링크만 신청할 수 있습니다.",detail:"링크 형식을 확인해주세요."};
  }

  const key=inspectionCacheKey(body);
  if(!force){
    const cached=getCachedInspection(key);
    if(cached)return cached;
  }

  let meta=null,youtubeError="";
  try{meta=await youtubeMetadata(videoId);}
  catch(err){youtubeError=String(err.message||err);}

  const youtubeText=meta?`${meta.title} ${meta.channel}`:"";
  const metadataHits=localFilter([songTitle,artistName,youtubeText].join("\n"));
  if(metadataHits.length){
    const result={
      ok:false,canSubmit:false,status:"block",stage:"metadata-filter",
      message:"곡 제목·가수·영상 정보에서 학교 방송에 부적절할 수 있는 표현이 확인되어 신청할 수 없습니다.",
      detail:"욕설·선정적 표현 등 금지어가 확인되었습니다. 가사나 자막은 읽지 않습니다."
    };
    setCachedInspection(key,result);return result;
  }

  // 두 음원 서비스를 병렬 조회해 한 서비스가 실패해도 다른 서비스로 검사할 수 있게 합니다.
  const [apple,deezer]=await Promise.all([
    searchApple(songTitle,artistName,youtubeText).catch(err=>({source:"Apple",ranked:[],errors:[String(err.message||err)],available:false})),
    searchDeezer(songTitle,artistName,youtubeText).catch(err=>({source:"Deezer",ranked:[],errors:[String(err.message||err)],available:false}))
  ]);

  const verified=[
    ...apple.ranked.filter(x=>x._metrics.verified),
    ...deezer.ranked.filter(x=>x._metrics.verified)
  ];

  // 같은 곡이라고 충분히 검증된 후보만 등급 판정에 사용합니다.
  const explicit=verified.filter(x=>x.explicitness==="explicit");
  const cleaned=verified.filter(x=>x.explicitness==="cleaned");
  const safe=verified.filter(x=>x.explicitness==="notExplicit");
  const sources=[...new Set(verified.map(x=>x.source))];

  if(explicit.length){
    const best=explicit.sort((a,b)=>b._score-a._score)[0];
    const matchedSong=publicCandidate(best);
    const result={
      ok:false,canSubmit:false,status:"block",stage:"rating",
      message:`'${matchedSong.title}' - ${matchedSong.artist} 곡이 Explicit(청소년 부적절 표현 포함)로 확인되어 신청할 수 없습니다.`,
      detail:`${sources.join(" + ")||matchedSong.source} 음원 등급에서 Explicit 정보가 확인되었습니다.`,
      matchedSong,sources
    };
    setCachedInspection(key,result);return result;
  }

  if(cleaned.length){
    const best=cleaned.sort((a,b)=>b._score-a._score)[0];
    const matchedSong=publicCandidate(best);
    const result={
      ok:false,canSubmit:true,status:"review",stage:"rating",
      message:"관리자 검사 필요 · Clean 버전으로 표시된 곡입니다.",
      detail:"원곡에 Explicit 버전이 있을 가능성이 있어 자동 승인하지 않고 관리자 확인 대상으로 저장합니다.",
      matchedSong,sources
    };
    setCachedInspection(key,result);return result;
  }

  if(!verified.length){
    const serviceErrors=[...apple.errors,...deezer.errors];
    const allServicesFailed=!apple.available&&!deezer.available;
    const result={
      ok:false,canSubmit:true,status:"review",stage:allServicesFailed?"service":"catalog",
      message:allServicesFailed?"관리자 검사 필요 · 자동검사 서비스가 원활하지 않습니다.":"관리자 검사 필요 · 정확한 음원을 자동으로 찾지 못했습니다.",
      detail:allServicesFailed
        ?"신청은 저장할 수 있으며 관리자 화면에 확인 필요로 표시됩니다."
        :"다른 곡을 잘못 판정하지 않도록 제목과 가수가 충분히 일치하는 음원을 찾지 못하면 자동 통과시키지 않습니다.",
      sources:[],
      diagnostics:serviceErrors.slice(0,3)
    };
    // 외부 서비스 장애는 오래 캐시하지 않기 위해 저장하지 않습니다.
    if(!allServicesFailed)setCachedInspection(key,result);
    return result;
  }

  // YouTube 메타데이터를 가져오지 못하면 실제 링크가 입력한 곡인지 확신할 수 없으므로 관리자 확인.
  if(!meta){
    const best=(safe[0]||verified[0]);
    const matchedSong=publicCandidate(best);
    return {
      ok:false,canSubmit:true,status:"review",stage:"youtube-service",
      message:"관리자 검사 필요 · YouTube 영상 정보를 자동으로 확인하지 못했습니다.",
      detail:"음원 후보는 찾았지만 현재 YouTube 링크의 영상 정보를 확인하지 못해 관리자 확인 대상으로 저장합니다.",
      matchedSong,sources,diagnostics:[youtubeError].filter(Boolean)
    };
  }

  // YouTube 영상 제목과 입력 곡 제목이 너무 다르면 '차단'하지 않고 관리자 확인 대상으로 둡니다.
  const linkTitleScore=textSimilarity(songTitle,meta.title);
  if(linkTitleScore<0.34){
    const best=(safe[0]||verified[0]);
    const matchedSong=publicCandidate(best);
    const result={
      ok:false,canSubmit:true,status:"review",stage:"youtube-match",
      message:"관리자 검사 필요 · 입력한 곡과 YouTube 영상의 일치 여부가 애매합니다.",
      detail:"곡 자체의 음원 정보는 확인했지만 YouTube 영상 제목이 입력한 곡과 충분히 일치하지 않아 관리자 확인이 필요합니다.",
      matchedSong,sources
    };
    setCachedInspection(key,result);return result;
  }

  if(safe.length){
    // 두 서비스가 모두 후보를 찾았는데 서로 다른 아티스트/곡으로 갈리는 경우 안전하게 관리자 확인.
    const sourceBest={};
    for(const x of safe){
      if(!sourceBest[x.source]||x._score>sourceBest[x.source]._score)sourceBest[x.source]=x;
    }
    const bestList=Object.values(sourceBest);
    if(bestList.length>=2){
      const a=bestList[0],b=bestList[1];
      const sameTitle=textSimilarity(a.trackName,b.trackName)>=0.82;
      const sameArtist=textSimilarity(a.artistName,b.artistName)>=0.68 ||
        (textSimilarity(a.artistName,youtubeText)>=0.82&&textSimilarity(b.artistName,youtubeText)>=0.82);
      if(!sameTitle||!sameArtist){
        const result={
          ok:false,canSubmit:true,status:"review",stage:"conflict",
          message:"관리자 검사 필요 · 음원 서비스별 검색 결과가 서로 다릅니다.",
          detail:"잘못된 곡을 자동 통과시키지 않기 위해 관리자 확인 대상으로 저장합니다.",
          matchedSong:publicCandidate(bestList.sort((x,y)=>y._score-x._score)[0]),
          sources:[...new Set(bestList.map(x=>x.source))]
        };
        setCachedInspection(key,result);return result;
      }
    }

    const best=safe.sort((a,b)=>b._score-a._score)[0];
    const matchedSong=publicCandidate(best);
    const result={
      ok:true,canSubmit:true,status:"pass",stage:"complete",
      message:`검사 완료 · ${matchedSong.title} - ${matchedSong.artist} · Explicit 표시 없음`,
      detail:`${sources.join(" + ")}에서 곡 정보를 확인했습니다. 가사·자막은 읽지 않습니다.`,
      matchedSong,sources,meta
    };
    setCachedInspection(key,result);return result;
  }

  const result={
    ok:false,canSubmit:true,status:"review",stage:"rating-unknown",
    message:"관리자 검사 필요 · 음원은 찾았지만 Explicit 등급을 확인할 수 없습니다.",
    detail:"자동으로 안전하다고 확정할 수 없어 관리자 확인 대상으로 저장합니다.",
    matchedSong:publicCandidate(verified[0]),sources
  };
  setCachedInspection(key,result);return result;
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
  const result=await prepareSongInspection(req.body);res.status(result.status==="block"?422:200).json(result);
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
  const inspection=await prepareSongInspection(req.body);
  if(inspection.status==="block")return res.status(422).json({message:inspection.message,inspection});
  const item={
    id:crypto.randomUUID(),requestDate:clean(req.body.requestDate),slot:Number(req.body.slot),
    studentNumber:clean(req.body.studentNumber),studentName:clean(req.body.studentName),
    songTitle:clean(req.body.songTitle),artistName:clean(req.body.artistName),url:clean(req.body.url),
    editHash:hash(clean(req.body.editCode)),createdAt:new Date().toISOString(),adminEdited:false,
    ...inspectionRecord(inspection)
  };
  try{
    const saved=await storage.createRequest(item);
    const review=inspection.status==="review";
    res.status(201).json({
      message:review?"기상곡 신청이 저장되었습니다. 관리자 검사가 필요합니다.":"기상곡 신청이 완료되었습니다.",
      review,item:publicRequest(saved)
    });
  }catch(err){if(duplicateSlotError(err))return res.status(409).json({message:"이미 신청된 순서입니다."});throw err;}
}));
app.put("/api/requests/:id",asyncRoute(async(req,res)=>{
  const error=validateRequest(req.body);if(error)return res.status(400).json({message:error});
  const current=await storage.getRequest(req.params.id);if(!current)return res.status(404).json({message:"신청 내역을 찾을 수 없습니다."});
  if(!safeEqual(current.editHash,hash(clean(req.body.editCode))))return res.status(403).json({message:"수정 비밀번호가 일치하지 않습니다."});
  const inspection=await prepareSongInspection(req.body);
  if(inspection.status==="block")return res.status(422).json({message:inspection.message,inspection});
  const changes={
    requestDate:clean(req.body.requestDate),slot:Number(req.body.slot),studentNumber:clean(req.body.studentNumber),
    studentName:clean(req.body.studentName),songTitle:clean(req.body.songTitle),artistName:clean(req.body.artistName),
    url:clean(req.body.url),updatedAt:new Date().toISOString(),...inspectionRecord(inspection)
  };
  try{
    await storage.updateRequest(req.params.id,changes);
    res.json({message:inspection.status==="review"?"수정되었습니다. 관리자 검사가 필요합니다.":"수정되었습니다.",review:inspection.status==="review"});
  }catch(err){if(duplicateSlotError(err))return res.status(409).json({message:"해당 순서는 이미 신청되어 있습니다."});throw err;}
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

app.get("/api/system-status",(req,res)=>{res.json({aiEnabled:true,model:"Apple/iTunes + Deezer Explicit metadata",message:"Apple + Deezer 곡 안전검사",storage:storage.mode,persistent:storage.mode==="supabase"});});
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
