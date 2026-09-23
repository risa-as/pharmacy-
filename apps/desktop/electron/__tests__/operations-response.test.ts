import {it,expect} from "vitest";
import {operationJson} from "../operations-response";
import {validateSnapshotBarcodes} from "../product-snapshot-validation";
it("explains missing deployed route",async()=>{await expect(operationJson(new Response("<!DOCTYPE html>",{status:404,headers:{"content-type":"text/html"}}))).rejects.toThrow("يلزم نشر تحديث الويب");});
it("rejects HTML and malformed JSON",async()=>{await expect(operationJson(new Response("<html>",{headers:{"content-type":"text/html"}}))).rejects.toThrow("صفحة");await expect(operationJson(new Response("bad",{headers:{"content-type":"application/json"}}))).rejects.toThrow("غير صالحة");});
it("preserves permission errors",async()=>{expect(await operationJson(new Response(JSON.stringify({error:"denied"}),{status:403,headers:{"content-type":"application/json"}}))).toEqual({error:"denied"});});
it("rejects conflicting cloud barcode identities",()=>{expect(()=>validateSnapshotBarcodes([{id:"a",barcode:"123"},{id:"b",barcode:"123"}])).toThrow("لم يُستبدل");});
it("accepts distinct barcodes",()=>{expect(()=>validateSnapshotBarcodes([{id:"a",barcode:"123"},{id:"a",barcode:"123"},{id:"b",barcode:null}])).not.toThrow();});
