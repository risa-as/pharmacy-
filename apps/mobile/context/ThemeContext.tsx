
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: (value: boolean) => void;
    isDarkMode: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
    theme: 'light',
    toggleTheme: () => { },
    isDarkMode: false,
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const systemScheme = useColorScheme();
    const [theme, setTheme] = useState<Theme>(systemScheme === 'dark' ? 'dark' : 'light');
    const [isManual, setIsManual] = useState(false);

    useEffect(() => {
        loadTheme();
    }, []);

    useEffect(() => {
        if (!isManual) {
            setTheme(systemScheme === 'dark' ? 'dark' : 'light');
        }
    }, [systemScheme, isManual]);

    const loadTheme = async () => {
        try {
            const savedTheme = await AsyncStorage.getItem('settings_theme');
            if (savedTheme) {
                setTheme(savedTheme as Theme);
                setIsManual(true);
            }
        } catch (error) {
            console.error('Failed to load theme:', error);
        }
    };

    const toggleTheme = async (isDark: boolean) => {
        const newTheme = isDark ? 'dark' : 'light';
        setTheme(newTheme);
        setIsManual(true);
        try {
            await AsyncStorage.setItem('settings_theme', newTheme);
        } catch (error) {
            console.error('Failed to save theme:', error);
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, isDarkMode: theme === 'dark' }}>
            {children}
        </ThemeContext.Provider>
    );
};
