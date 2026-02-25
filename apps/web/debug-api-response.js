
const fetch = require('node-fetch');

const MAIN_BRANCH_ID = '3e734b74-c4cf-4e5d-bf4f-6254c1426271';
const KARADA_BRANCH_ID = '042da0f6-e452-4cea-95b0-227623e10c8b';
const API_URL = 'http://localhost:3000/api/sync/products';

async function checkBranch(name, id) {
    console.log(`\n--- Checking ${name} (${id}) ---`);
    try {
        const res = await fetch(`${API_URL}?branchId=${id}`);
        const data = await res.json();

        if (data.drugs) {
            console.log(`Count: ${data.drugs.length}`);
            data.drugs.forEach(d => {
                console.log(` - ${d.tradeName} (Stock: ${d.stock})`);
            });
        } else {
            console.log('No drugs found or error in structure', data);
        }
    } catch (e) {
        console.error('Fetch error:', e.message);
    }
}

async function main() {
    await checkBranch('MAIN BRANCH', MAIN_BRANCH_ID);
    await checkBranch('KARADA BRANCH', KARADA_BRANCH_ID);
}

main();
