async function main() {
    try {
        const response = await fetch("http://127.0.0.1:3000/api/sync/settings");
        if (!response.ok) throw new Error(response.statusText);
        const data = await response.json();
        console.log("API Response:", JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Fetch failed:", error);
    }
}

main();
