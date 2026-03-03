const fs = require('fs');
const content = fs.readFileSync('apps/desktop/dist-electron/main.js', 'utf8');
const searchString = '"inlineSchema": `';
const startIndex = content.indexOf(searchString);
if (startIndex !== -1) {
    const actualStart = startIndex + searchString.length;
    let endIndex = actualStart;

    // Find the closing backtick that doesn't belong to another template, 
    // but the inline schema usually just ends at `\n  },\n` or similar.
    // Actually, prisma inline schema ends with exactly '`' after the schema text
    // Let's just substring 10000 characters and write it to inspect.
    const snippet = content.substring(actualStart, actualStart + 15000);
    const endTick = snippet.indexOf('`');
    if (endTick !== -1) {
        fs.writeFileSync('apps/desktop/prisma/schema.prisma', snippet.substring(0, endTick), 'utf8');
        console.log('Successfully recovered schema.prisma');
    } else {
        console.log('Could not find closing tick');
    }
} else {
    console.log('Could not find inlineSchema');
}
