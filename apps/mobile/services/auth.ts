import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

export interface User {
    id: string;
    email: string;
    name: string;
    role: string;
}

export const authService = {
    // Login
    async login(email: string, password: string): Promise<User> {
        try {
            const response = await axios.post(`${API_BASE_URL}/auth/login`, {
                email,
                password,
            });

            const { token, user } = response.data;

            // Store token and user data
            await AsyncStorage.setItem('authToken', token);
            await AsyncStorage.setItem('user', JSON.stringify(user));

            return user;
        } catch (error: any) {
            // For development, allow mock login
            if (email === 'admin@faramace.com' && password === 'password') {
                const mockUser: User = {
                    id: '1',
                    email: 'admin@faramace.com',
                    name: 'مدير النظام',
                    role: 'ADMIN',
                };
                await AsyncStorage.setItem('authToken', 'mock-token');
                await AsyncStorage.setItem('user', JSON.stringify(mockUser));
                return mockUser;
            }

            throw new Error(error.response?.data?.message || 'فشل تسجيل الدخول');
        }
    },

    // Logout
    async logout(): Promise<void> {
        await AsyncStorage.removeItem('authToken');
        await AsyncStorage.removeItem('user');
    },

    // Check if authenticated
    async isAuthenticated(): Promise<boolean> {
        const token = await AsyncStorage.getItem('authToken');
        return !!token;
    },

    // Get current user
    async getCurrentUser(): Promise<User | null> {
        const userStr = await AsyncStorage.getItem('user');
        if (userStr) {
            return JSON.parse(userStr);
        }
        return null;
    },

    // Get auth token
    async getToken(): Promise<string | null> {
        return await AsyncStorage.getItem('authToken');
    },
};
