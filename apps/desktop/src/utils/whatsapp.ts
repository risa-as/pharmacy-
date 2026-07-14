import { showAlert } from "../lib/dialog";

export function formatIraqiPhoneNumber(phone: string): string | null {
    // Remove non-digit characters
    let cleaned = phone.replace(/\D/g, '');

    // Iraqi numbers usually start with 07 or 7
    // If starts with 07, remove 0 and add 964
    if (cleaned.startsWith('07')) {
        return '964' + cleaned.substring(1);
    }

    // If starts with 7 (10 digits total usually), add 964
    if (cleaned.startsWith('7') && cleaned.length === 10) {
        return '964' + cleaned;
    }

    // If already starts with 964, keep it
    if (cleaned.startsWith('964')) {
        return cleaned;
    }

    // If valid length but no prefix, maybe assume 964? 
    // Let's stick to explicit 07 or 7 for now to avoid errors.
    return null;
}

export function generateInvoiceMessage(sale: any, branchName: string = "صيدلية فاراماسي"): string {
    const date = new Date(sale.createdAt).toLocaleDateString('ar-IQ-u-nu-latn');
    const time = new Date(sale.createdAt).toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit' });

    let message = `👋 مرحباً ${sale.patient?.name || 'عزيزنا العميل'}،\n`;
    message += `شكراً لزيارتكم *${branchName}* 🏨\n\n`;

    message += `🧾 *فاتورة رقم #${sale.id.slice(0, 8)}*\n`;
    message += `📅 التاريخ: ${date} ${time}\n`;
    message += `----------------\n`;

    sale.items.forEach((item: any, index: number) => {
        const drugName = item.drug?.tradeName || 'دواء';
        const price = item.price.toLocaleString();
        message += `${index + 1}. ${drugName} (x${item.quantity}) - ${price}\n`;
    });

    message += `----------------\n`;
    message += `💰 *المجموع:* ${sale.total.toLocaleString()} د.ع\n`;

    if (sale.discount > 0) {
        message += `🎁 *الخصم:* ${sale.discount.toLocaleString()} د.ع\n`;
        message += `💵 *الصافي:* ${(sale.total - sale.discount).toLocaleString()} د.ع\n`;
    }

    message += `\nنتمنى لكم الشفاء العاجل! ❤️`;

    return encodeURIComponent(message);
}

export function openWhatsApp(phone: string, message: string) {
    const formattedPhone = formatIraqiPhoneNumber(phone);

    if (!formattedPhone) {
        void showAlert({ variant: "warning", title: "رقم الهاتف غير صحيح", message: "يجب أن يبدأ الرقم بـ 07 (مثال: 07701234567)." });
        return;
    }

    // Check if we are in Electron renderer
    if (window.ipcRenderer) {
        window.ipcRenderer.invoke('open-external-url', `https://wa.me/${formattedPhone}?text=${message}`)
            .catch(err => {
                void showAlert({ variant: "error", title: "فشل فتح واتساب", message: err.message });
                console.error("IPC call failed:", err);
            });
    } else {
        window.open(`https://wa.me/${formattedPhone}?text=${message}`, '_blank');
    }
}
