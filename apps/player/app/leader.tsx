import { boundaryPath, DEFAULT_BOUNDARY_COLOR, DEFAULT_CAUGHT_PENALTY, NEWS_BODY_MAX, NEWS_TITLE_MAX, outsideShade, t as tx, type Text as LangText } from '@hunt/engine';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
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
  puzzleProgress,
  standings,
  type LeaderData,
  type LeaderChannel,
  type LeaderMessage,
  type LeaderNews,
  type LeaderNewsData,
  type LeaderTeam,
  type PuzzleProgress,
} from '../src/core/leader';
import { leaderMsg, type LeaderKey } from '../src/core/leader-i18n';
import { playAreaBounds } from '../src/core/play-area';
import { ADMIN_URL } from '../src/config';
import { mapStyleChoice } from '../src/core/view';
import { leaderApi, leaveLeader, useLeader } from '../src/services/leader';
import { readFile } from '../src/services/read-file';
import { pickPhoto } from '../src/ui/camera';
import { ChatPhoto } from '../src/ui/ChatPhoto';
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

type Tab = 'map' | 'teams' | 'news' | 'chat' | 'hunters';
const TAB_LABEL: Record<Tab, LeaderKey> = { map: 'leaderMap', teams: 'leaderTeams', news: 'leaderNews', chat: 'leaderChat', hunters: 'leaderHunterChat' };

function ago(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const min = Math.floor(Math.max(0, now - Date.parse(iso)) / 60_000);
  return min < 1 ? '<1 min' : `${min} min`;
}

