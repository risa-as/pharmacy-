import { normalizeSearchName } from './assistant-search';
export interface DrugSearchCandidate { id: string; tradeName: string; scientificName: string }
function westernDigits(s: string) { return s.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))); }
/** Conservative sound key for retrieving names, never confirming a medicine. */
function soundKey(value: string): string {
    const arabic: Record<string,string> = {ا:'a',ب:'b',ت:'t',ث:'t',ج:'j',ح:'h',خ:'kh',د:'d',ذ:'d',ر:'r',ز:'z',س:'s',ش:'sh',ص:'s',ض:'d',ط:'t',ظ:'z',ع:'a',غ:'g',ف:'f',ق:'k',ك:'k',ل:'l',م:'m',ن:'n',ه:'h',و:'w',ي:'y',ء:''};
    let text=normalizeSearchName(value).replace(/^ال/,'').replace(/[ء-ي]/g, letter=>arabic[letter]??'');
    text=text.replace(/ph/g,'f').replace(/ch/g,'sh').replace(/c(?=[eiy])/g,'s').replace(/c|q/g,'k').replace(/x/g,'ks').replace(/p/g,'b').replace(/v/g,'f').replace(/[aeiouwy\d\s+./%-]/g,'').replace(/[^a-z]/g,'');
    return text.replace(/(.)\1+/g,'$1');
}
function similarity(a:string,b:string):number {
    if(!a||!b)return 0;
    let previous=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++) { const next=[i];for(let j=1;j<=b.length;j++) next[j]=Math.min(next[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));previous=next; }
    return 1-previous[b.length]/Math.max(a.length,b.length);
}
export function matchesDrugStrength(query:string,drug:DrugSearchCandidate & {barcode?:string}):boolean {
    if(query.trim()===drug.barcode)return true;
    const strength: string[]=westernDigits(query).match(/\d+(?:\.\d+)?/g)??[];
    const doses: string[]=westernDigits(drug.tradeName+' '+drug.scientificName).match(/\d+(?:\.\d+)?/g)??[];
    return !strength.length || !doses.length || strength.every(d=>doses.includes(d));
}
export function rankDrugCandidates(query:string,catalog:DrugSearchCandidate[],limit=5):DrugSearchCandidate[] {
    if(/^\d{6,}$/.test(westernDigits(query).trim()))return []; // Never guess a barcode.
    const nameQuery=westernDigits(query).replace(/\d+(?:\.\d+)?\s*(?:mcg|mg|ml|iu|g|ميكروغرام|مليغرام|ملغ|ملجم|مجم|مل)(?=\s|$)/gi,'');
    const key=soundKey(nameQuery);if(key.length<3)return [];
    return catalog.map(drug=>{
        if(!matchesDrugStrength(query,drug))return {drug,score:0};
        const words=(drug.tradeName+' + '+drug.scientificName).split(/\s+|[+/,()]/).filter(w=>!/^(?:mg|mcg|g|ml|iu|tablets?|capsules?|\d+)$/i.test(w));
        const score=Math.max(...words.map(w=>soundKey(w)).filter(k=>k.length>=3).map(k=>similarity(key,k)),0);
        return {drug,score};
    }).filter(row=>row.score>=0.8).sort((a,b)=>b.score-a.score||a.drug.tradeName.localeCompare(b.drug.tradeName)).slice(0,limit).map(row=>row.drug);
}
