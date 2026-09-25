import {createHash, webcrypto} from 'node:crypto';
import {expect, it, vi} from 'vitest';
import {deviceComparisonCode} from '../../../../packages/shared/src/device-comparison-code';
vi.stubGlobal('crypto', webcrypto);
it('matches the independently calculated versioned 60-bit code', async()=>{
 const fp='0123456789abcdef'.repeat(4);
 const hash=createHash('sha256').update(`faramace-device-comparison:v1:${fp}`).digest('hex');
 const alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
 let bits=BigInt('0x'+hash.slice(0,15)); let expected='';
 for(let i=0;i<12;i++){expected=alphabet[Number(bits & 31n)]+expected;bits >>= 5n;}
 expect(await deviceComparisonCode(fp)).toBe(expected.match(/.{4}/g)!.join('-'));
});
it('normalizes hex casing identically on both clients',async()=>{
 const fp='abcdef0123456789'.repeat(4);
 expect(await deviceComparisonCode(' '+fp.toUpperCase()+' ')).toBe(await deviceComparisonCode(fp));
});
it('uses the full fingerprint including its middle',async()=>{
 const fp='a'.repeat(64);
 expect(await deviceComparisonCode(fp)).not.toBe(await deviceComparisonCode(fp.slice(0,30)+'b'+fp.slice(31)));
 expect(await deviceComparisonCode(fp)).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$/);
});
it.each(['', 'a'.repeat(63), 'g'.repeat(64)])('rejects malformed fingerprints',async fp=>{
 await expect(deviceComparisonCode(fp)).rejects.toThrow('Invalid device fingerprint');
});
