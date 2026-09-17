"use client";

import dynamic from "next/dynamic";

const ElectronSessionSync = dynamic(() => import("../electron-session-sync"), { ssr: false });
const OnboardingTour = dynamic(() => import("./onboarding-tour"), { ssr: false });
const AIAssistantPanel = dynamic(() => import("../ai-assistant/AIAssistantPanel"), { ssr: false });

export default function DashboardClientWidgets({ showAssistant }: { showAssistant: boolean }) {
    return <>
        <ElectronSessionSync />
        <OnboardingTour />
        {showAssistant && <AIAssistantPanel />}
    </>;
}
