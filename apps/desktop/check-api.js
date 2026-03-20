// 1. تعريف الرابط الأساسي ديناميكياً خارج الدالة
const API_BASE_URL =
  process.env.VITE_CLOUD_API_URL || "https://app.faramace.com";

async function main() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sync/settings`);
    if (!response.ok) throw new Error(response.statusText);
    const data = await response.json();
    console.log("API Response:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Fetch failed:", error);
  }
}

main();
