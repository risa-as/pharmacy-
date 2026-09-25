// Read/sign only: requires a previously created TPM key; never enrolls a server.
const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const {createHash,createPublicKey,verify}=require('node:crypto');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const start=performance.now();
const child=spawn(process.argv[2] || path.join(__dirname,'../resources/tpm-signer.exe'),[],{windowsHide:true,stdio:'pipe'});
let id=0;const pending=new Map();
const timeout=setTimeout(()=>{child.kill();process.exitCode=1;console.error('TPM benchmark timed out');},45000);
child.stderr.on('data',()=>{});
createInterface({input:child.stdout}).on('line',line=>{const r=JSON.parse(line),p=pending.get(r.id);pending.delete(r.id);if(p)r.ok?p.resolve(r.result):p.reject(Error(r.error));});
child.on('error',error=>{console.error(error.message);clearTimeout(timeout);process.exitCode=1;});
function command(action,digest){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});child.stdin.write(JSON.stringify({id:n,action,digest})+'\n');});}
(async()=>{
 const [n,e]=await command('public');
 const startupMs=performance.now()-start;
 const key=createPublicKey({key:{kty:'RSA',n:Buffer.from(n,'base64').toString('base64url'),e:Buffer.from(e,'base64').toString('base64url')},format:'jwk'});
 if(!await command('export-check'))throw Error('Private key was exportable');
 const times=[];
 for(let i=0;i<30;i++){
   const message=Buffer.from('faramace synthetic benchmark '+i),digest=createHash('sha256').update(message).digest('base64');
   const t=performance.now(),signature=await command('sign',digest);times.push(performance.now()-t);
   if(!verify('sha256',message,key,Buffer.from(signature,'base64')))throw Error('Signature verification failed');
 }
 times.sort((a,b)=>a-b);
 const workerWorkingSetBytes=await command('metrics');
 console.log(JSON.stringify({provider:'Microsoft Platform Crypto Provider',algorithm:'RSA-2048 SHA256 PKCS1',samples:times.length,privateExportBlocked:true,allSignaturesVerified:true,startupMs,medianMs:times[15],p95Ms:times[28],maxMs:times[29],workerWorkingSetBytes,measuredAt:new Date().toISOString(),scope:'Local TPM helper IPC/signing only; not end-to-end checkout or a 4GB customer device.'},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>{clearTimeout(timeout);child.stdin.end();});
