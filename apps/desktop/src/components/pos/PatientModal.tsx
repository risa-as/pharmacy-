import { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import { ipcInvoke } from "./pos-utils";
import type { Patient } from "./pos-types";
import { showAlert } from "../../lib/dialog";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    branchId: string;
    onSelectPatient: (patient: Patient) => void;
}

export default function PatientModal({ isOpen, onClose, branchId, onSelectPatient }: Props) {
    const [patientQuery, setPatientQuery] = useState("");
    const [patientResults, setPatientResults] = useState<any[]>([]);
    const [newPatient, setNewPatient] = useState({ name: "", phone: "", gender: "male" });

    useEffect(() => {
        if (!isOpen) return;
        if (patientQuery.length <= 1) {
            ipcInvoke('get-patients', { branchId }).then(setPatientResults).catch(() => {});
        } else {
            const t = setTimeout(() => {
                ipcInvoke('search-patients', patientQuery, branchId).then(setPatientResults).catch(() => {});
            }, 300);
            return () => clearTimeout(t);
        }
    }, [patientQuery, isOpen, branchId]);

    const handleClose = () => {
        setPatientQuery("");
        setPatientResults([]);
        setNewPatient({ name: "", phone: "", gender: "male" });
        onClose();
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!window.ipcRenderer) return;
        const res = await ipcInvoke('create-patient', { ...newPatient, branchId });
        if (res.success) {
            onSelectPatient(res.patient);
            handleClose();
        } else {
            void showAlert({ variant: "error", title: "فشل حفظ المريض", message: res.error });
        }
    };

    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fadeIn">
            <div className="bg-card rounded-2xl shadow-2xl max-w-lg w-full p-6 mx-4 animate-slideUp">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <span>👤</span> ملف المريض
                    </h3>
                    <button onClick={handleClose} className="bg-muted p-2 rounded-full hover:bg-muted/80 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-foreground mb-2">بحث عن مريض مسجل</label>
                    <div className="relative">
                        <Search className="absolute right-3 top-3 w-5 h-5 text-muted-foreground" />
                        <input
                            autoFocus
                            type="text"
                            placeholder="ابحث بالاسم أو الهاتف..."
                            className="w-full pr-10 pl-4 py-3 rounded-xl border border-border focus:ring-2 focus:ring-ring outline-none transition-all"
                            value={patientQuery}
                            onChange={(e) => setPatientQuery(e.target.value)}
                        />
                    </div>
                    {patientResults.length > 0 ? (
                        <div className="mt-2 bg-card border border-border shadow-lg rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                            {patientResults.map((p: any) => (
                                <button
                                    key={p.id}
                                    onClick={() => { onSelectPatient(p); handleClose(); }}
                                    className="w-full text-right px-4 py-3 hover:bg-primary/10 flex justify-between items-center border-b last:border-0 transition-colors"
                                >
                                    <span className="font-bold">{p.name}</span>
                                    <span className="text-sm text-muted-foreground">{p.phone}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        patientQuery.length > 1 && (
                            <div className="mt-2 p-3 text-center text-muted-foreground bg-muted/50 rounded-xl text-sm">
                                لا توجد نتائج مطابقة، يمكنك إضافة مريض جديد بالأسفل
                            </div>
                        )
                    )}
                </div>

                <div className="flex items-center gap-4 mb-4">
                    <div className="h-px bg-border flex-1"></div>
                    <span className="text-muted-foreground text-sm">أو إضافة مريض جديد</span>
                    <div className="h-px bg-border flex-1"></div>
                </div>

                <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">الاسم الكامل</label>
                        <input
                            required type="text"
                            className="w-full px-4 py-2 rounded-xl border border-border focus:ring-2 focus:ring-ring outline-none transition-all"
                            value={newPatient.name}
                            onChange={e => setNewPatient({ ...newPatient, name: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">رقم الهاتف</label>
                            <input
                                required type="tel"
                                className="w-full px-4 py-2 rounded-xl border border-border focus:ring-2 focus:ring-ring outline-none transition-all"
                                value={newPatient.phone}
                                onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">الجنس</label>
                            <select
                                className="w-full px-4 py-2 rounded-xl border border-border focus:ring-2 focus:ring-ring outline-none bg-background transition-all"
                                value={newPatient.gender}
                                onChange={e => setNewPatient({ ...newPatient, gender: e.target.value })}
                            >
                                <option value="male">ذكر</option>
                                <option value="female">أنثى</option>
                            </select>
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]">
                        حفظ واختيار المريض
                    </button>
                </form>
            </div>
        </div>
    );
}
