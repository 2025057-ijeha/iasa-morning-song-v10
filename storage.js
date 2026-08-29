const fs = require("fs");
const path = require("path");

const REQUESTS_FILE = path.join(__dirname, "data", "requests.json");
const POSTS_FILE = path.join(__dirname, "data", "posts.json");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const useSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
let supabase = null;

if (useSupabase) {
  const { createClient } = require("@supabase/supabase-js");
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function readJson(file, fallback = []) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}
function writeJson(file, value) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function dbRequestToApp(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestDate: row.request_date,
    slot: row.slot,
    studentNumber: row.student_number,
    studentName: row.student_name,
    songTitle: row.song_title,
    artistName: row.artist_name,
    url: row.url,
    editHash: row.edit_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined,
    adminEdited: Boolean(row.admin_edited)
  };
}
function appRequestToDb(row) {
  return {
    id: row.id,
    request_date: row.requestDate,
    slot: row.slot,
    student_number: row.studentNumber,
    student_name: row.studentName,
    song_title: row.songTitle,
    artist_name: row.artistName,
    url: row.url,
    edit_hash: row.editHash,
    created_at: row.createdAt,
    updated_at: row.updatedAt || null,
    admin_edited: Boolean(row.adminEdited)
  };
}

function dbPostToApp(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    deleteHash: row.delete_hash,
    createdAt: row.created_at,
    likedBy: (row.post_likes || []).map(x => x.voter_id),
    comments: (row.comments || [])
      .map(c => ({ id:c.id, content:c.content, createdAt:c.created_at }))
      .sort((a,b) => new Date(a.createdAt)-new Date(b.createdAt))
  };
}

