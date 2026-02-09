import { z } from "zod";

export const DrugSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string(),
    barcode: z.string(),
});
