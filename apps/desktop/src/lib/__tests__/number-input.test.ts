import { describe, expect, it } from 'vitest';
import { rawAmount, groupAmount, caretAfterFormat } from '../number-input';

describe('amount typing with thousands separators', () => {
    it('shows separators and keeps the raw value plain', () => {
        expect(groupAmount('1596050')).toBe('1,596,050');
        expect(groupAmount('999')).toBe('999');
        expect(groupAmount('1000')).toBe('1,000');
        expect(groupAmount('1596050.5')).toBe('1,596,050.5');
        expect(groupAmount('')).toBe('');
        expect(rawAmount('1,596,050')).toBe('1596050');
    });
    it('accepts Arabic digits and drops anything else', () => {
        expect(rawAmount('١٬٥٩٦٬٠٥٠')).toBe('1596050');
        expect(rawAmount('۱۲۳')).toBe('123');
        expect(rawAmount('12a3 x')).toBe('123');
        expect(rawAmount('1.2.3')).toBe('1.23');
        expect(rawAmount('-500')).toBe('500');
    });
    it('keeps the caret after the same digit when commas appear or disappear', () => {
        // Typing "5" at the end of "1,596,05" → "1,596,055"... caret stays at the end.
        expect(caretAfterFormat('1,596,055', 9, '1,596,055')).toBe(9);
        // "0" typed into "159,605" after its 4th digit
        expect(caretAfterFormat('159,6005', 5, '1,596,005')).toBe(5); // after the 4th digit: "1,596|,005"
        // Deleting a digit in the middle keeps the caret after the digit before it.
        expect(caretAfterFormat('1,56,050', 3, '156,050')).toBe(2);
        expect(caretAfterFormat('', 0, '')).toBe(0);
    });
});
