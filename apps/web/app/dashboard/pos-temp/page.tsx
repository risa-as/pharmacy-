import WebPOSClient from "./_components/WebPOSClient";

export const metadata = {
    title: "Faramace - نقطة البيع (مؤقت)",
};

export default async function POSPage() {
    return (
        <main className="h-full w-full bg-background relative overflow-hidden flex flex-col pt-0 pb-0">
            <WebPOSClient />
        </main>
    );
}
