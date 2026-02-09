import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// عنوان الخادم
// Android Emulator uses 10.0.2.2 for localhost
// iOS Simulator uses localhost
// Real device needs your machine IP (e.g. 192.168.1.X)
// For now, let's use a function to determine based on platform/env
const getBaseUrl = () => {
    if (process.env.EXPO_PUBLIC_API_URL) {
        return process.env.EXPO_PUBLIC_API_URL;
    }
    // Default fallback
    if (Platform.OS === 'android') {
        return 'http://185.147.102.108/api';
    }
    return 'http://localhost:3000/api';
};

const API_BASE_URL = getBaseUrl();

// Create axios instance
const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
    const token = await AsyncStorage.getItem('authToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// API Service methods
export const apiService = {
    // Dashboard Stats
    async getStats() {
        try {
            const response = await api.get('/stats');
            return response.data;
        } catch (error) {
            console.error('API Error getStats:', error);
            // Return mock data for development
            return {
                sales: 12,
                inventory: 156,
                lowStock: 8,
                expiring: 3,
            };
        }
    },

    // Inventory
    async getInventory() {
        try {
            const response = await api.get('/inventory');
            return response.data;
        } catch (error) {
            console.error('API Error getInventory:', error);
            // Return mock data for development
            return [
                { id: '1', drugName: 'باراسيتامول 500mg', quantity: 150, price: 2.50, reorderLevel: 20 },
                { id: '2', drugName: 'أموكسيسيلين 250mg', quantity: 75, price: 8.00, reorderLevel: 30 },
                { id: '3', drugName: 'إيبوبروفين 400mg', quantity: 10, price: 5.00, reorderLevel: 25 },
                { id: '4', drugName: 'أوميبرازول 20mg', quantity: 0, price: 12.00, reorderLevel: 15 },
                { id: '5', drugName: 'ميتفورمين 500mg', quantity: 200, price: 6.50, reorderLevel: 40 },
            ];
        }
    },

    // Get drug by barcode
    async getDrugByBarcode(barcode: string) {
        try {
            const response = await api.get(`/drugs/barcode/${barcode}`);
            return response.data;
        } catch (error) {
            console.error('API Error getDrugByBarcode:', error);
            throw error;
        }
    },

    // Create sale
    async createSale(items: any[], totalAmount: number) {
        try {
            const response = await api.post('/sales', { items, totalAmount });
            return response.data;
        } catch (error) {
            console.error('API Error createSale:', error);
            throw error;
        }
    },

    // Get sales
    async getSales() {
        try {
            const response = await api.get('/sales');
            return response.data;
        } catch (error) {
            console.error('API Error getSales:', error);
            return [];
        }
    },

    // Get alerts
    async getAlerts() {
        try {
            const response = await api.get('/alerts');
            return response.data;
        } catch (error) {
            console.error('API Error getAlerts:', error);
            return [];
        }
    },
};
