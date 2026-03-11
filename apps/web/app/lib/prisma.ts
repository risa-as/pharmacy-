import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
    const client = new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });

    // Retry middleware: handles Neon/serverless cold-start (P1001) transparently.
    // Kept intentionally short to avoid user-visible latency on healthy connections.
    client.$use(async (params: any, next: (params: any) => Promise<any>) => {
        const MAX_RETRIES = 2;
        const DELAYS_MS = [500, 1500]; // was 2000/4000 — Neon cold-starts are ≤1s

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                return await next(params);
            } catch (err: any) {
                const isConnError =
                    err?.code === "P1001" ||
                    err?.code === "P1002" ||
                    err?.message?.includes("Can't reach database") ||
                    err?.message?.includes("connection timeout");

                if (isConnError && attempt < MAX_RETRIES - 1) {
                    const delay = DELAYS_MS[attempt];
                    if (process.env.NODE_ENV !== "production") {
                        console.warn(`[Prisma] Connection retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
                    }
                    await new Promise((r) => setTimeout(r, delay));
                } else {
                    throw err;
                }
            }
        }
    });

    return client;
}

// Singleton: reuse the same PrismaClient instance across hot-reloads in dev
// and across invocations in the same serverless function instance in prod.
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
