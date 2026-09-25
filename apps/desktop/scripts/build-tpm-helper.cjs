const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
if(process.platform!=='win32') throw Error('Build the Windows TPM helper on Windows with .NET Framework 4.6+ installed.');
const compiler=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const output=path.join(__dirname,'../resources/tpm-signer.exe');
if(!fs.existsSync(compiler)) throw Error('Windows .NET Framework C# compiler not found.');
execFileSync(compiler,['/nologo','/target:exe','/optimize+','/reference:System.Web.Extensions.dll','/out:'+output,path.join(__dirname,'../resources/tpm-signer.cs')],{stdio:'inherit',windowsHide:true});
console.log('Built Windows CNG TPM helper.');
