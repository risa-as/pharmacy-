import { describe, expect, it } from 'vitest';
import type { TextStyle } from 'react-native';
import { CAIRO_FAMILIES, cairoFaceStyle } from './cairo-font';

describe('Cairo typography', () => {
    it.each(Object.entries(CAIRO_FAMILIES))('uses the bundled %s face without synthetic bold', (weight, family) => {
        expect(cairoFaceStyle({ fontWeight: Number(weight) as TextStyle['fontWeight'] })).toEqual({ fontFamily: family, fontWeight: 'normal' });
    });
    it('uses regular text by default', () => {
        expect(cairoFaceStyle().fontFamily).toBe('Cairo_400Regular');
    });
    it('inherits the parent weight for nested text', () => {
        expect(cairoFaceStyle({}, '800').fontFamily).toBe('Cairo_800ExtraBold');
    });
    it('allows a nested span to select its own weight', () => {
        expect(cairoFaceStyle({ fontWeight: '500' }, '800').fontFamily).toBe('Cairo_500Medium');
    });
    it('preserves intentional monospace or icon families', () => {
        expect(cairoFaceStyle({ fontFamily: 'monospace', fontWeight: '700' })).toEqual({});
        expect(cairoFaceStyle({ fontFamily: 'Ionicons' })).toEqual({});
    });
    it('handles bold, normal and the lightest supported weight', () => {
        expect(cairoFaceStyle({ fontWeight: 'bold' }).fontFamily).toBe('Cairo_700Bold');
        expect(cairoFaceStyle({ fontWeight: 'normal' }).fontFamily).toBe('Cairo_400Regular');
        expect(cairoFaceStyle({ fontWeight: '100' }).fontFamily).toBe('Cairo_200ExtraLight');
    });
    it('respects an explicitly selected Cairo face', () => {
        expect(cairoFaceStyle({ fontFamily: 'Cairo_900Black' }).fontFamily).toBe('Cairo_900Black');
        expect(cairoFaceStyle({ fontFamily: 'Cairo_400Regular', fontWeight: '700' }).fontFamily).toBe('Cairo_700Bold');
    });
});
