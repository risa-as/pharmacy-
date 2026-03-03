import { PrismaClient } from '../node_modules/.prisma/desktop-client';

// Instantiate Prisma Client
// Need to ensure the binary is accessible in the packaged app
// For dev, standard path works.
// For prod, we might need extra config, but let's stick to dev first.

import path from 'path';

export const prisma = new PrismaClient({
    datasources: {
        db: {
            url: `file:${path.join(__dirname, '../prisma/local.db')}`
        }
    }
});
