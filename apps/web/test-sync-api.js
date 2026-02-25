
const API_URL = "http://localhost:3000/api/sync/products";
const BRANCH_ID = "042da0f6-e452-4cea-95b0-227623e10c8b";

async function main() {
    try {
        const url = `${API_URL}?branchId=${BRANCH_ID}`;
        console.log(`Fetching from: ${url}`);
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error("Response text:", text);
            return;
        }

        const data = await response.json();
        console.log("DEBUG_START");
        console.log(JSON.stringify(data.debug, null, 2));
        console.log("DEBUG_END");
        // console.log("Response Data (First 3 items):");
        // console.log(JSON.stringify(data.drugs.slice(0, 3), null, 2));

        const zeros = data.drugs.filter(d => d.price === 0 || d.stock === 0);
        // console.log(`\nItems with 0 price or stock: ${zeros.length}`);
        if (zeros.length > 0) {
            // console.log("Sample zero item:", JSON.stringify(zeros[0], null, 2));
        }

    } catch (error) {
        console.error("Failed to fetch:", error);
    }
}

main();
