/** Webapp: de vraag van de browser zelf (Alert van React Native doet niets in een browser). */
export function confirmAction(title: string, message: string, _yes: string, _no: string, onYes: () => void) {
  if (window.confirm(`${title}\n\n${message}`)) onYes();
}
