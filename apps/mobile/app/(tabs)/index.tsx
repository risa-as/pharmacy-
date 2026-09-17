import { useAuth } from '../../context/AuthContext';
import { AdminDashboard } from '../../components/dashboards/AdminDashboard';
import { PharmacistDashboard } from '../../components/dashboards/PharmacistDashboard';

/**
 * Home tab — delegates to the dashboard of the user's shell (utils/roles):
 * manager shell → AdminDashboard, pharmacist shell → PharmacistDashboard.
 */
export default function HomeScreen() {
    const { shell } = useAuth();
    return shell === 'manager' ? <AdminDashboard /> : <PharmacistDashboard />;
}
