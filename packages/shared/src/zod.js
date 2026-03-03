"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrugSchema = void 0;
const zod_1 = require("zod");
exports.DrugSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    name: zod_1.z.string(),
    barcode: zod_1.z.string(),
});
