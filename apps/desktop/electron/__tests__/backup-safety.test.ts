import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const h = vi.hoisted(() => ({root:'',file:'',db:null as any,open:null as any}));
vi.mock('electron',()=>({app:{getPath:()=>h.root}}));
vi.mock('../db',()=>({getDbPath:()=>h.file,get prisma(){return h.db;},openBackupReader:(p:string)=>h.open(p)}));
let createBackup: typeof import('../backup').createBackup;
let restoreBackup: typeof import('../backup').restoreBackup;
let gate: typeof import('../database-maintenance');
const {PrismaClient}=createRequire(import.meta.url)('.prisma/desktop-client');
const open=(file:string)=>new PrismaClient({datasources:{db:{url:`file:${file}`}}});
beforeEach(async()=>{
 vi.resetModules();
 gate=await import('../database-maintenance');
 ({createBackup,restoreBackup}=await import('../backup'));
 h.root=fs.mkdtempSync(path.join(os.tmpdir(),'faramace-backup-test-'));h.file=path.join(h.root,'active.db');h.db=open(h.file);h.open=open;
 h.db.$use((params:any,next:any)=>gate.withDatabaseQuery(()=>next(params)));
 for(const name of ['Sale','SaleItem','Inventory','Batch','User']) await h.db.$executeRawUnsafe(`CREATE TABLE "${name}" (id TEXT PRIMARY KEY)`);
 await h.db.$queryRawUnsafe('PRAGMA journal_mode=WAL');
 await h.db.$executeRawUnsafe("INSERT INTO Sale VALUES ('first')");
});
it('restores with the real gate while a real SQLite write finishes, and blocks competing writes',async()=>{
 const saved=await createBackup();expect(saved.success).toBe(true);
 let release!:()=>void;
 let entered!:()=>void;
 const started=new Promise<void>(resolve=>{entered=resolve;});
 const write=gate.withDatabaseQuery(async()=>{
  await h.db.$executeRawUnsafe("INSERT INTO Sale VALUES ('concurrent')");
  entered(); await new Promise<void>(resolve=>{release=resolve;});
 });
 await started;
 const restoring=restoreBackup(saved.path!);
 await expect(h.db.$executeRawUnsafe("INSERT INTO Sale VALUES ('blocked')")).rejects.toThrow('استعادة');
 release();await write;
 expect((await restoring).success).toBe(true);
 const reader=open(h.file);try{expect(await reader.$queryRawUnsafe('SELECT id FROM Sale')).toEqual([{id:'first'}]);}finally{await reader.$disconnect();}
 const previous=path.join(h.root,fs.readdirSync(h.root).find(n=>n.includes('.pre-restore-'))!);
 const old=open(previous);try{expect(await old.$queryRawUnsafe("SELECT id FROM Sale WHERE id='concurrent'")).toEqual([{id:'concurrent'}]);}finally{await old.$disconnect();}
});
afterEach(async()=>{await h.db.$disconnect();fs.rmSync(h.root,{recursive:true,force:true});});
it('restores a consistent SQLite backup including committed WAL data and keeps a safety snapshot',async()=>{
 const saved=await createBackup();expect(saved.success).toBe(true);
 await h.db.$executeRawUnsafe("INSERT INTO Sale VALUES ('later')");
 const restored=await restoreBackup(saved.path!);expect(restored.success).toBe(true);
 const reader=open(h.file);try{expect(await reader.$queryRawUnsafe('SELECT id FROM Sale')).toEqual([{id:'first'}]);}finally{await reader.$disconnect();}
 expect(fs.readdirSync(h.root).some(n=>n.includes('.pre-restore-'))).toBe(true);
});
it('rejects an invalid backup before disconnecting or replacing the current database',async()=>{
 const bad=path.join(h.root,'bad.db');fs.writeFileSync(bad,'not a database');
 expect((await restoreBackup(bad)).success).toBe(false);
 expect(await h.db.$queryRawUnsafe('SELECT id FROM Sale')).toEqual([{id:'first'}]);
});
it('fails safely instead of copying a live file when VACUUM fails',async()=>{
 const spy=vi.spyOn(h.db,'$executeRawUnsafe').mockRejectedValueOnce(Error('disk full'));
 expect((await createBackup()).success).toBe(false);spy.mockRestore();
 expect(await h.db.$queryRawUnsafe('SELECT id FROM Sale')).toEqual([{id:'first'}]);
});

it.skipIf(!process.env.AUDIT_BACKUP_FILE)('restores a copy of an installed-app backup into a disposable database',async()=>{
 const copied=path.join(h.root,'installed-copy.db');
 fs.copyFileSync(process.env.AUDIT_BACKUP_FILE!,copied);
 const counts=async(file:string)=>{
  const reader=open(file);
  try{
   const result:Record<string,unknown>={};
   for(const table of ['Sale','SaleItem','Inventory','Batch','User'])
    result[table]=await reader.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM "${table}"`);
   return result;
  }finally{await reader.$disconnect();}
 };
 const expected=await counts(copied);
 expect((await restoreBackup(copied)).success).toBe(true);
 expect(await counts(h.file)).toEqual(expected);
});
