
import { request } from './api';

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
        return request<any>(`/patients?query=${query}`);
    },

    async getPatient(id: string) {
        return request<any>(`/patients/${id}`);
    },

    async createPatient(data: Partial<Patient>) {
        return request<any>('/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    },
};
