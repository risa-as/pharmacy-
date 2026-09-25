import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, createPublicKey } from 'node:crypto';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { app } from 'electron';

let worker: ChildProcessWithoutNullStreams | undefined;
let sequence = 0;
const pending = new Map<number, {resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>}>();
function stop(error = new Error('تعذر الوصول إلى مفتاح الجهاز؛ العمليات محفوظة محليًا.')) {
  const child = worker; worker = undefined;
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); }
  pending.clear(); child?.kill();
}
export function tpmCommand(action: 'status' | 'create' | 'public' | 'sign', digest?: string): Promise<any> {
  if (process.platform !== 'win32') return Promise.reject(new Error('حماية TPM متاحة في نسخة Windows فقط.'));
  if (!worker) {
    const executable = app.isPackaged ? path.join(process.resourcesPath, 'tpm-signer.exe') : path.join(__dirname, '../resources/tpm-signer.exe');
    worker = spawn(executable, [], { windowsHide: true, stdio: 'pipe' });
    const child = worker;
    createInterface({ input: child.stdout }).on('line', line => {
      try {
        const reply = JSON.parse(line); const p = pending.get(reply.id); if (!p) return;
        clearTimeout(p.timer); pending.delete(reply.id);
        if (reply.ok) p.resolve(reply.result); else p.reject(new Error('مفتاح TPM غير متاح. راجع حماية الجهاز؛ لم تُحذف العمليات المعلقة.'));
      } catch { stop(); }
    });
    child.stderr.on('data', () => { /* Never expose shell output or credentials to the renderer. */ });
    child.on('error', () => { if (worker === child) stop(); });
    child.on('exit', () => { if (worker === child) stop(); });
    child.stdin.on('error', () => { if (worker === child) stop(); });
  }
  return new Promise((resolve, reject) => {
    if (pending.size >= 32) { reject(new Error('طابور توقيع الجهاز مشغول؛ أعد المزامنة.')); return; }
    const id = ++sequence;
    pending.set(id, {resolve, reject, timer: setTimeout(() => stop(), 15000)});
    worker!.stdin.write(JSON.stringify({id, action, digest}) + '\n');
  });
}
export async function tpmPublicKey(create = false) {
  const [n, e] = await tpmCommand(create ? 'create' : 'public');
  const jwk = { kty: 'RSA', n: Buffer.from(n, 'base64').toString('base64url'), e: Buffer.from(e, 'base64').toString('base64url') };
  const pem = createPublicKey({key: jwk, format: 'jwk'}).export({type: 'spki', format: 'pem'}).toString();
  return {pem, fingerprint: createHash('sha256').update(pem).digest('hex')};
}
export function stopTpmWorker() { stop(); }
