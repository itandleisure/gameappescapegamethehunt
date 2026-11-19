import { Alert } from 'react-native';

/** Vraag met Ja/Nee; `onYes` alleen bij Ja. */
export function confirmAction(title: string, message: string, yes: string, no: string, onYes: () => void) {
  Alert.alert(title, message, [
    { text: no, style: 'cancel' },
    { text: yes, style: 'destructive', onPress: onYes },
  ]);
}

/** Melding met één knop. */
export function notify(title: string, message: string, ok: string) {
  Alert.alert(title, message, [{ text: ok }]);
}
