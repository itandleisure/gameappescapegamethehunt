import { distanceMeters, t as tx } from '@hunt/engine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDuration } from '../src/core/i18n';
import { mapStyleChoice } from '../src/core/view';
import { onFix, startTracking, stopTracking } from '../src/services/location';
import { removePlayAreas } from '../src/services/map-download';
import { Banner, Body, Button, Title } from '../src/ui/components';
import { useGame } from '../src/ui/GameProvider';
import { LeaveGame } from '../src/ui/LeaveGame';
import GameMap from '../src/ui/map/GameMap';
import { colors, radius, space } from '../src/ui/theme';

/** Binnen deze afstand van het verzamelpunt telt het team als aangekomen. */
const ARRIVED_METERS = 40;
const ARRIVED_KEY = 'hunt.verzamelpunt';

/**
 * Einde van het spel: uitkomst, eindscore en speeltijd. Is er een
 * verzamelpunt, dan gaat het team daar eerst heen; pas daarna kan het
 * zich afmelden.
 */
export default function EndScreen() {
  const { controller, snapshot, t, lang } = useGame();
  const state = snapshot?.state;
  const ended = state?.ended;
  const meeting = snapshot?.game.meetingPoint;
  const teamId = snapshot?.team.id;
  const [arrived, setArrived] = useState<boolean | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);

  // Al eerder aangekomen (app opnieuw geopend)?
  useEffect(() => {
    if (!teamId) return;
    void AsyncStorage.getItem(ARRIVED_KEY)
      .then((v) => setArrived(v === teamId))
      .catch(() => setArrived(false));
  }, [teamId]);

  const markArrived = () => {
    setArrived(true);
    if (teamId) void AsyncStorage.setItem(ARRIVED_KEY, teamId).catch(() => undefined);
  };

  // Op weg naar het verzamelpunt blijft de GPS aan; daarna stopt hij.
  const walking = Boolean(ended && meeting && arrived === false);
  useEffect(() => {
    if (!ended || arrived === null) return;
    if (!walking) {
      void stopTracking();
      // Na afloop heeft de telefoon de kaart van het speelveld niet meer nodig.
      void removePlayAreas();
      return;
    }
    void startTracking(t('appName'), t('backgroundNotice'));
    return onFix((fix) => setPosition({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended, walking, arrived]);

  const distance = meeting && position ? Math.round(distanceMeters(position, meeting)) : null;
  useEffect(() => {
    if (walking && distance !== null && distance <= ARRIVED_METERS) markArrived();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walking, distance]);

  if (!controller || !snapshot || !state) return <Redirect href="/" />;
  if (!ended) return <Redirect href="/play" />;
  const game = snapshot.game;
  const ending = game.endings.find((e) => e.id === ended.ending);
  const tr = (value: Parameters<typeof tx>[0]) => tx(value, lang, game.defaultLanguage);

  const openRoute = () => {
    if (!meeting) return;
    const at = `${meeting.lat},${meeting.lng}`;
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${at}&dirflg=w`
        : `https://www.google.com/maps/dir/?api=1&destination=${at}&travelmode=walking`;
    void Linking.openURL(url);
  };

  const d = 0.0025;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>{t('gameOver')}</Text>
        <Title>{tr(ending?.title)}</Title>
        <Body>{tr(ending?.body)}</Body>

        {meeting && arrived !== true ? (
          <View style={styles.meeting}>
            <Title>{t('goToMeetingPoint')}</Title>
            <Body>{tr(meeting.text)}</Body>
            <View style={styles.map}>
              <GameMap
                styleUrl={mapStyleChoice(game, null).url}
                bounds={[meeting.lng - d, meeting.lat - d, meeting.lng + d, meeting.lat + d]}
                markers={[{ id: 'verzamelpunt', lat: meeting.lat, lng: meeting.lng, label: t('meetingPoint') }]}
                position={position}
              />
            </View>
            {distance !== null ? <Body muted>{t('distanceLeft', { meters: distance })}</Body> : null}
            <Button kind="secondary" label={t('route')} onPress={openRoute} />
            <Button label={t('weAreThere')} onPress={markArrived} />
          </View>
        ) : (
          <>
            {meeting ? (
              <View style={styles.meeting}>
                <Banner tone="success">{t('atMeetingPoint')}</Banner>
                <Body>{tr(meeting.text)}</Body>
              </View>
            ) : null}
            <Text style={styles.label}>{t('finalScore')}</Text>
            <Text style={styles.score}>{state.score}</Text>
            <Text style={styles.label}>{t('time')}</Text>
            <Text style={styles.time}>{formatDuration(ended.at - controller.context!.startedAt)}</Text>
            <LeaveGame showCode={false} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.md, paddingBottom: space.xl },
  kicker: { color: colors.accent, fontWeight: '700', textTransform: 'uppercase', marginBottom: space.sm },
  meeting: { marginTop: space.lg, gap: space.sm },
  map: { height: 280, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  label: { color: colors.textMuted, fontSize: 14, marginTop: space.lg },
  score: { color: colors.text, fontSize: 56, fontWeight: '800' },
  time: { color: colors.text, fontSize: 28, fontWeight: '700' },
});