/**
 * Spelleider-modus: geen spel, maar de teams en de andere spelleiders op de
 * kaart, de ranglijst met telefoonnummers (tikken kopieert) en "gepakt", de teamchat als The Hunters en
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
        {tab === 'news' ? <LeaderNewsTab sessionId={leader.sessionId} data={data} t={t} lang={lang} /> : null}
        {tab === 'chat' && data ? <LeaderChat key="teams" channel="teams" sessionId={leader.sessionId} data={data} t={t} lang={lang} /> : null}
        {tab === 'hunters' && data ? <LeaderChat key="hunters" channel="hunters" sessionId={leader.sessionId} data={data} t={t} lang={lang} /> : null}
      </View>

      <SafeAreaView edges={['bottom']} style={styles.tabs}>
        {(['map', 'teams', 'news', 'chat', 'hunters'] as const).map((id) => (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
            onPress={() => setTab(id)}
            style={[styles.tab, tab === id && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === id && styles.tabTextActive]} numberOfLines={1} adjustsFontSizeToFit>
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

/** Vakje per puzzel met het nummer van die puzzel, groen als hij is opgelost, met daaronder welke dat zijn. */
function PuzzleChecks({
  puzzles,
  solved,
  t,
}: {
  puzzles: PuzzleProgress['puzzles'];
  solved: Set<string> | undefined;
  t: (key: LeaderKey, vars?: Record<string, string | number>) => string;
}) {
  if (puzzles.length === 0) return null;
  // Elk vakje hoort bij één puzzel en houdt zijn nummer: puzzel 3 opgelost = vakje 3 groen.
  const done = puzzles.map((p, i) => ({ n: i + 1, title: p.title, done: solved?.has(p.id) ?? false }));
  const names = done.filter((p) => p.done).map((p) => `${p.n} ${p.title}`);
  return (
    <View style={styles.puzzleWrap} accessible accessibilityLabel={`${t('leaderPuzzles', { n: names.length, m: puzzles.length })}${names.length ? `: ${names.join(', ')}` : ''}`}>
      <View style={styles.puzzles}>
        {done.map((p) => (
          <View key={p.n} style={[styles.puzzle, p.done && styles.puzzleDone]}>
            <Text style={[styles.puzzleText, p.done && styles.puzzleTextDone]}>{p.n}</Text>
          </View>
        ))}
        <Text style={styles.muted}>
          {names.length}/{puzzles.length}
        </Text>
      </View>
      {names.length ? <Text style={styles.muted}>{names.join(' · ')}</Text> : null}
    </View>
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
  const [copied, setCopied] = useState<string | null>(null);
  /** "Team gepakt": lijst met teams open, en welk team net gemeld is. */
  const [picking, setPicking] = useState(false);
  const [reported, setReported] = useState<string | null>(null);
  if (!data) return <View style={styles.flex} />;
  const penalty = Math.abs(data.game?.caughtPenalty ?? DEFAULT_CAUGHT_PENALTY);
  const colorOf = teamColors(data.teams);
  // Tikken kopieert het nummer in plaats van te bellen, zodat een spelleider niet per ongeluk belt.
  const copyPhone = async (teamId: string, phone: string) => {
    try {
      await Clipboard.setStringAsync(phone);
      setCopied(teamId);
      setTimeout(() => setCopied((c) => (c === teamId ? null : c)), 2000);
    } catch {
      setError('errorGeneric');
    }
  };
  const progress = puzzleProgress(data, now);
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

  // Team gepakt melden: kies het team, bevestig; het team krijgt strafpunten en alle teams een melding.
  const report = (team: LeaderTeam) => {
    Alert.alert(t('leaderCaughtReport'), t('leaderCaughtConfirm', { team: team.name, points: penalty }), [
      { text: t('leaderCancel'), style: 'cancel' },
      {
        text: t('leaderCaughtYes'),
        style: 'destructive',
        onPress: () => {
          setPicking(false);
          setReported(team.name);
          setTimeout(() => setReported((r) => (r === team.name ? null : r)), 5000);
          void bump(team, 1);
        },
      },
    ]);
  };
  const playing = data.teams.filter((tm) => tm.started_at && !tm.ended_at);

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {error ? <Banner tone="danger">{t(error)}</Banner> : null}
      {data.teams.length === 0 ? <Body muted>{t('leaderNoTeams')}</Body> : null}
      {data.teams.length ? (
        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: picking }}
            style={styles.caughtButton}
            onPress={() => setPicking((p) => !p)}
          >
            <Text style={styles.caughtButtonText}>{t('leaderCaughtReport')} {picking ? '▲' : '▼'}</Text>
          </Pressable>
          {picking
            ? (playing.length ? playing : data.teams).map((tm) => (
                <Pressable key={tm.id} accessibilityRole="button" style={styles.caughtOption} onPress={() => report(tm)}>
                  <View style={[styles.dot, { backgroundColor: colorOf.get(tm.id) }]} />
                  <Text style={styles.teamName} numberOfLines={1}>
                    {tm.name}
                  </Text>
                </Pressable>
              ))
            : null}
          {reported ? <Text style={styles.muted}>{t('leaderCaughtDone', { team: reported, points: penalty })}</Text> : null}
        </View>
      ) : null}
      {standings(data.teams, progress.scores).map((tm, i) => {
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
                  {t('leaderPoints', { n: progress.scores.get(tm.id) ?? tm.score })} · {status} · {ago(p?.recorded_at ?? null, now) ?? t('leaderNoLocation')}
                </Text>
              </View>
            </View>
            <PuzzleChecks puzzles={progress.puzzles} solved={progress.solved.get(tm.id)} t={t} />
            <View style={styles.cardRow}>
              {tm.phone ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.call}
                  accessibilityLabel={`${t('leaderCopy')} ${tm.phone}`}
                  onPress={() => void copyPhone(tm.id, tm.phone!)}
                >
                  <Text style={styles.callText}>
                    {copied === tm.id ? `${t('leaderCopied')} ✓` : `${t('leaderCopy')} ${tm.phone}`}
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
  const [sendingPhoto, setSendingPhoto] = useState(false);
  /** Technische oorzaak als een foto niet verstuurd kon worden. */
  const [photoError, setPhotoError] = useState<string | null>(null);
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

  // Foto die al op de telefoon staat in de teamchat zetten; wat er in het tekstvak staat gaat mee als tekst.
  const sendPhoto = async () => {
    setError(null);
    setPhotoError(null);
    try {
      const photo = await pickPhoto();
      if (!photo) return;
      setSendingPhoto(true);
      const row = await leaderApi.sendPhoto(sessionId, Crypto.randomUUID(), await readFile(photo.uri), text.trim());
      setRows((r) => [...(r ?? []), row]);
      setText('');
    } catch (e) {
      setError(e instanceof LeaderError ? e.key : 'errorGeneric');
      const cause = e instanceof LeaderError ? (e as { cause?: { message?: string } }).cause : e;
      setPhotoError(`${t('leaderChatPhoto')}: ${(cause as { message?: string } | undefined)?.message ?? String(e)}`);
    } finally {
      setSendingPhoto(false);
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
        {photoError ? <Body muted>{photoError}</Body> : null}
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
              {m.photo_path ? <ChatPhoto path={m.photo_path} label={m.sender_name ?? 'The Hunters'} /> : null}
              {/* Een foto zonder tekst heeft als tekst alleen 📷. */}
              {m.photo_path && m.body === '📷' ? null : <Text style={[styles.bubbleBody, staff && styles.ownBody]}>{m.body}</Text>}
            </View>
          );
        })}
        {sendingPhoto ? <Body muted>{t('leaderChatPhotoSending')}</Body> : null}
      </ScrollView>
      <View style={styles.inputRow}>
        {hunters ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('leaderChatPhoto')}
            disabled={sendingPhoto || busy}
            style={[styles.photoButton, (sendingPhoto || busy) && styles.sendOff]}
            onPress={() => void sendPhoto()}
          >
            <Text style={styles.photoButtonText}>📷</Text>
          </Pressable>
        )}
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

