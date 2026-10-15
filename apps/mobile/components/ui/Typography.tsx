import React, { createContext, forwardRef, useContext } from 'react';
import {
    Animated,
    StyleSheet,
    Text as NativeText,
    TextInput as NativeTextInput,
    type TextProps,
    type TextInputProps,
    type TextStyle,
} from 'react-native';
import { cairoFaceStyle } from '../../utils/cairo-font';
import { styled } from 'nativewind';

const FontsReady = createContext(false);
const InheritedWeight = createContext<TextStyle['fontWeight']>('400');

export function TypographyProvider({ ready, children }: { ready: boolean; children: React.ReactNode }) {
    return <FontsReady.Provider value={ready}>{children}</FontsReady.Provider>;
}

export type Text = NativeText;
const CairoText = forwardRef<NativeText, TextProps>(function CairoText({ style, ...props }, ref) {
    const ready = useContext(FontsReady);
    const inheritedWeight = useContext(InheritedWeight);
    const flattened = StyleSheet.flatten(style) ?? {};
    const weight = flattened.fontWeight ?? inheritedWeight;
    return (
        <InheritedWeight.Provider value={weight}>
            <NativeText
                {...props}
                ref={ref}
                style={[{ includeFontPadding: false }, style, ready ? cairoFaceStyle(flattened, inheritedWeight) : undefined]}
            />
        </InheritedWeight.Provider>
    );
});
export const Text = styled(CairoText);

export type TextInput = NativeTextInput;
const CairoTextInput = forwardRef<NativeTextInput, TextInputProps>(function CairoTextInput({ style, ...props }, ref) {
    const ready = useContext(FontsReady);
    const inheritedWeight = useContext(InheritedWeight);
    const flattened = StyleSheet.flatten(style) ?? {};
    return (
        <NativeTextInput
            {...props}
            ref={ref}
            style={[{ includeFontPadding: false }, style, ready ? cairoFaceStyle(flattened, inheritedWeight) : undefined]}
        />
    );
});
export const TextInput = styled(CairoTextInput);

export const AnimatedText = Animated.createAnimatedComponent(Text);
