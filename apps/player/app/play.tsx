import { t as tx } from '@hunt/engine';
import { Redirect, router, useSegments } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDuration } from '../src/core/i18n';
import { playAreaBounds, taskMarkers } from '../src/core/play-area';
import { isAnswerable, listGroups, taskToShow } from '../src/core/view';
import { onFix, requestLocationPermission, startTracking, stopTracking, type PermissionResult } from '../src/services/location';
import { downloadPlayArea, mapStyleUrl } from '../src/services/map-download';
import { Banner, Body, Button, Screen, Title } from '../src/ui/components';
import { useGame } from '../src/ui/GameProvider';
import GameMap from '../src/ui/map/GameMap';
import { colors, radius, space } from '../src/ui/theme';

export default function PlayScreen() {
  const { controller, snapshot, t, lang } = useGame();
  const segments = useSegments();
  const [permission, setPermission] = useState<PermissionResult | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [download, setDownload] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [dismissedMessages, setDismissedMessages] = useState(0);
  const lastShown = useRef<string | undefined>(undefined);
  useKeepAwake();

  const state = snapshot?.state ?? null;
  const game = snapshot?.game;
  const started = state !== null;

  // Kaart van het speelveld op de achtergrond downloaden.
  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;
    setDownload(0);
    downloadPlayArea(snapshot.session.id, snapshot.game, (p) => !cancelled && setDownload(p))
      .catch(() => undefined)
      .finally(() => !cancelled && setDownload(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.session.id]);

  // GPS loopt zolang het spel loopt.
  useEffect(() => {
    if (!started || state?.ended) return;
    void startTracking(t('appName'), t('backgroundNotice')).then(setPermission);
    return onFix((fix) => setPosition({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, state?.ended !== undefined]);

  useEffect(() => {
    if (state?.ended) void stopTracking();
  }, [state?.ended]);

  // Een opdracht die opengaat (op locatie, uit een reeks of door de spelleiding) komt vanzelf in beeld.
  const toShow = game && state ? taskToShow(game, state) : undefined;
  const onTaskScreen = segments[0] === 'task';
  useEffect(() => {
    if (!toShow || onTaskScreen || toShow === lastShown.current) return;
    lastShown.current = toShow;
    router.push({ pathname: '/task/[id]', params: { id: toShow } });
  }, [toShow, onTaskScreen]);

  const bounds = useMemo(() => (game ? playAreaBounds(game) : undefined), [game]);

  if (!controller || !snapshot || !game) return <Redirect href="/" />;
  if (state?.ended) return <Redirect href="/end" />;

  if (!started) {
    return (
      <SafeAreaView style={styles.safe}>
        <Screen>
          <Title>{tx(game.name, lang, game.defaultLanguage)}</Title>
          <Body muted>{t('yourTeamCode')}</Body>
          <Text style={styles.teamCode}>{snapshot.team.teamCode}</Text>
          <Body muted>{t('teamCodeExplain')}</Body>
          <View style={styles.spacer} />
          <Body>{t('locationNeeded')}</Body>
          <Body muted>{t('locationAlways')}</Body>
          {permission === 'denied' ? (
            <>
              <Banner tone="danger">{t('locationDenied')}</Banner>
              <Button kind="secondary" label={t('openSettings')} onPress={() => void Linking.openSettings()} />
            </>
          ) : null}
          <View style={styles.spacer} />
          <Body muted>{t('startExplain')}</Body>
          <Button
            label={t('start')}
            busy={starting}
            onPress={async () => {
              setStarting(true);
              try {
                const result = await requestLocationPermission();
                setPermission(result);
                if (result !== 'denied') await controller.start();
              } finally {
                setStarting(false);
              }
            }}
          />
        </Screen>
      </SafeAreaView>
    );
  }

  const ctx = controller.context!;
  const visibleOnMap = Object.entries(state.tasks)
    .filter(([, ts]) => ts.onMap && ts.status === 'visible')
    .map(([id]) => id);
  const markers = taskMarkers(game, ctx.track, visibleOnMap);
  const listCount = listGroups(game, state).flatMap((g) => g.tasks).filter((task) => isAnswerable(game, ctx, state, task.id)).length;
  const latestMessage = state.messages.length > dismissedMessages ? state.messages[state.messages.length - 1] : undefined;
  const overlay = game.mapOverlay;
  const weakGps = position !== null && position.accuracy > game.gps.maxAccuracy;

  return (
    <View style={styles.safe}>
      <GameMap
        styleUrl={mapStyleUrl(game)}
        bounds={bounds}
        position={position}
        markers={markers.map((m) => ({
          id: m.id,
          lat: m.location.lat,
          lng: m.location.lng,
          label: tx(game.tasks.find((x) => x.id === m.id)?.title, lang, game.defaultLanguage),
        }))}
        overlay={
          overlay && /^https?:/.test(overlay.image)
            ? { url: overlay.image, nw: overlay.bounds[0], se: overlay.bounds[1] }
            : undefined
        }
      />

      <SafeAreaView edges={['top']} style={styles.top}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerLabel}>{t('score')}</Text>
            <Text style={styles.headerValue}>{state.score}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerLabel}>{t('time')}</Text>
            <Text style={styles.headerValue}>{formatDuration(snapshot.now - ctx.startedAt)}</Text>
          </View>
        </View>
        {!snapshot.online ? <Banner tone="warning">{t('offline')}</Banner> : null}
        {weakGps ? <Banner tone="warning">{t('gpsWeak')}</Banner> : null}
        {permission === 'denied' ? <Banner tone="danger">{t('locationDenied')}</Banner> : null}
        {download !== null && download < 100 ? <Banner>{t('mapDownloading', { percent: download })}</Banner> : null}
        {toShow ? (
          <Pressable onPress={() => router.push({ pathname: '/task/[id]', params: { id: toShow } })}>
            <Banner tone="warning">{tx(game.tasks.find((x) => x.id === toShow)?.title, lang, game.defaultLanguage)} ›</Banner>
          </Pressable>
        ) : null}
        {latestMessage ? (
          <Pressable onPress={() => setDismissedMessages(state.messages.length)}>
            <Banner tone="success">{tx(latestMessage.text, lang, game.defaultLanguage)}</Banner>
          </Pressable>
        ) : null}
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.bottom}>
        <Button label={listCount > 0 ? `${t('tasks')} (${listCount})` : t('tasks')} onPress={() => router.push('/tasks')} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  spacer: { height: space.lg },
  teamCode: { color: colors.accent, fontSize: 40, fontWeight: '800', letterSpacing: 6, marginVertical: space.sm },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.md },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(16,18,20,0.88)',
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  headerRight: { alignItems: 'flex-end' },
  headerLabel: { color: colors.textMuted, fontSize: 13 },
  headerValue: { color: colors.text, fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: space.md, paddingBottom: space.md },
});
