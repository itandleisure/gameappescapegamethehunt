/** Browser en toestel voor het logboek: systeem, browser, scherm, verbinding. */
export function deviceInfo(): Record<string, unknown> {
  if (typeof navigator === 'undefined') return { platform: 'web' };
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : 'onbekend';
  const osVersion =
    /OS (\d+[_.]\d+(?:[_.]\d+)?) like Mac/.exec(ua)?.[1]?.replace(/_/g, '.') ?? /Android (\d+(?:\.\d+)?)/.exec(ua)?.[1] ?? null;
  const browser = detectBrowser(ua);
  const model = /Android [^;]*; ([^;)]+)[;)]/.exec(ua)?.[1]?.trim();
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
  const standalone =
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    platform: 'web',
    os,
    osVersion,
    browser,
    ...(model && model !== 'K' ? { model } : {}),
    scherm: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}@${window.devicePixelRatio ?? 1}` : null,
    beginscherm: Boolean(standalone),
    online: navigator.onLine,
    ...(connection?.effectiveType ? { verbinding: connection.effectiveType } : {}),
    taal: navigator.language,
    userAgent: ua.slice(0, 300),
  };
}

const BROWSERS: [RegExp, string][] = [
  [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
  [/CriOS\/([\d.]+)/, 'Chrome (iOS)'],
  [/FxiOS\/([\d.]+)/, 'Firefox (iOS)'],
  [/Firefox\/([\d.]+)/, 'Firefox'],
  [/EdgA?\/([\d.]+)/, 'Edge'],
  [/Chrome\/([\d.]+)/, 'Chrome'],
  [/Version\/([\d.]+).*Safari/, 'Safari'],
];

function detectBrowser(ua: string): string {
  for (const [rx, name] of BROWSERS) {
    const m = rx.exec(ua);
    if (m) return `${name} ${m[1]}`;
  }
  return 'onbekend';
}
