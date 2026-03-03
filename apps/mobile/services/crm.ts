
import { getBaseUrl } from './api';

export interface Patient {
    id: string;
    name: string;
    phone: string;
    notes?: string;
    allergies: string[];
    chronicDiseases: string[];
    sales?: any[];
    createdAt: string;
}

export const crmService = {
    async getPatients(query: string = '') {
        const baseUrl = await getBaseUrl();
        const response = await fetch(`${baseUrl}/patients?query=${query}`);
        if (!response.ok) throw new Error('Failed to fetch patients');
        return await response.json();
    },

    async getPatient(id: string) {
        const baseUrl = await getBaseUrl();
        const response = await fetch(`${baseUrl}/patients/${id}`);
        if (!response.ok) throw new Error('Failed to fetch patient');
        return await response.json();
    },

    async createPatient(data: Partial<Patient>) {
        const baseUrl = await getBaseUrl();
        const response = await fetch(`${baseUrl}/patients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to create patient');
        }
        return await response.json();
    },
};
