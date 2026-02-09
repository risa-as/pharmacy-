import { Redirect } from 'expo-router';

export default function Index() {
    // توجيه مباشر لصفحة تسجيل الدخول
    return <Redirect href="/login" />;
}
