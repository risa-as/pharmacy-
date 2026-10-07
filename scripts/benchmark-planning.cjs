// Read-only benchmark against synthetic local verify_perf ONLY. No model, auth or external services.
// node scripts/benchmark-planning.cjs before|after S|M|L [repeats]
const fs = require('fs'), path = require('path'), vm = require('vm'), ts = require('typescript'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..'), web = path.join(root, 'apps/web');
const evidence = path.join(root, 'artifacts/system-audit-2026-09-30');
const [mode, size = 'L', count = '3'] = process.argv.slice(2);
if (!['before','after'].includes(mode) || !['S','M','L'].includes(size)) throw new Error('Invalid benchmark arguments');
if (!Number.isSafeInteger(Number(count)) || Number(count) < 1 || Number(count) > 100) throw new Error('Repeats must be 1..100');
// Explicitly empty keys before loading Prisma: a generated client can load the source checkout .env.
for (const f of ['.env','.env.local','.env.production','.env.production.local','.env.development','.env.development.local']) {
 const file=path.join(web,f); if(fs.existsSync(file)) for(const m of fs.readFileSync(file,'utf8').matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) process.env[m[1]]='';
}
const url = 'postgresql://postgres@127.0.0.1:55467/verify_perf';
process.env.DATABASE_URL=url;
const { PrismaClient } = require(require.resolve('@prisma/client',{paths:[web]}));
const prisma = new PrismaClient({datasources:{db:{url}},log:[{emit:'event',level:'query'}]});
let dbMs=0, queries=0; prisma.$on('query',e=>{dbMs+=e.duration;queries++;});
const cache = new Map(); let dataMs=0;
function load(file) {
 file=path.resolve(file); if(cache.has(file))return cache.get(file);
 const name=path.basename(file,'.ts');
 const source=mode==='before' && ['smart-purchasing','smart-purchasing-data','ai-insights'].includes(name)
  ? execFileSync('git', ['show', `483f32c:apps/web/app/lib/${name}.ts`], {cwd:root,encoding:'utf8'})
  : fs.readFileSync(file,'utf8');
 const exports={};cache.set(file,exports);
 const req=n=>{
  if(n==='@/app/lib/prisma')return {prisma};
  if(n==='@/app/lib/saas-guards')return {checkFeatureAccess:async()=>({allowed:true})};
  if(n.startsWith('@/')||n.startsWith('.'))return load((n.startsWith('@/')?path.join(web,n.slice(2)):path.resolve(path.dirname(file),n))+'.ts');
  return require(require.resolve(n,{paths:[web]}));
 };
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:req,console,process,Date,Map,Set,Promise,Math,JSON,setTimeout,clearTimeout,setImmediate}, {filename:file});
 if(name==='smart-purchasing-data') {const f=exports.getPlanningData;exports.getPlanningData=async(...a)=>{const t=performance.now();try{return await f(...a)}finally{dataMs+=performance.now()-t}};}
 return exports;
}
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x,(k,v)=>k==='generatedAt'?undefined:v)).digest('hex');
(async()=>{
 const ids=JSON.parse(fs.readFileSync(path.join(evidence,`perf-${size}.local.json`),'utf8'));
 const ctx={organizationId:ids.orgId,user:{id:ids.adminId,role:'ADMIN',organizationId:ids.orgId,branchId:ids.branchIds[0]},branchModelWhere:{organizationId:ids.orgId},tenantBranchWhere:{branch:{organizationId:ids.orgId}},userPermissions:{canViewInventory:true,canViewSales:true,canCreatePurchase:true,canCreateWarehouseOrder:true,canTransferStock:true}};
 const insights=load(path.join(web,'app/lib/ai-insights.ts'));
 const data=load(path.join(web,'app/lib/smart-purchasing-data.ts'));
 const math=load(path.join(web,'app/lib/smart-purchasing.ts'));
 const settings=load(path.join(web,'app/lib/purchase-planning.ts'));
 const tasks={waste:()=>insights.buildWasteCard(ctx),daily:()=>insights.buildDailyCard(ctx),reorder:()=>insights.buildReorderCard(ctx),allBranches:async()=>{const d=await data.getPlanningData(ctx);const options=new Map();for(const b of ids.branchIds)options.set(b,(await settings.resolvePlanningSettings(ctx,b)).options);const plan=r=>math.planRow(r,options.get(r.branchId),d.today);return mode==='before' ? d.rows.map(plan) : load(path.join(web,'app/lib/planning-batch.ts')).mapPlanningRows(d.rows,plan);}};
 const results={mode,size,counts:ids.counts,kind:'direct service benchmark; excludes HTTP, auth, serialization; plan access stubbed for synthetic account',results:{}};
 try {
  for(const [name,run] of Object.entries(tasks)) {
   if(process.env.PLANNING_TASK && name!==process.env.PLANNING_TASK) continue;
   const samples=[];let result;
   for(let i=0;i<Number(count);i++){dbMs=0;queries=0;dataMs=0;const t=performance.now();result=await run();samples.push({wallMs:Math.round(performance.now()-t),dataMs:Math.round(dataMs),dbMs,queries});}
   results.results[name]={samples,hash:hash(result)};console.log(JSON.stringify({name,...results.results[name]}));
  }
  const tag=process.env.PLANNING_TASK ? `-${process.env.PLANNING_TASK}` : '';
  fs.writeFileSync(path.join(evidence,`planning-${mode}-${size}${tag}.json`),JSON.stringify(results,null,2));
 }finally{await prisma.$disconnect();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
