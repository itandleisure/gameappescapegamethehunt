import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_LANGUAGES, languageLabel, MAIN_LANGUAGES } from '../src/core/i18n';
import { BackendError } from '../src/core/supabase-backend';
import { joinGame, rejoinGame } from '../src/services/game';
import { useLeader } from '../src/services/leader';
import { leaderMsg } from '../src/core/leader-i18n';
import { isValidPhone } from '../src/core/view';
import { Banner, Button, Chip, Field, Title } from '../src/ui/components';
import { useGame } from '../src/ui/GameProvider';
import { colors, contentColumn, radius, space } from '../src/ui/theme';
import { msg, type MessageKey } from '../src/core/i18n';

/** Zo lang staat het logo in beeld als de app opstart, voordat het aanmeldformulier komt. */
const SPLASH_MS = 2000;
// Het logo komt één keer per keer dat de app opstart, niet bij elke terugkeer naar dit scherm.
let splashShown = false;

/** Opstartscherm: alleen het logo van Escape Game The Hunt, midden in beeld. */
function Splash({ label }: { label: string }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [opacity]);
  return (
    <View style={styles.center}>
      <Animated.Image source={require('../assets/logo-white.png')} style={[styles.splashLogo, { opacity }]} resizeMode="contain" accessibilityLabel={label} />
    </View>
  );
}

