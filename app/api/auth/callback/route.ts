import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { fetchUserInfo } from "@/lib/congressus/client";

const memberPage = z.object({ data:z.array(z.object({ id:z.number(), username:z.string(), first_name:z.string().optional() }).passthrough()), total:z.number() });
export async function GET(request: NextRequest) {
  const config=env(); const url=new URL(request.url); const jar=await cookies(); const expected=jar.get("rt_oauth_state")?.value; jar.delete("rt_oauth_state");
  const state=url.searchParams.get("state")??""; const a=Buffer.from(expected??""); const b=Buffer.from(state);
  if (!expected || a.length!==b.length || !timingSafeEqual(a,b)) return NextResponse.redirect(new URL("/?fout=ongeldige-state",config.APP_URL));
  const code=url.searchParams.get("code"); if (!code || url.searchParams.has("error")) return NextResponse.redirect(new URL("/?fout=toegang-geweigerd",config.APP_URL));
  try {
    const basic=Buffer.from(`${config.CONGRESSUS_CLIENT_ID}:${config.CONGRESSUS_CLIENT_SECRET}`).toString("base64");
    const tokenResponse=await fetch(`${config.CONGRESSUS_BASE_URL}/oauth/token`,{method:"POST",headers:{Authorization:`Basic ${basic}`,"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:config.CONGRESSUS_REDIRECT_URI!}),signal:AbortSignal.timeout(10_000)});
    if(!tokenResponse.ok) throw new Error("TOKEN"); const token=z.object({access_token:z.string().min(1)}).parse(await tokenResponse.json());
    const info=await fetchUserInfo(token.access_token); if(!info.is_active) return NextResponse.redirect(new URL("/?fout=inactief-lid",config.APP_URL));
    // Congressus documenteert user_id als OAuth-gebruiker-ID, niet als member-ID.
    // De koppeling gebeurt daarom exact en uniek via de geverifieerde `username` uit userinfo.
    if(!info.username || !config.CONGRESSUS_API_KEY) throw new Error("MEMBER_MAPPING_UNAVAILABLE");
    const membersResponse=await fetch(`${config.CONGRESSUS_API_BASE_URL}/members?username=${encodeURIComponent(info.username)}&page_size=2`,{headers:{Authorization:`Bearer ${config.CONGRESSUS_API_KEY}`,Accept:"application/json"},signal:AbortSignal.timeout(10_000)});
    if(!membersResponse.ok) throw new Error("MEMBER_MAPPING_FAILED"); const members=memberPage.parse(await membersResponse.json());
    const exact=members.data.filter(m=>m.username===info.username); if(exact.length!==1) throw new Error("MEMBER_MAPPING_AMBIGUOUS");
    const groupSlug=config.CONGRESSUS_BOARD_GROUP_SLUG; const allowlist=new Set(config.CONGRESSUS_BOARD_USER_IDS.split(",").map(x=>x.trim()).filter(Boolean));
    const role=(groupSlug && info.groups?.[groupSlug]?.active===true)||allowlist.has(info.user_id)?"BOARD":"MEMBER";
    const user=await db.user.upsert({where:{congressusUserId:info.user_id},create:{congressusUserId:info.user_id,congressusMemberId:exact[0].id,username:info.username,name:info.name,firstName:exact[0].first_name,pictureUrl:info.picture,memberStatus:info.member_status,active:true,role},update:{congressusMemberId:exact[0].id,username:info.username,name:info.name,firstName:exact[0].first_name,pictureUrl:info.picture,memberStatus:info.member_status,active:true,role}});
    await createSession({userId:user.id,role:user.role,congressusUserId:user.congressusUserId}); return NextResponse.redirect(new URL("/dashboard",config.APP_URL));
  } catch { return NextResponse.redirect(new URL("/?fout=login-mislukt",config.APP_URL)); }
}
