const BRANCH_ID = "e9e8f4c2-9547-4180-873b-555555555555";

async function check(host) {
    const url = `http://${host}:3000/api/health`;
    console.log(`Checking ${host}...`);
    try {
        const res = await fetch(url);
        console.log(`  Success! Status: ${res.status}`);
        return true;
    } catch (e) {
        console.log(`  Failed: ${e.message}`);
        return false;
    }
}

async function test() {
    console.log("--- Diagnostic Tool ---");
    // Check Health
    await check('127.0.0.1');

    // Check Data
    console.log("\nChecking Data from 127.0.0.1...");
    const SYNC_URL = "http://127.0.0.1:3000/api/sync/products?branchId=" + BRANCH_ID;
    try {
        const res = await fetch(SYNC_URL);
        console.log(`Sync Status: ${res.status}`);
        const data = await res.json();
        console.log(`Drugs Found: ${data.drugs ? data.drugs.length : 0}`);
        if (data.drugs && data.drugs.length > 0) {
            console.log("Sample:", data.drugs[0].tradeName);
        }
    } catch (e) {
        console.log(`Sync Data Failed: ${e.message}`);
    }
}

test();
