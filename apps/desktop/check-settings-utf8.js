const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
    const allSettings = await prisma.companySettings.findMany();
    let output = '--- LOCAL DB SETTINGS ---\n';
    if (allSettings.length > 0) {
        allSettings.forEach((s, i) => {
            output += `Record ${i + 1}:\n`;
            output += `  Name: ${s.name}\n`;
            output += `  Address: ${s.address}\n`;
            output += `  ID: ${s.id}\n`;
        });
    } else {
        output += 'No settings found in local DB.\n';
    }
    output += '-------------------------\n';
    fs.writeFileSync('settings_output_utf8.txt', output, 'utf8');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
