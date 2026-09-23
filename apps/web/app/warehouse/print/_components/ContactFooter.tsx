import { warehouseContacts, type WarehousePhones } from '@/app/lib/warehouse-contact';

export default function ContactFooter({ phones }: { phones: WarehousePhones }) {
    const contacts = warehouseContacts(phones);
    if (!contacts.length) return null;
    return <footer className="mt-6 flex break-inside-avoid flex-wrap justify-center gap-x-8 gap-y-2 border-t pt-3 text-sm">
        {contacts.map(contact => <div key={contact.label} className="flex items-center gap-2">
            <span className="text-muted-foreground">{contact.label}</span>
            <bdi dir="ltr" className="font-semibold tabular-nums">{contact.number}</bdi>
        </div>)}
    </footer>;
}
