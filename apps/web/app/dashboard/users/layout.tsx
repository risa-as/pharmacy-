/**
 * Users Hub Layout
 *
 * Wraps /dashboard/users and its sibling pages (permissions, permissions-guide)
 * with a unified top tab bar, surfacing user management in one place.
 *
 * Tabs (3):  Users List · Manage Permissions · Permissions Guide
 * Actions (1): Add Member → /dashboard/users/create
 */

import HubTabNav, { type HubTab, type HubAction } from "@/app/ui/hub-tab-nav";
import { Users, Shield, BookOpen, Plus } from "lucide-react";

const TABS: HubTab[] = [
    { name: "المستخدمين",      href: "/dashboard/users",              icon: <Users className="w-3.5 h-3.5 shrink-0" /> },
    { name: "إدارة الصلاحيات", href: "/dashboard/users/permissions",  icon: <Shield className="w-3.5 h-3.5 shrink-0" /> },
    { name: "دليل الصلاحيات",  href: "/dashboard/permissions-guide",  icon: <BookOpen className="w-3.5 h-3.5 shrink-0" /> },
];

const ACTIONS: HubAction[] = [
    { name: "إضافة عضو", href: "/dashboard/users/create", icon: <Plus className="w-3.5 h-3.5 shrink-0" />, variant: "primary" },
];

export default function UsersLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <HubTabNav
                tabs={TABS}
                actions={ACTIONS}
                skipOnPatterns={["/create", "/edit"]}
            />
            {children}
        </>
    );
}