async function sbResult(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

const storage = {
  mode: useSupabase ? "supabase" : "local-json",

  async listRequestsByDate(date) {
    if (!useSupabase) return readJson(REQUESTS_FILE, []).filter(x => x.requestDate === date).sort((a,b)=>a.slot-b.slot);
    const rows = await sbResult(supabase.from("requests").select("*").eq("request_date", date).order("slot"));
    return rows.map(dbRequestToApp);
  },

  async listRequestsRange(start, end) {
    if (!useSupabase) return readJson(REQUESTS_FILE, []).filter(x => x.requestDate >= start && x.requestDate <= end).sort((a,b)=>a.requestDate.localeCompare(b.requestDate)||a.slot-b.slot);
    const rows = await sbResult(supabase.from("requests").select("*").gte("request_date", start).lte("request_date", end).order("request_date").order("slot"));
    return rows.map(dbRequestToApp);
  },

  async listAllRequests() {
    if (!useSupabase) return readJson(REQUESTS_FILE, []).sort((a,b)=>String(a.requestDate).localeCompare(String(b.requestDate))||Number(a.slot)-Number(b.slot));
    const rows = await sbResult(supabase.from("requests").select("*").order("request_date").order("slot"));
    return rows.map(dbRequestToApp);
  },

  async getRequest(id) {
    if (!useSupabase) return readJson(REQUESTS_FILE, []).find(x => String(x.id) === String(id)) || null;
    const rows = await sbResult(supabase.from("requests").select("*").eq("id", id).limit(1));
    return rows[0] ? dbRequestToApp(rows[0]) : null;
  },

  async createRequest(item) {
    if (!useSupabase) {
      const rows=readJson(REQUESTS_FILE, []);
      if(rows.some(x=>x.requestDate===item.requestDate&&Number(x.slot)===Number(item.slot))) { const e=new Error("DUPLICATE_SLOT"); e.code="23505"; throw e; }
      rows.push(item); writeJson(REQUESTS_FILE, rows); return item;
    }
    const rows = await sbResult(supabase.from("requests").insert(appRequestToDb(item)).select("*"));
    return dbRequestToApp(rows[0]);
  },

  async updateRequest(id, changes) {
    if (!useSupabase) {
      const rows=readJson(REQUESTS_FILE, []), idx=rows.findIndex(x=>String(x.id)===String(id));
      if(idx<0)return null;
      if(rows.some((x,i)=>i!==idx&&x.requestDate===changes.requestDate&&Number(x.slot)===Number(changes.slot))) { const e=new Error("DUPLICATE_SLOT"); e.code="23505"; throw e; }
      rows[idx]={...rows[idx],...changes}; writeJson(REQUESTS_FILE,rows); return rows[idx];
    }
    const current = await this.getRequest(id);
    if (!current) return null;
    const merged = {...current,...changes};
    const payload = appRequestToDb(merged);
    delete payload.id;
    delete payload.created_at;
    const rows = await sbResult(supabase.from("requests").update(payload).eq("id",id).select("*"));
    return rows[0] ? dbRequestToApp(rows[0]) : null;
  },

  async deleteRequest(id) {
    if (!useSupabase) {
      const rows=readJson(REQUESTS_FILE, []),idx=rows.findIndex(x=>String(x.id)===String(id));
      if(idx<0)return null; const [deleted]=rows.splice(idx,1);writeJson(REQUESTS_FILE,rows);return deleted;
    }
    const rows = await sbResult(supabase.from("requests").delete().eq("id",id).select("*"));
    return rows[0] ? dbRequestToApp(rows[0]) : null;
  },

  async listPosts() {
    if (!useSupabase) return readJson(POSTS_FILE, []).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    const rows = await sbResult(supabase.from("posts").select("id,title,content,delete_hash,created_at,comments(id,content,created_at),post_likes(voter_id)").order("created_at",{ascending:false}));
    return rows.map(dbPostToApp);
  },

  async getPost(id) {
    if (!useSupabase) return readJson(POSTS_FILE, []).find(x=>String(x.id)===String(id))||null;
    const rows = await sbResult(supabase.from("posts").select("id,title,content,delete_hash,created_at,comments(id,content,created_at),post_likes(voter_id)").eq("id",id).limit(1));
    return rows[0] ? dbPostToApp(rows[0]) : null;
  },

  async createPost(post) {
    if (!useSupabase) { const rows=readJson(POSTS_FILE,[]);rows.push(post);writeJson(POSTS_FILE,rows);return post; }
    const payload={id:post.id,title:post.title,content:post.content,delete_hash:post.deleteHash,created_at:post.createdAt};
    const rows=await sbResult(supabase.from("posts").insert(payload).select("*"));
    return dbPostToApp({...rows[0],comments:[],post_likes:[]});
  },

  async toggleLike(postId, voterId) {
    if (!useSupabase) {
      const posts=readJson(POSTS_FILE,[]),post=posts.find(x=>String(x.id)===String(postId));if(!post)return null;
      post.likedBy=Array.isArray(post.likedBy)?post.likedBy:[];const idx=post.likedBy.indexOf(voterId);
      if(idx>=0)post.likedBy.splice(idx,1);else post.likedBy.push(voterId);writeJson(POSTS_FILE,posts);return {likes:post.likedBy.length,liked:idx<0};
    }
    const found=await sbResult(supabase.from("post_likes").select("post_id").eq("post_id",postId).eq("voter_id",voterId).limit(1));
    let liked;
    if(found.length){await sbResult(supabase.from("post_likes").delete().eq("post_id",postId).eq("voter_id",voterId));liked=false;}
    else{await sbResult(supabase.from("post_likes").insert({post_id:postId,voter_id:voterId}));liked=true;}
    // head:true count는 별도 반환됩니다.
    const {count:likes,error}=await supabase.from("post_likes").select("post_id",{count:"exact",head:true}).eq("post_id",postId);
    if(error)throw error;
    return {likes:likes||0,liked};
  },

  async addComment(postId, comment) {
    if (!useSupabase) {
      const posts=readJson(POSTS_FILE,[]),post=posts.find(x=>String(x.id)===String(postId));if(!post)return null;
      post.comments=Array.isArray(post.comments)?post.comments:[];post.comments.push(comment);writeJson(POSTS_FILE,posts);return comment;
    }
    const rows=await sbResult(supabase.from("comments").insert({id:comment.id,post_id:postId,content:comment.content,created_at:comment.createdAt}).select("*"));
    if(!rows[0])return null;
    return {id:rows[0].id,content:rows[0].content,createdAt:rows[0].created_at};
  },

  async updatePost(id, changes) {
    if (!useSupabase) {
      const posts=readJson(POSTS_FILE,[]),idx=posts.findIndex(x=>String(x.id)===String(id));
      if(idx<0)return null;
      posts[idx]={...posts[idx],title:changes.title,content:changes.content};
      writeJson(POSTS_FILE,posts);return posts[idx];
    }
    const rows=await sbResult(supabase.from("posts").update({title:changes.title,content:changes.content}).eq("id",id).select("*"));
    if(!rows[0])return null;
    return await this.getPost(id);
  },

  async deleteComment(postId, commentId) {
    if (!useSupabase) {
      const posts=readJson(POSTS_FILE,[]),post=posts.find(x=>String(x.id)===String(postId));
      if(!post)return null;
      post.comments=Array.isArray(post.comments)?post.comments:[];
      const idx=post.comments.findIndex(x=>String(x.id)===String(commentId));
      if(idx<0)return null;
      const [deleted]=post.comments.splice(idx,1);writeJson(POSTS_FILE,posts);return deleted;
    }
    const rows=await sbResult(supabase.from("comments").delete().eq("id",commentId).eq("post_id",postId).select("*"));
    return rows[0]||null;
  },

  async deletePost(id) {
    if (!useSupabase) {
      const posts=readJson(POSTS_FILE,[]),idx=posts.findIndex(x=>String(x.id)===String(id));if(idx<0)return null;
      const [deleted]=posts.splice(idx,1);writeJson(POSTS_FILE,posts);return deleted;
    }
    const rows=await sbResult(supabase.from("posts").delete().eq("id",id).select("*"));
    return rows[0]||null;
  }
};

module.exports = storage;