/** Aanmelden met de sessiecode, of verder spelen met de teamnaam. */
export default function JoinScreen() {
  const { loading, controller, lang: deviceLang } = useGame();
  const { loading: leaderLoading, leader } = useLeader();
  const [lang, setLang] = useState(deviceLang);
  const [joinCode, setJoinCode] = useState('');
  // Spellink of QR-code (/<game-ID>:<spelcode>): de spelcode staat al ingevuld.
  const { code: linkCode } = useLocalSearchParams<{ code?: string; game?: string }>();
  useEffect(() => {
    const code = typeof linkCode === 'string' ? linkCode.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    if (code) setJoinCode(code);
  }, [linkCode]);
  const [teamName, setTeamName] = useState('');
  const [phone, setPhone] = useState('');
  const [rejoinCode, setRejoinCode] = useState('');
  const [rejoinName, setRejoinName] = useState('');
  const [askRejoinCode, setAskRejoinCode] = useState(false);
  const [busy, setBusy] = useState<'join' | 'rejoin' | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  // De zeven hoofdtalen staan altijd in beeld; de andere Europese talen klap je uit.
  const [allLanguages, setAllLanguages] = useState(false);
  // De taalkeuze en "verder spelen" zijn dichtgeklapt, zodat het formulier zonder scrollen in beeld past.
  const [pickLanguage, setPickLanguage] = useState(false);
  const [showRejoin, setShowRejoin] = useState(false);
  const [splash, setSplash] = useState(!splashShown);
  useEffect(() => {
    if (!splash) return;
    const timer = setTimeout(() => {
      splashShown = true;
      setSplash(false);
    }, SPLASH_MS);
    return () => clearTimeout(timer);
  }, [splash]);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  const t = (key: MessageKey) => msg(lang, key);

  // Tijdens het laden staat het logo al in beeld; wie al in een spel zit, gaat daarna meteen door.
  if (loading || leaderLoading) return <Splash label={t('appName')} />;
  if (controller) return <Redirect href="/play" />;
  if (leader) return <Redirect href="/leader" />;
  if (splash) return <Splash label={t('appName')} />;

  const run = async (kind: 'join' | 'rejoin', action: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof BackendError ? e.key : 'errorGeneric');
      if (e instanceof BackendError && e.key === 'errorAmbiguousTeam') setAskRejoinCode(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {error ? <Banner tone="danger">{t(error)}</Banner> : null}

          {/* Klein logo naast de titel, en weg zodra het toetsenbord open is: zo blijven alle velden in beeld. */}
          <View style={styles.header}>
            {keyboard ? null : (
              <Image source={require('../assets/logo-white.png')} style={styles.logo} resizeMode="contain" accessibilityLabel={t('appName')} />
            )}
            <Title>{t('joinTitle')}</Title>
          </View>
          <Field
            label={t('joinCode')}
            hint={t('joinCodeHint')}
            value={joinCode}
            onChangeText={(v) => setJoinCode(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            compact
          />
          <Field label={t('teamName')} value={teamName} onChangeText={setTeamName} maxLength={60} compact />
          <Field
            label={t('phone')}
            hint={t('phoneHint')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={24}
            compact
          />

          {/* Taal: één regel met de gekozen taal; tik erop om een andere te kiezen. */}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: pickLanguage }}
            onPress={() => setPickLanguage((open) => !open)}
            style={styles.languageRow}
          >
            <Text style={styles.languageLabel}>{t('language')}</Text>
            <Text style={styles.languageValue} numberOfLines={1}>
              {languageLabel(lang)} {pickLanguage ? '▴' : '▾'}
            </Text>
          </Pressable>
          {pickLanguage ? (
            <View style={styles.chips}>
              {APP_LANGUAGES.filter((code) => allLanguages || MAIN_LANGUAGES.includes(code) || code === lang).map((code) => (
                <Chip
                  key={code}
                  label={languageLabel(code)}
                  selected={lang === code}
                  onPress={() => {
                    setLang(code);
                    setPickLanguage(false);
                  }}
                />
              ))}
              {allLanguages ? null : (
                <Chip label={`+${APP_LANGUAGES.filter((code) => !MAIN_LANGUAGES.includes(code) && code !== lang).length}`} selected={false} onPress={() => setAllLanguages(true)} />
              )}
            </View>
          ) : null}

          <Button
            label={t('join')}
            busy={busy === 'join'}
            disabled={joinCode.trim().length < 4 || teamName.trim().length === 0 || phone.trim().length === 0 || busy !== null}
            onPress={() => {
              if (!isValidPhone(phone)) return setError('errorPhone');
              void run('join', () => joinGame(joinCode.trim(), teamName.trim(), lang, phone.trim().replace(/\s+/g, ' ')));
            }}
          />

          {/* Onder Meedoen, na een scheidingslijn: twee duidelijke knoppen voor de andere routes. */}
          <View style={styles.divider} />
          <Button
            kind="secondary"
            label={t('rejoinTitle')}
            onPress={() => setShowRejoin((open) => !open)}
          />

          {showRejoin || askRejoinCode ? (
            <View style={styles.rejoin}>
              {/* Verder spelen met alleen de teamnaam. De hunt-code komt er pas bij als
                  die naam in meerdere lopende hunts voorkomt. */}
              <Field label={t('teamName')} value={rejoinName} onChangeText={setRejoinName} maxLength={60} compact />
              {askRejoinCode ? (
                <Field
                  label={t('joinCode')}
                  value={rejoinCode}
                  onChangeText={(v) => setRejoinCode(v.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={12}
                  compact
                />
              ) : null}
              <Button
                label={t('rejoin')}
                busy={busy === 'rejoin'}
                disabled={rejoinName.trim().length === 0 || (askRejoinCode && rejoinCode.trim().length < 4) || busy !== null}
                onPress={() => run('rejoin', () => rejoinGame(rejoinName.trim(), askRejoinCode ? rejoinCode.trim() : ''))}
              />
            </View>
          ) : null}

          {/* Spelleiders loggen in met de spelleider-code van de hunt en zien de teams in plaats van het spel. */}
          <Button kind="secondary" label={leaderMsg(lang, 'leaderTitle')} onPress={() => router.push('/leader-login')} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  splashLogo: { width: 180, height: (180 * 600) / 496 },
  content: { padding: space.md, paddingBottom: space.lg, ...contentColumn },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  logo: { height: 44, width: (44 * 496) / 600, marginBottom: space.md },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  languageLabel: { color: colors.textMuted, fontSize: 14, marginRight: space.sm },
  languageValue: { color: colors.text, fontSize: 16, flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.lg },
  rejoin: { marginTop: space.md, padding: space.md, paddingBottom: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
});
