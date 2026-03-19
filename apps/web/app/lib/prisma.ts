import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
    const client = new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });

    // Retry middleware: handles Neon/serverless connection drops transparently.
    client.$use(async (params: any, next: (params: any) => Promise<any>) => {
        const MAX_RETRIES = 3;
        const DELAYS_MS = [300, 800, 2000];

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                return await next(params);
            } catch (err: any) {
                const code = err?.code as string | undefined;
                const msg: string = err?.message ?? "";
                const isRetryable =
                    code === "P1001" ||  // Can't reach database server
                    code === "P1002" ||  // Connection timed out
                    code === "P1017" ||  // Server closed connection
                    code === "P2024" ||  // Connection pool timeout
                    msg.includes("Can't reach database") ||
                    msg.includes("connection timeout") ||
                    msg.includes("Server has closed the connection") ||
                    msg.includes("Connection reset") ||
                    msg.includes("10054");  // Windows: connection forcibly closed

                if (isRetryable && attempt < MAX_RETRIES - 1) {
                    const delay = DELAYS_MS[attempt];
                    console.warn(`[Prisma] Retrying (${code ?? "conn"}) attempt ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
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
