import React from 'react';
import { router, type Href } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { AssistantScreen } from '../components/assistant/AssistantScreen';

export default function AssistantRoute() {
    const { user, can, features } = useAuth();
    return <AssistantScreen userId={user?.id ?? ''} allowed={user?.role === 'ADMIN'} canPrepare={can('canCreateWarehouseOrder') && can('canViewWarehouseOrders') && !!features.warehouseManagement} navigate={destination => router.push(destination as Href)} />;
}
