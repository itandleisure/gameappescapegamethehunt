import { boundaryPath, DEFAULT_BOUNDARY_COLOR, outsideShade } from '@hunt/engine';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  HUNTER_COLOR,
  HUNTER_RING,
  LeaderError,
  STALE_MS,
  TEAM_COLORS,
  lastPositions,
  mergePositions,
  standings,
  type LeaderData,
  type LeaderChannel,
  type LeaderMessage,
  type LeaderTeam,
} from '../src/core/leader';
import { leaderMsg, type LeaderKey } from '../src/core/leader-i18n';
import { playAreaBounds } from '../src/core/play-area';
import { mapStyleChoice } from '../src/core/view';
import { leaderApi, leaveLeader, useLeader } from '../src/services/leader';
import { onFix, requestLocationPermission, startTracking, stopTracking, type PermissionResult } from '../src/services/location';
import { Banner, Body, Button } from '../src/ui/components';
import { useGame } from '../src/ui/GameProvider';
import { WebPlayBanners } from '../src/ui/WebNotices';
import GameMap, { type MapMarker } from '../src/ui/map/GameMap';
import { colors, contentColumn, radius, space } from '../src/ui/theme';

/** Zo vaak haalt de app teams, posities en spelleiders op. */
const REFRESH_MS = 10_000;
/** Zo vaak de chat, zolang die openstaat. */
const CHAT_REFRESH_MS = 5_000;
const CHAT_MAX_LENGTH = 500;

type Tab = 'map' | 'teams' | 'chat' | 'hunters';
const TAB_LABEL: Record<Tab, LeaderKey> = { map: 'leaderMap', teams: 'leaderTeams', chat: 'leaderChat', hunters: 'leaderHunterChat' };

function ago(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const min = Math.floor(Math.max(0, now - Date.parse(iso)) / 60_000);
  return min < 1 ? '<1 min' : `${min} min`;
}

/**
 * Spelleider-modus: geen spel, maar de teams en de andere spelleiders op de
 * kaart, de ranglijst met bellen en "gepakt", de teamchat als The Hunters en
 * een onderlinge chat van de hunters (met eigen naam, teams zien die niet).
 * De positie van de spelleider gaat mee, ook met het scherm uit.
 */
