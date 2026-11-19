import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GpsStatus } from '../core/gps-status';
import { shortDuration, webMsg } from '../core/web-i18n';
import { dismissAwayNotice, onGpsStatus } from '../services/gps-monitor';
import { useScreenOn } from '../services/screen-on';
import { Banner, Button } from './components';
import { colors, radius, space } from './theme';

/**
 * Webapp: uitleg vóór de start (scherm aan houden, batterij, op het
 * beginscherm zetten) en meldingen tijdens het spel (GPS weg, even uit beeld
 * geweest, scherm kan niet aan blijven).
 */

type InstallPrompt = Event & { prompt: () => Promise<void> };
type InstallWindow = Window & { __huntInstall?: InstallPrompt | null };

function standalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function iosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function useInstallPrompt(): InstallPrompt | null {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(() => (window as InstallWindow).__huntInstall ?? null);
  useEffect(() => {
    const onPrompt = () => setPrompt((window as InstallWindow).__huntInstall ?? null);
    window.addEventListener('hunt-install', onPrompt);
    return () => window.removeEventListener('hunt-install', onPrompt);
  }, []);
  return prompt;
}

export function WebStartInfo({ lang }: { lang: string }) {
  const install = useInstallPrompt();
  const [installed, setInstalled] = useState(standalone);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>📱 {webMsg(lang, 'webKeepOnTitle')}</Text>
      <Text style={styles.body}>{webMsg(lang, 'webKeepOnBody')}</Text>
      <Text style={styles.muted}>🔋 {webMsg(lang, 'webBattery')}</Text>
      {!installed && install ? (
        <Button
          kind="secondary"
          label={webMsg(lang, 'webInstall')}
          onPress={() => {
            void install
              .prompt()
              .then(() => setInstalled(true))
              .catch(() => undefined);
            (window as InstallWindow).__huntInstall = null;
          }}
        />
      ) : null}
      {!installed && !install && iosSafari() ? <Text style={styles.muted}>{webMsg(lang, 'webInstallIos')}</Text> : null}
    </View>
  );
}

export function WebPlayBanners({ lang }: { lang: string }) {
  // Ook hier, zodat het scherm aan blijft op elk scherm met deze meldingen (ook bij de spelleider).
  const screenOn = useScreenOn();
  const [gps, setGps] = useState<GpsStatus | null>(null);
  useEffect(() => onGpsStatus(setGps), []);
  return (
    <>
      {gps && gps.awayMs > 0 ? (
        <Pressable accessibilityRole="button" onPress={dismissAwayNotice}>
          <Banner tone="warning">{webMsg(lang, 'webAway', { time: shortDuration(gps.awayMs) })}</Banner>
        </Pressable>
      ) : null}
      {gps?.state === 'lost' ? <Banner tone="danger">📡 {webMsg(lang, 'webGpsLost')}</Banner> : null}
      {gps?.state === 'denied' ? <Banner tone="danger">{webMsg(lang, 'webGpsDenied')}</Banner> : null}
      {screenOn === 'unsupported' ? <Banner>{webMsg(lang, 'webScreenUnsupported')}</Banner> : null}
    </>
  );
}

export function webLocationHelp(lang: string): string | null {
  return webMsg(lang, 'webGpsDenied');
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.sm,
    marginTop: space.md,
  },
  title: { color: colors.accent, fontWeight: '800', fontSize: 17 },
  body: { color: colors.text, fontSize: 16, lineHeight: 22 },
  muted: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
});
