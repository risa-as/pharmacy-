import { useAuth } from '../../context/AuthContext';
import { AdminDashboard } from '../../components/dashboards/AdminDashboard';
import { PharmacistDashboard } from '../../components/dashboards/PharmacistDashboard';

/**
 * Home tab — delegates to the role-appropriate dashboard.
 * Admin/Manager → AdminDashboard (US-B1)
 * Pharmacist     → PharmacistDashboard (stub; fully redesigned in Phase 2 T2.1)
 */
export default function HomeScreen() {
    const { isAdmin } = useAuth();
    return isAdmin ? <AdminDashboard /> : <PharmacistDashboard />;
}
