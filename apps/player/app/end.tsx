import { boundaryPath, DEFAULT_BOUNDARY_COLOR, DEFAULT_MEETING_RADIUS, outsideShade, t as tx } from '@hunt/engine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { distanceText, MeetingArrival, metersTo } from '../src/core/meeting';
import { mapStyleChoice } from '../src/core/view';
import { onFix, startTracking, stopTracking } from '../src/services/location';
import { removePlayAreas } from '../src/services/map-download';
import { Banner, Body, Button, Title } from '../src/ui/components';
import { EndCard } from '../src/ui/EndCard';
import { useGame } from '../src/ui/GameProvider';
import { LeaveGame } from '../src/ui/LeaveGame';
import GameMap from '../src/ui/map/GameMap';
import { colors, radius, space, contentColumn } from '../src/ui/theme';

const ARRIVED_KEY = 'hunt.verzamelpunt';

/**
 * Einde van het spel: uitkomst, eindscore en speeltijd. Is er een
 * verzamelpunt, dan loopt het team daar eerst heen met de kaart in de app
 * (eigen positie, stippellijn en afstand). Het spel is pas klaar als de GPS
 * het team in de cirkel ziet, met dezelfde regels als bij een opdracht op
 * locatie (ook de ruimere marge bij zwak signaal). De knop "Wij zijn er"
 * verschijnt alleen als de GPS het niet doet, en in een testsessie.
 */
export default function EndScreen() {
  const { controller, snapshot, t, lang } = useGame();
  const state = snapshot?.state;
  const ended = state?.ended;
  const meeting = snapshot?.game.meetingPoint;
  const teamId = snapshot?.team.id;
  const [arrived, setArrived] = useState<boolean | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsFailing, setGpsFailing] = useState(false);
  const arrival = useRef<MeetingArrival | null>(null);
  const meetingRadius = meeting?.radius ?? DEFAULT_MEETING_RADIUS;
  const maxAccuracy = snapshot?.game.gps.maxAccuracy ?? 30;

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
    const gate = new MeetingArrival({ lat: meeting!.lat, lng: meeting!.lng, radius: meetingRadius }, maxAccuracy, Date.now());
    arrival.current = gate;
    const timer = setInterval(() => setGpsFailing(gate.gpsFailing(Date.now())), 1_000);
    const off = onFix((fix) => {
      setPosition({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy });
      if (gate.feed(fix)) markArrived();
      setGpsFailing(gate.gpsFailing(Date.now()));
    });
    return () => {
      clearInterval(timer);
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended, walking, arrived]);

  // Afstand, stand en records voor de eindkaart; elke minuut opnieuw, zodat de plaats bijwerkt als andere teams klaar zijn.
  useEffect(() => {
    if (!ended || !controller) return;
    void controller.loadSummary();
    const timer = setInterval(() => void controller.loadSummary(), 60_000);
    return () => clearInterval(timer);
  }, [ended !== undefined, controller]);

  const distance = meeting && position ? metersTo(position, meeting) : null;

  if (!controller || !snapshot || !state) return <Redirect href="/" />;
  if (!ended) return <Redirect href="/play" />;
  const game = snapshot.game;
  const ending = game.endings.find((e) => e.id === ended.ending);
  const tr = (value: Parameters<typeof tx>[0]) => tx(value, lang, game.defaultLanguage);

  const testMode = snapshot.session.testMode;
  const stats = controller.endStats();
  const far = distanceText(distance ?? 0, lang);

  const d = 0.0025;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>{t('gameOver')}</Text>
        {stats ? <EndCard stats={stats} game={game} teamName={snapshot.team.name} lang={lang} t={t} /> : null}
        <Title>{tr(ending?.title)}</Title>
        <Body>{tr(ending?.body)}</Body>

        {meeting && arrived !== true ? (
          <View style={styles.meeting}>
            <Title>{t('goToMeetingPoint')}</Title>
            <Body>{t('meetingWalkHint')}</Body>
            <View style={styles.map}>
              <GameMap
                styleUrl={mapStyleChoice(game, null).url}
                bounds={[meeting.lng - d, meeting.lat - d, meeting.lng + d, meeting.lat + d]}
                markers={[{ id: 'verzamelpunt', lat: meeting.lat, lng: meeting.lng, label: t('meetingPoint') }]}
                circles={[{ lat: meeting.lat, lng: meeting.lng, radius: meetingRadius, color: colors.accent }]}
                position={position}
                follow={position ? [position, meeting] : undefined}
                line={position ? { from: position, to: meeting, color: colors.accent } : undefined}
                boundary={
                  game.boundary
                    ? {
                        points: boundaryPath(game.boundary),
                        color: game.boundary.color ?? DEFAULT_BOUNDARY_COLOR,
                        outside: outsideShade(game.boundary),
                      }
                    : undefined
                }
              />
            </View>
            {distance !== null ? <Text style={styles.distance}>{t(far.key, far.vars)}</Text> : null}
            {gpsFailing ? (
              <>
                <Body muted>{t('meetingGpsHelp')}</Body>
                <Button kind="secondary" label={t('weAreThere')} onPress={markArrived} />
              </>
            ) : testMode ? (
              <Button kind="secondary" label={`📍 ${t('weAreThere')}`} onPress={markArrived} />
            ) : null}
          </View>
        ) : (
          <>
            {meeting ? (
              <View style={styles.meeting}>
                <Banner tone="success">{`${t('atMeetingPoint')} ${t('meetingThanks')}`}</Banner>
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
  distance: { color: colors.text, fontSize: 22, fontWeight: '700' },
  map: { height: 340, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
});
