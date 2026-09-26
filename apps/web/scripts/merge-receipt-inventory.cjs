// Run from apps/web. Read-only by default. Apply only AFTER deploying the receipt-identity code.
// node scripts/merge-receipt-inventory.cjs --branch=... --source=... --target=... --actor=...
// Add --apply-after-deploy --expected-plan=<printed SHA256> after reviewing the exact plan.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
require('dotenv').config({path:path.resolve('.env'),quiet:true});
const args=Object.fromEntries(process.argv.slice(2).filter(a=>a.includes('=')).map(a=>{const n=a.indexOf('=');return[a.slice(2,n),a.slice(n+1)];}));
(async()=>{for(const key of ['branch','source','target','actor'])if(!args[key])throw Error('Required --'+key);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'faramace-stock-merge-'));const output=path.join(temp,'merge.cjs');
await require('esbuild').build({entryPoints:[path.resolve('app/lib/merge-receipt-inventory.ts')],bundle:true,platform:'node',format:'cjs',outfile:output,plugins:[{name:'prisma-runtime',setup(build){build.onResolve({filter:/^@prisma\/client$/},()=>({path:require.resolve('@prisma/client'),external:true}));}}]});
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();try{const {mergeReceiptInventory}=require(output);const input={branchId:args.branch,sourceId:args.source,targetId:args.target,actorId:args.actor};const plan=await mergeReceiptInventory(db,{...input,dryRun:true});const hash=crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');console.log(JSON.stringify({plan,planSha256:hash},null,2));
if(process.argv.includes('--apply-after-deploy')){if(args['expected-plan']!==hash)throw Error('Review the current plan and supply its SHA256; no changes applied.');await mergeReceiptInventory(db,{...input,expectedPlanHash:hash});console.log('Applied atomically; original batches and catalogue records preserved.');}
}finally{await db.$disconnect();fs.unlinkSync(output);fs.rmdirSync(temp);}})().catch(e=>{console.error(e.message);process.exitCode=1;});
