import { z } from "zod";
export declare const DrugSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    barcode: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    barcode: string;
    id?: string | undefined;
}, {
    name: string;
    barcode: string;
    id?: string | undefined;
}>;
