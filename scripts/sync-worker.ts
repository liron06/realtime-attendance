import { processOutbox } from "../lib/sync";import { db } from "../lib/db";
async function run(){console.log("RealTime synchronisatiewerker gestart");while(true){const count=await processOutbox();await new Promise(r=>setTimeout(r,count?1000:5000));}}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>db.$disconnect());
