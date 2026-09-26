import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';

function setup(refreshFails=false) {
  const source=readFileSync(new URL('../../src/components/DeviceProtection.tsx',import.meta.url),'utf8');
  const start=source.indexOf('  async function enrol()');
  const end=source.indexOf('  async function copy()',start);
  if(start<0||end<0)throw Error('Enrollment handler missing');
  const fingerprint=vi.fn(),status=vi.fn(),ready=vi.fn(),busy=vi.fn(),message=vi.fn();
  const refresh=vi.fn(async()=>{
    if(refreshFails)throw Error('IPC unavailable');
    fingerprint('new-local-fingerprint');status(null);ready(false);
    return {sessionReady:false};
  });
  const deps={window:{ipcRenderer:{invoke:vi.fn(async()=>({success:false,error:'Different server key'}))}},
    setFingerprint:fingerprint,setStatus:status,setSessionReady:ready,setBusy:busy,setMessage:message,refreshLocalState:refresh};
  const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
  const run=new Function(...Object.keys(deps),code+';return enrol;')(...Object.values(deps));
  return {run,fingerprint,status,ready,busy,message,refresh};
}
it('refreshes the comparison fingerprint after a rejected enrollment changed local state',async()=>{
  const h=setup();await h.run();expect(h.refresh).toHaveBeenCalledOnce();
  expect(h.fingerprint).toHaveBeenLastCalledWith('new-local-fingerprint');
  expect(h.message).toHaveBeenLastCalledWith('Different server key');
  expect(h.busy).toHaveBeenLastCalledWith(false);
});
it('hides the old comparison fingerprint if the post-error local state cannot be read',async()=>{
  const h=setup(true);await h.run();expect(h.fingerprint).toHaveBeenLastCalledWith('');
  expect(h.status).toHaveBeenLastCalledWith(null);expect(h.ready).toHaveBeenLastCalledWith(false);
  expect(h.message).toHaveBeenLastCalledWith('Different server key');
});