export default function LeaderScreen() {
  const { lang } = useGame();
  const { loading, leader } = useLeader();
  const t = useCallback((key: LeaderKey, vars?: Record<string, string | number>) => leaderMsg(lang, key, vars), [lang]);
  const [tab, setTab] = useState<Tab>('map');
  const [data, setData] = useState<LeaderData | null>(null);
  const [error, setError] = useState<LeaderKey | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [permission, setPermission] = useState<PermissionResult | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const latest = useRef<LeaderData | null>(null);
  latest.current = data;
  const sessionId = leader?.sessionId;

  const load = useCallback(async () => {
    if (!sessionId) return;
    const cur = latest.current;
    const after = cur ? cur.positions.reduce((m, p) => Math.max(m, p.id), 0) : 0;
    try {
      const next = await leaderApi.load(sessionId, after);
      setData((prev) => ({ ...next, positions: prev && after ? mergePositions(prev.positions, next.positions) : next.positions }));
      setError(null);
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof LeaderError ? e.key : 'errorGeneric');
    }
  }, [sessionId]);

  // Bijwerken zolang de app open is.
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void load();
    }, REFRESH_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [load]);

  // Positie delen, ook op de achtergrond als dat mag.
  useEffect(() => {
    if (!sessionId) return;
    void requestLocationPermission()
      .then(async (result) => {
        setPermission(result);
        if (result !== 'denied') await startTracking(t('leaderHunters'), t('leaderNotice'));
      })
      .catch(() => setPermission('denied'));
    return onFix((fix) => setPosition({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (loading) return null;
  if (!leader) return <Redirect href="/" />;

  const logout = () => {
    const go = async () => {
      await stopTracking().catch(() => undefined);
      await leaveLeader();
      router.replace('/');
    };
    if (Platform.OS === 'web') {
      void go();
      return;
    }
    Alert.alert(t('leaderLogout'), t('leaderLogoutConfirm'), [
      { text: t('leaderCancel'), style: 'cancel' },
      { text: t('leaderLogout'), style: 'destructive', onPress: () => void go() },
    ]);
  };
  const signInAgain = async () => {
    await stopTracking().catch(() => undefined);
    await leaveLeader();
    router.replace('/leader-login');
  };

  return (
    <View style={styles.safe}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {data?.session.name ?? leader.sessionName}
            </Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {t('leaderHunters')} · {leader.name}
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={logout} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>{t('leaderLogout')}</Text>
          </Pressable>
        </View>
        {error === 'leaderSignedOut' ? (
          <View style={styles.banner}>
            <Banner tone="danger">{t('leaderSignedOut')}</Banner>
            <Button label={t('leaderLogin')} onPress={() => void signInAgain()} />
          </View>
        ) : error ? (
          <View style={styles.banner}>
            <Banner tone="danger">{t(error)}</Banner>
          </View>
        ) : null}
        {Platform.OS === 'web' ? (
          // Webapp: scherm aan houden, GPS weg of geweigerd (een browser kent geen "Altijd toestaan").
          <View style={styles.banner}>
            <WebPlayBanners lang={lang} />
          </View>
        ) : permission === 'denied' || permission === 'foreground' ? (
          <View style={styles.banner}>
            <Banner tone={permission === 'denied' ? 'danger' : undefined}>
              {t(permission === 'denied' ? 'leaderLocationDenied' : 'leaderLocationForeground')}
            </Banner>
            <Button kind="secondary" label={t('leaderOpenSettings')} onPress={() => void Linking.openSettings()} />
          </View>
        ) : null}
      </SafeAreaView>

      <View style={styles.flex}>
        {tab === 'map' ? <LeaderMap data={data} position={position} now={now} /> : null}
        {tab === 'teams' ? <LeaderTeams data={data} now={now} t={t} onChange={load} /> : null}
        {tab === 'chat' && data ? <LeaderChat key="teams" channel="teams" sessionId={leader.sessionId} data={data} t={t} lang={lang} /> : null}
        {tab === 'hunters' && data ? <LeaderChat key="hunters" channel="hunters" sessionId={leader.sessionId} data={data} t={t} lang={lang} /> : null}
      </View>

      <SafeAreaView edges={['bottom']} style={styles.tabs}>
        {(['map', 'teams', 'chat', 'hunters'] as const).map((id) => (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
            onPress={() => setTab(id)}
            style={[styles.tab, tab === id && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === id && styles.tabTextActive]}>
              {t(TAB_LABEL[id])}
            </Text>
          </Pressable>
        ))}
      </SafeAreaView>
    </View>
  );
}

function teamColors(teams: LeaderTeam[]): Map<string, string> {
  return new Map(teams.map((tm, i) => [tm.id, TEAM_COLORS[i % TEAM_COLORS.length]!]));
}

function LeaderMap({
  data,
  position,
  now,
}: {
  data: LeaderData | null;
  position: { lat: number; lng: number; accuracy: number } | null;
  now: number;
}) {
  const game = data?.game ?? null;
  const bounds = useMemo(() => (game ? playAreaBounds(game) : undefined), [game]);
  if (!data || !game) return <View style={styles.flex} />;
  const style = mapStyleChoice(game, null);
  const colorOf = teamColors(data.teams);
  const last = lastPositions(data.positions, game.gps?.maxAccuracy ?? 50);
  const markers: MapMarker[] = [];
  for (const tm of data.teams) {
    const p = last.get(tm.id);
    if (!p) continue;
    markers.push({
      id: `team-${tm.id}`,
      lat: p.lat,
      lng: p.lng,
      label: tm.name,
      person: { color: colorOf.get(tm.id) ?? '#555555', stale: now - Date.parse(p.recorded_at) > STALE_MS },
    });
  }
  // De andere spelleiders; jezelf toont de kaart als blauwe stip.
  for (const h of data.leaders) {
    if (h.me || h.lat === null || h.lng === null || !h.located_at) continue;
    markers.push({
      id: `hunter-${h.id}`,
      lat: h.lat,
      lng: h.lng,
      label: h.name,
      person: { color: HUNTER_COLOR, ring: HUNTER_RING, stale: now - Date.parse(h.located_at) > STALE_MS },
    });
  }
  return (
    <GameMap
      styleUrl={style.url}
      bounds={bounds}
      position={position}
      markers={markers}
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
  );
}

function LeaderTeams({
  data,
  now,
  t,
  onChange,
}: {
  data: LeaderData | null;
  now: number;
  t: (key: LeaderKey, vars?: Record<string, string | number>) => string;
  onChange: () => Promise<void>;
}) {
  const [pending, setPending] = useState<Record<string, number>>({});
  const [error, setError] = useState<LeaderKey | null>(null);
  if (!data) return <View style={styles.flex} />;
  const colorOf = teamColors(data.teams);
  const last = lastPositions(data.positions, data.game?.gps?.maxAccuracy ?? 50);

  const bump = async (team: LeaderTeam, delta: 1 | -1) => {
    const value = pending[team.id] ?? team.caught;
    if (value + delta < 0) return;
    setPending((p) => ({ ...p, [team.id]: value + delta }));
    setError(null);
    try {
      const next = await leaderApi.bumpCaught(data.session.id, team.id, delta);
      setPending((p) => ({ ...p, [team.id]: next }));
      await onChange();
    } catch (e) {
      setError(e instanceof LeaderError ? e.key : 'errorGeneric');
      setPending((p) => {
        const { [team.id]: _, ...rest } = p;
        return rest;
      });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {error ? <Banner tone="danger">{t(error)}</Banner> : null}
      {data.teams.length === 0 ? <Body muted>{t('leaderNoTeams')}</Body> : null}
      {standings(data.teams).map((tm, i) => {
        const p = last.get(tm.id);
        const status = tm.ended_at ? t('leaderFinished') : tm.started_at ? t('leaderPlaying') : t('leaderWaiting');
        const caught = pending[tm.id] ?? tm.caught;
        return (
          <View key={tm.id} style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.rank}>{i + 1}</Text>
              <View style={[styles.dot, { backgroundColor: colorOf.get(tm.id) }]} />
              <View style={styles.flex}>
                <Text style={styles.teamName} numberOfLines={1}>
                  {tm.name}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {t('leaderPoints', { n: tm.score })} · {status} · {ago(p?.recorded_at ?? null, now) ?? t('leaderNoLocation')}
                </Text>
              </View>
            </View>
            <View style={styles.cardRow}>
              {tm.phone ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.call}
                  onPress={() => void Linking.openURL(`tel:${tm.phone!.replace(/[^\d+]/g, '')}`)}
                >
                  <Text style={styles.callText}>
                    {t('leaderCall')} {tm.phone}
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.flex} />
              )}
              <Text style={styles.muted}>{t('leaderCaught')}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="−1" style={styles.step} onPress={() => void bump(tm, -1)}>
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Text style={styles.caught}>{caught}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="+1" style={styles.step} onPress={() => void bump(tm, 1)}>
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {data.leaders.length ? <Text style={styles.section}>{t('leaderHunters')}</Text> : null}
      {data.leaders.map((h) => (
        <View key={h.id} style={[styles.card, styles.cardRow]}>
          <View style={[styles.dot, { backgroundColor: HUNTER_COLOR, borderColor: HUNTER_RING }]} />
          <Text style={[styles.teamName, styles.flex]} numberOfLines={1}>
            {h.name}
            {h.me ? ` (${t('leaderYou')})` : ''}
          </Text>
          <Text style={styles.muted}>{ago(h.located_at, now) ?? t('leaderNoLocation')}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function LeaderChat({
  channel,
  sessionId,
  data,
  t,
  lang,
}: {
  channel: LeaderChannel;
  sessionId: string;
  data: LeaderData;
  t: (key: LeaderKey) => string;
  lang: string;
}) {
  const hunters = channel === 'hunters';
  const [rows, setRows] = useState<LeaderMessage[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LeaderKey | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const colorOf = teamColors(data.teams);
  const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', timeZone: data.session.timezone });

  const load = useCallback(async () => {
    try {
      setRows(await leaderApi.messages(sessionId, channel));
      setError(null);
    } catch (e) {
      setError(e instanceof LeaderError ? e.key : 'errorGeneric');
    }
  }, [sessionId, channel]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void load();
    }, CHAT_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      const row = await leaderApi.send(sessionId, body, channel);
      setRows((r) => [...(r ?? []), row]);
      setText('');
    } catch (e) {
      setError(e instanceof LeaderError ? e.key : 'errorGeneric');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scroll}
        style={styles.flex}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
      >
        <Body muted>{hunters ? t('leaderHunterChatAs') : data.session.team_chat ? t('leaderChatAs') : t('leaderChatOff')}</Body>
        {error ? <Banner tone="danger">{t(error)}</Banner> : null}
        {rows && rows.length === 0 ? <Body muted>{t('leaderChatEmpty')}</Body> : null}
        {(rows ?? []).map((m) => {
          // Eigen berichten rechts: in de teamchat alles van The Hunters, in de hunters-chat alleen die van jou.
          const staff = hunters ? m.own === true : m.sender === 'staff';
          return (
            <View key={m.id} style={[styles.bubble, staff ? styles.own : styles.other]}>
              <Text style={[styles.bubbleName, staff && styles.ownName]} numberOfLines={1}>
                {!staff && m.team_id ? <Text style={{ color: colorOf.get(m.team_id) }}>● </Text> : null}
                {m.sender_name ?? (hunters ? t('leaderOrganisation') : 'The Hunters')}
                {'  '}
                <Text style={[styles.bubbleTime, staff && styles.ownTime]}>{time.format(new Date(m.created_at))}</Text>
              </Text>
              <Text style={[styles.bubbleBody, staff && styles.ownBody]}>{m.body}</Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t(hunters ? 'leaderHunterChatPlaceholder' : 'leaderChatPlaceholder')}
          placeholderTextColor={colors.textMuted}
          maxLength={CHAT_MAX_LENGTH}
          multiline
          accessibilityLabel={t(hunters ? 'leaderHunterChatPlaceholder' : 'leaderChatPlaceholder')}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!text.trim() || busy}
          style={[styles.send, (!text.trim() || busy) && styles.sendOff]}
          onPress={() => void send()}
        >
          <Text style={styles.sendText}>{t('leaderChatSend')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.sm, gap: space.sm },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  headerSub: { color: colors.textMuted, fontSize: 13 },
  headerButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm },
  headerButtonText: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  banner: { paddingHorizontal: space.md, paddingBottom: space.sm, gap: space.xs },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  tabActive: { borderTopWidth: 3, borderTopColor: colors.accent },
  tabText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  tabTextActive: { color: colors.text },
  list: { padding: space.md, gap: space.sm, ...contentColumn },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md, gap: space.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rank: { color: colors.textMuted, fontSize: 15, fontWeight: '700', minWidth: 20 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#ffffff' },
  teamName: { color: colors.text, fontSize: 17, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 13 },
  call: { flex: 1, minHeight: 44, justifyContent: 'center' },
  callText: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  step: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { color: colors.text, fontSize: 22, fontWeight: '700' },
  caught: { color: colors.text, fontSize: 18, fontWeight: '700', minWidth: 28, textAlign: 'center' },
  section: { color: colors.textMuted, fontSize: 14, fontWeight: '700', marginTop: space.md, textTransform: 'uppercase' },
  bubble: { maxWidth: '85%', borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.md },
  other: { alignSelf: 'flex-start', backgroundColor: colors.surfaceRaised },
  own: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  bubbleName: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  ownName: { color: colors.accentText },
  bubbleTime: { color: colors.textMuted, fontSize: 12, fontWeight: '400' },
  ownTime: { color: colors.accentText, opacity: 0.7 },
  bubbleBody: { color: colors.text, fontSize: 17, marginTop: 2 },
  ownBody: { color: colors.accentText },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...contentColumn,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 17,
  },
  send: {
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { opacity: 0.5 },
  sendText: { color: colors.accentText, fontSize: 17, fontWeight: '700' },
});
