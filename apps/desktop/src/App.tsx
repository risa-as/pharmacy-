import { useState } from 'react';
import POSLayout from './components/POSLayout';
import SettingsPage from './components/SettingsPage';
import { ShoppingCart, Settings } from 'lucide-react';

type Page = 'pos' | 'settings';

function App() {
    const [currentPage, setCurrentPage] = useState<Page>('pos');

    return (
        <div className="flex h-screen">
            {/* الشريط الجانبي */}
            <div dir="rtl" className="w-16 bg-blue-700 flex flex-col items-center py-4 gap-2">
                <button
                    onClick={() => setCurrentPage('pos')}
                    className={`p-3 rounded-xl transition-all ${currentPage === 'pos'
                        ? 'bg-white text-blue-600'
                        : 'text-white/70 hover:bg-white/20 hover:text-white'
                        }`}
                    title="نقطة البيع"
                >
                    <ShoppingCart className="w-6 h-6" />
                </button>

                <button
                    onClick={() => setCurrentPage('settings')}
                    className={`p-3 rounded-xl transition-all ${currentPage === 'settings'
                        ? 'bg-white text-blue-600'
                        : 'text-white/70 hover:bg-white/20 hover:text-white'
                        }`}
                    title="الإعدادات"
                >
                    <Settings className="w-6 h-6" />
                </button>
            </div>

            {/* المحتوى */}
            <div className="flex-1 overflow-hidden">
                {currentPage === 'pos' && <POSLayout />}
                {currentPage === 'settings' && <SettingsPage />}
            </div>
        </div>
    );
}

export default App;
