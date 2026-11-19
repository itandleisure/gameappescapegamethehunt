import { DEFAULT_MEETING_RADIUS, distanceMeters, t as tx } from '@hunt/engine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mapStyleChoice } from '../src/core/view';
import { onFix, startTracking, stopTracking } from '../src/services/location';
import { removePlayAreas } from '../src/services/map-download';
import { Banner, Body, Button, Title } from '../src/ui/components';
import { useGame } from '../src/ui/GameProvider';
import { LeaveGame } from '../src/ui/LeaveGame';
import GameMap from '../src/ui/map/GameMap';
import { colors, radius, space, contentColumn } from '../src/ui/theme';

/**
 * Een team is er als het binnen de cirkel om het verzamelpunt staat. De GPS
 * zit er in de stad vaak wat naast; tot 20 meter van die onzekerheid telt mee.
 */
const MAX_GPS_SLACK = 20;
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
  const meetingRadius = meeting?.radius ?? DEFAULT_MEETING_RADIUS;
  useEffect(() => {
    if (walking && distance !== null && position && distance <= meetingRadius + Math.min(position.accuracy, MAX_GPS_SLACK)) markArrived();
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
                circles={[{ lat: meeting.lat, lng: meeting.lng, radius: meetingRadius, color: colors.accent }]}
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
            <LeaveGame showCode={false} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.md, paddingBottom: space.xl, ...contentColumn },
  kicker: { color: colors.accent, fontWeight: '700', textTransform: 'uppercase', marginBottom: space.sm },
  meeting: { marginTop: space.lg, gap: space.sm },
  map: { height: 280, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
});
