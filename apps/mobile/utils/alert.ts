import { Alert } from 'react-native';

export interface AlertButton {
    text: string;
    style?: 'default' | 'cancel' | 'destructive';
    onPress?: () => void;
}

type ShowAlertFn = (title: string, message?: string, buttons?: AlertButton[]) => void;

let _handler: ShowAlertFn | null = null;

export function registerAlertHandler(fn: ShowAlertFn) {
    _handler = fn;
}

export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
    if (_handler) {
        _handler(title, message, buttons);
    } else {
        Alert.alert(title, message, buttons);
    }
}