/** Een nieuwsflits die klaarstaat om te versturen, ter controle. */
interface NewsDraft {
  icon: string;
  title: LangText;
  body: LangText;
  /** Eigen tekst: nog vertalen vóór het versturen. */
  own?: { title: string; body: string };
}

/**
 * Nieuwsflitsen naar alle teams: snelknoppen uit het beheer (al vertaald) en
 * een eigen bericht dat de app eerst laat vertalen. Elke flits eerst ter
 * controle, dan pas versturen.
 */
function LeaderNewsTab({
  sessionId,
  data,
  t,
  lang,
}: {
  sessionId: string;
  data: LeaderData | null;
  t: (key: LeaderKey, vars?: Record<string, string | number>) => string;
  lang: string;
}) {
  const [news, setNews] = useState<LeaderNewsData | null>(null);
  const [draft, setDraft] = useState<NewsDraft | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LeaderKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const game = data?.game ?? null;
  const fallback = game?.defaultLanguage ?? 'nl';
  const label = (text: LangText | undefined) => tx(text, lang, fallback);
  const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', timeZone: data?.session.timezone });

  const load = useCallback(async () => {
    try {
      setNews(await leaderApi.news(sessionId));
      setError(null);
    } catch (e) {
      setError(e instanceof LeaderError ? e.key : 'errorGeneric');
    }
  }, [sessionId]);
  useEffect(() => {
    void load();
  }, [load]);

  const send = async (d: NewsDraft) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let { title: ti, body: bo } = d;
      let translated = true;
      if (d.own) {
        // Getypt in de taal van de telefoon; die moet wel een taal van het spel zijn, anders de hoofdtaal.
        const languages: string[] = game?.languages ?? [fallback];
        const source = languages.includes(lang) ? lang : fallback;
        const result = await leaderApi.translateNews(ADMIN_URL, sessionId, source, languages, d.own.title, d.own.body);
        ({ title: ti, body: bo, translated } = result);
      }
      const row = await leaderApi.sendNews(sessionId, d.icon, ti, bo);
      setNews((n) => (n ? { ...n, sent: [row, ...n.sent] } : n));
      setDraft(null);
      if (d.own) {
        setTitle('');
        setBody('');
      }
      setNotice(translated ? t('leaderNewsSent', { title: label(ti) }) : t('leaderNewsUntranslated'));
    } catch (e) {
      setError(e instanceof LeaderError ? e.key : 'errorGeneric');
    } finally {
      setBusy(false);
    }
  };

  const ownDraft = () => {
    const ti = title.trim();
    if (!ti) return;
    setNotice(null);
    setDraft({ icon: '📣', title: { [lang]: ti } as LangText, body: (body.trim() ? { [lang]: body.trim() } : {}) as LangText, own: { title: ti, body: body.trim() } });
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        <Body muted>{t('leaderNewsIntro')}</Body>
        {error ? <Banner tone="danger">{t(error)}</Banner> : null}
        {notice ? <Banner>{notice}</Banner> : null}

        {draft ? (
          <View style={[styles.card, styles.newsDraft]}>
            <Text style={styles.section}>{t('leaderNewsPreview')}</Text>
            <View style={styles.cardRow}>
              <Text style={styles.newsIcon}>{draft.icon}</Text>
              <View style={styles.flex}>
                <Text style={styles.teamName}>{label(draft.title)}</Text>
                {label(draft.body) ? <Text style={styles.muted}>{label(draft.body)}</Text> : null}
              </View>
            </View>
            <Button label={busy ? t('leaderNewsSending') : t('leaderNewsSend')} disabled={busy} onPress={() => void send(draft)} />
            <Button kind="secondary" label={t('leaderCancel')} disabled={busy} onPress={() => setDraft(null)} />
          </View>
        ) : null}

        <Text style={styles.section}>{t('leaderNewsQuick')}</Text>
        {(news?.presets ?? []).map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            disabled={busy}
            style={[styles.card, styles.cardRow]}
            onPress={() => {
              setNotice(null);
              setDraft({ icon: p.icon, title: p.title, body: p.body ?? {} });
            }}
          >
            <Text style={styles.newsIcon}>{p.icon}</Text>
            <View style={styles.flex}>
              <Text style={styles.teamName}>{label(p.title)}</Text>
              {label(p.body) ? <Text style={styles.muted}>{label(p.body)}</Text> : null}
            </View>
          </Pressable>
        ))}
        <Text style={styles.muted}>{t('leaderNewsEdit')}</Text>

        <Text style={styles.section}>{t('leaderNewsOwn')}</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.newsInput}
            value={title}
            onChangeText={setTitle}
            placeholder={t('leaderNewsTitle')}
            placeholderTextColor={colors.textMuted}
            maxLength={NEWS_TITLE_MAX}
            accessibilityLabel={t('leaderNewsTitle')}
          />
          <TextInput
            style={styles.newsInput}
            value={body}
            onChangeText={setBody}
            placeholder={t('leaderNewsBody')}
            placeholderTextColor={colors.textMuted}
            maxLength={NEWS_BODY_MAX}
            multiline
            accessibilityLabel={t('leaderNewsBody')}
          />
          <Button label={t('leaderChatSend')} disabled={!title.trim() || busy} onPress={ownDraft} />
        </View>

        <Text style={styles.section}>{t('leaderNewsHistory')}</Text>
        {news && news.sent.length === 0 ? <Body muted>{t('leaderNewsEmpty')}</Body> : null}
        {(news?.sent ?? []).map((n: LeaderNews) => (
          <View key={n.id} style={[styles.card, styles.cardRow]}>
            <Text style={styles.newsIcon}>{n.icon ?? '📣'}</Text>
            <View style={styles.flex}>
              <Text style={styles.teamName}>{label(n.title)}</Text>
              {label(n.body) ? <Text style={styles.muted}>{label(n.body)}</Text> : null}
              <Text style={styles.muted}>
                {time.format(new Date(n.at))}
                {n.sender_name ? ` · ${n.sender_name}` : ''}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
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
  tabText: { color: colors.textMuted, fontSize: 14, fontWeight: '600', paddingHorizontal: 2 },
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
  caughtButton: { backgroundColor: colors.danger, borderRadius: radius.md, paddingVertical: space.md, alignItems: 'center' },
  caughtButtonText: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  caughtOption: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  puzzleWrap: { gap: space.xs },
  puzzles: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  puzzle: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  puzzleDone: { backgroundColor: colors.success, borderColor: colors.success },
  puzzleText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  puzzleTextDone: { color: '#ffffff', fontWeight: '800' },
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
  photoButton: {
    minHeight: 48,
    minWidth: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButtonText: { fontSize: 22 },
  sendText: { color: colors.accentText, fontSize: 17, fontWeight: '700' },
  newsDraft: { borderWidth: 2, borderColor: colors.accent },
  newsIcon: { fontSize: 26, width: 36, textAlign: 'center' },
  newsInput: {
    minHeight: 48,
    maxHeight: 120,
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 17,
  },
});
