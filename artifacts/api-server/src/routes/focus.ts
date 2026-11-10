import { Router } from "express";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { pool } from "@workspace/db";
const router = Router();
const hash = (s:string) => createHash("sha256").update(s).digest("hex");
const cookies = (s = "") => Object.fromEntries(s.split(";").map(x => x.trim().split("=")));
const rawOrigin = process.env.APP_ORIGIN?.trim();
const origin = (() => { try { const url = new URL(rawOrigin ?? ''); return ['http:', 'https:'].includes(url.protocol) && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password ? url.origin : undefined; } catch { return undefined; } })();
const configured = Boolean(origin && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const cookie = (name:string,value:string,age:number) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${origin?.startsWith("https:") ? "; Secure" : ""}`;
router.get("/auth/me", async (req,res) => {
 const token=cookies(req.headers.cookie).focus_session;
 const result=token ? await pool.query("SELECT u.* FROM focus_users u JOIN focus_sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()",[hash(token)]) : {rows:[]};
 res.json({user:result.rows[0] ?? null, configured});
});
router.get("/auth/google",async (_req,res)=>{
 if(!configured){res.status(503).json({error:"Configure APP_ORIGIN, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable sign-in."});return;}
 const state=randomBytes(32).toString("hex");
 await pool.query("INSERT INTO focus_oauth_states VALUES ($1,now()+interval '10 minutes')",[hash(state)]);
 res.setHeader("Set-Cookie",cookie("focus_oauth",state,600));
 const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
 url.search=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,redirect_uri:`${origin}/api/auth/google/callback`,response_type:"code",scope:"openid email profile",state}).toString();res.redirect(url.toString());
});
router.get("/auth/google/callback",async(req,res)=>{
 const state=String(req.query.state??"");
 if(!configured || !state || state!==cookies(req.headers.cookie).focus_oauth){res.status(400).json({error:"Invalid sign-in state. Please start again."});return;}
 const used=await pool.query("DELETE FROM focus_oauth_states WHERE state_hash=$1 AND expires_at>now() RETURNING state_hash",[hash(state)]);
 if(!used.rowCount){res.status(400).json({error:"Sign-in expired. Please start again."});return;}
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",body:new URLSearchParams({code:String(req.query.code??""),client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,redirect_uri:`${origin}/api/auth/google/callback`,grant_type:"authorization_code"}),signal:AbortSignal.timeout(10000)});
 if(!response.ok){res.status(401).json({error:"Google sign-in failed. Please try again."});return;}
 const token=await response.json() as {access_token:string};
 const profileResponse=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(10000)});
 const profile=await profileResponse.json() as {sub:string;name:string;email:string;email_verified:boolean};
 if(!profileResponse.ok || !profile.sub || !profile.email_verified){res.status(401).json({error:"A verified Google account is required."});return;}
 const session=randomBytes(32).toString("hex");
 const client=await pool.connect();try{await client.query("BEGIN");
 await client.query("INSERT INTO focus_users VALUES ($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=$2,email=$3",[profile.sub,profile.name||profile.email,profile.email]);
 await client.query("INSERT INTO focus_projects(id,user_id,name,inbox) SELECT $1,$2,'Inbox',true WHERE NOT EXISTS (SELECT 1 FROM focus_projects WHERE user_id=$2 AND inbox) ON CONFLICT DO NOTHING",[randomUUID(),profile.sub]);
 await client.query("INSERT INTO focus_sessions VALUES ($1,$2,now()+interval '7 days')",[hash(session),profile.sub]);await client.query("COMMIT");
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
 res.setHeader("Set-Cookie",[cookie("focus_session",session,604800),cookie("focus_oauth","",0)]);res.redirect("/");
});
router.use(async(req,res,next)=>{
 if(req.method!=="GET" && req.headers.origin!==origin){res.status(403).json({error:"Invalid request origin"});return;}
 const token=cookies(req.headers.cookie).focus_session;
 if(!token){res.status(401).json({error:"Sign in required"});return;}
 const result=await pool.query("SELECT user_id FROM focus_sessions WHERE token_hash=$1 AND expires_at>now()",[hash(token)]);
 if(!result.rowCount){res.status(401).json({error:"Session expired"});return;}res.locals.userId=result.rows[0].user_id;next();
});
router.post("/auth/logout",async(req,res)=>{await pool.query("DELETE FROM focus_sessions WHERE token_hash=$1",[hash(cookies(req.headers.cookie).focus_session)]);res.setHeader("Set-Cookie",cookie("focus_session","",0));res.sendStatus(204);});
router.get("/projects",async(_req,res)=>{res.json((await pool.query("SELECT * FROM focus_projects WHERE user_id=$1 ORDER BY inbox DESC,name",[res.locals.userId])).rows);});
router.post("/projects",async(req,res)=>{const name=String(req.body.name??"").trim();if(!name||name.length>100){res.status(400).json({error:"Project name must be 1–100 characters"});return;}res.status(201).json((await pool.query("INSERT INTO focus_projects(id,user_id,name) VALUES ($1,$2,$3) RETURNING *",[randomUUID(),res.locals.userId,name])).rows[0]);});
router.get("/tasks",async(_req,res)=>{res.json((await pool.query("SELECT *,to_char(due_date,'YYYY-MM-DD') AS due_date FROM focus_tasks WHERE user_id=$1 ORDER BY created_at DESC",[res.locals.userId])).rows);});
router.post("/tasks",async(req,res)=>{const b=req.body;const title=String(b.title??"").trim();if(!title||title.length>300||!['low','medium','high'].includes(b.priority??'medium')){res.status(400).json({error:"Invalid task title or priority"});return;}const result=await pool.query("INSERT INTO focus_tasks(id,user_id,project_id,title,description,priority,due_date) SELECT $1,$2,id,$4,$5,$6,$7 FROM focus_projects WHERE id::text=$3 AND user_id=$2 RETURNING *",[randomUUID(),res.locals.userId,b.project_id,title,String(b.description??''),b.priority??'medium',b.due_date||null]);if(!result.rowCount){res.status(404).json({error:"Project not found"});return;}res.status(201).json(result.rows[0]);});
router.patch("/tasks/:id",async(req,res)=>{const b=req.body;if(!['todo','in_progress','done'].includes(b.status)||!['low','medium','high'].includes(b.priority)||!String(b.title??'').trim()||String(b.title).length>300){res.status(400).json({error:"Invalid task"});return;}const result=await pool.query("UPDATE focus_tasks SET title=$3,description=$4,status=$5,priority=$6,due_date=$7,version=version+1 WHERE id::text=$1 AND user_id=$2 AND version=$8 RETURNING *",[req.params.id,res.locals.userId,b.title.trim(),b.description??'',b.status,b.priority,b.due_date||null,b.version]);if(!result.rowCount){res.status(409).json({error:"Task changed or was removed. Refresh and try again."});return;}res.json(result.rows[0]);});
router.delete("/tasks/:id",async(req,res)=>{await pool.query("DELETE FROM focus_tasks WHERE id::text=$1 AND user_id=$2",[req.params.id,res.locals.userId]);res.sendStatus(204);});
export default router;
