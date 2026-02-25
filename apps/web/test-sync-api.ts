
// Native fetch in Node 18+

const API_URL = "http://localhost:3000/api/sync/products";
const BRANCH_ID = "3e736254-c142-6271-913b-398782fe2ad8"; // The one we found earlier

async function main() {
    try {
        const url = `${API_URL}?branchId=${BRANCH_ID}`;
        console.log(`Fetching from: ${url}`);
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            return;
        }

        const data = await response.json();
        // @ts-ignore
        console.log("Debug Info:", JSON.stringify(data.debug, null, 2));
        console.log("Response Data (First 3 items):");
        // @ts-ignore
        console.log(JSON.stringify(data.drugs.slice(0, 3), null, 2));

        // @ts-ignore
        const zeros = data.drugs.filter(d => d.price === 0 || d.stock === 0);
        console.log(`\nItems with 0 price or stock: ${zeros.length}`);
        if (zeros.length > 0) {
            console.log("Sample zero item:", zeros[0]);
        }

    } catch (error) {
        console.error("Failed to fetch:", error);
    }
}

main();

export { };
