import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env, isDemo } from "@/lib/env";
import { createSession } from "@/lib/session";
export async function GET(request:NextRequest){if(!isDemo()) return new NextResponse("Niet gevonden",{status:404}); const board=new URL(request.url).searchParams.get("role")==="board"; const id=board?"demo-board":"demo-member-1"; const user=await db.user.findUnique({where:{congressusUserId:id}}); if(!user) return NextResponse.redirect(new URL("/?fout=voer-seed-uit",env().APP_URL)); await createSession({userId:user.id,role:user.role,congressusUserId:user.congressusUserId}); return NextResponse.redirect(new URL(board?"/bestuur":"/dashboard",env().APP_URL));}
