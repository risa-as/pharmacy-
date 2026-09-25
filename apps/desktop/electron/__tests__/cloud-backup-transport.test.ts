import {expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const h=vi.hoisted(()=>({fetch:vi.fn()}));
vi.mock('electron',()=>({net:{fetch:h.fetch}}));
vi.mock('../backup',()=>({createBackup:vi.fn()}));
vi.mock('../store',()=>({default:{get:()=> 'test-license'}}));
import {uploadBackup} from '../cloudBackup';
it('sends multipart backup through Electron without embedding a shared secret',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'faramace-upload-test-'));
 const file=path.join(dir,'test.db');fs.writeFileSync(file,'synthetic database');
 h.fetch.mockResolvedValue(new Response('{}',{status:200}));
 try {
  expect((await uploadBackup(file,'test-branch')).ok).toBe(true);
  const [,init]=h.fetch.mock.calls[0];
  expect(init.headers).toEqual({'x-device-license-key':'test-license','x-branch-id':'test-branch'});
  expect(await init.body.get('file').text()).toBe('synthetic database');
  expect(init.body.get('branchId')).toBe('test-branch');
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
