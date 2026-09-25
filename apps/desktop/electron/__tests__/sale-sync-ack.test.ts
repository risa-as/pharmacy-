import { expect, it, vi } from "vitest";
import { acknowledgeSales } from "../sale-sync-ack";
it("stores the final number and acknowledgment in one write", async () => {
 const db = {sale:{update:vi.fn().mockResolvedValue({})}};
 expect(await acknowledgeSales(db,[{id:"a"}],["a"],{a:2311})).toBe(1);
 expect(db.sale.update).toHaveBeenCalledWith({where:{id:"a"},data:{invoiceNumber:"2311",synced:true}});
});
it("keeps a sale pending when an acknowledgment has no recoverable number", async () => {
 const db = {sale:{update:vi.fn()}};
 expect(await acknowledgeSales(db,[{id:"a"}],["a"],{})).toBe(0);
 expect(db.sale.update).not.toHaveBeenCalled();
});
it("supports older server retries of already numbered sales", async () => {
 const db = {sale:{update:vi.fn().mockResolvedValue({})}};
 expect(await acknowledgeSales(db,[{id:"a",invoiceNumber:"90"}],["a"],{})).toBe(1);
});
it("does not acknowledge an unaccepted or unsolicited sale", async () => {
 const db = {sale:{update:vi.fn()}};
 expect(await acknowledgeSales(db,[{id:"a"}],["b"],{a:10,b:11})).toBe(0);
 expect(db.sale.update).not.toHaveBeenCalled();
});
it("propagates local write failure for retry without a separate synced flag", async () => {
 const db = {sale:{update:vi.fn().mockRejectedValue(Error("disk"))}};
 await expect(acknowledgeSales(db,[{id:"a"}],["a"],{a:20})).rejects.toThrow("disk");
 expect(db.sale.update).toHaveBeenCalledOnce();
});
it("keeps a printed number the server replaced as a searchable alternative reference", async () => {
 const db = {sale:{update:vi.fn().mockResolvedValue({})}};
 expect(await acknowledgeSales(db,[{id:"a",invoiceNumber:"2350"}],["a"],{a:2412})).toBe(1);
 expect(db.sale.update).toHaveBeenCalledWith({where:{id:"a"},data:{invoiceNumber:"2412",synced:true,printedReference:"2350"}});
});
