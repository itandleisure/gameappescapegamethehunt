/** Webapp: de vraag van de browser zelf (Alert van React Native doet niets in een browser). */
export function confirmAction(title: string, message: string, _yes: string, _no: string, onYes: () => void) {
  if (window.confirm(`${title}\n\n${message}`)) onYes();
}

/** Webapp: melding van de browser zelf. */
export function notify(title: string, message: string, _ok: string) {
  window.alert(`${title}\n\n${message}`);
}
