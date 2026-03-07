import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
    const client = new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });

    // Retry middleware: handles Neon cold-start (P1001) transparently
    client.$use(async (params, next) => {
        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                return await next(params);
            } catch (err: any) {
                const isConnError =
                    err?.code === "P1001" ||
                    err?.message?.includes("Can't reach database") ||
                    err?.message?.includes("connection") ||
                    err?.errorCode === undefined; // PrismaClientInitializationError

                if (isConnError && attempt < MAX_RETRIES - 1) {
                    const delay = 2000 * (attempt + 1); // 2s, 4s
                    console.warn(`[Prisma] Connection failed (attempt ${attempt + 1}/${MAX_RETRIES}). Retrying in ${delay}ms...`);
                    await new Promise((r) => setTimeout(r, delay));
                } else {
                    throw err;
                }
            }
        }
    });

    return client;
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
