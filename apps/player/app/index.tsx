import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_LANGUAGES, LANGUAGE_NAMES } from '../src/core/i18n';
import { BackendError } from '../src/core/supabase-backend';
import { joinGame, rejoinGame } from '../src/services/game';
import { isValidPhone } from '../src/core/view';
import { Banner, Body, Button, Chip, Field, Title } from '../src/ui/components';
import { useGame } from '../src/ui/GameProvider';
import { colors, space, contentColumn } from '../src/ui/theme';
import { msg, type MessageKey } from '../src/core/i18n';

/** Aanmelden met de sessiecode, of verder spelen met een teamcode. */
export default function JoinScreen() {
  const { loading, controller, lang: deviceLang } = useGame();
  const [lang, setLang] = useState(deviceLang);
  const [joinCode, setJoinCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [phone, setPhone] = useState('');
  const [rejoinCode, setRejoinCode] = useState('');
  const [rejoinName, setRejoinName] = useState('');
  const [busy, setBusy] = useState<'join' | 'rejoin' | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  const t = (key: MessageKey) => msg(lang, key);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  if (controller) return <Redirect href="/play" />;

  const run = async (kind: 'join' | 'rejoin', action: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof BackendError ? e.key : 'errorGeneric');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Klein logo, en weg zodra het toetsenbord open is: zo blijven alle velden in beeld. */}
          {keyboard ? null : (
            <Image
              source={require('../assets/logo-white.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel={t('appName')}
            />
          )}
          {error ? <Banner tone="danger">{t(error)}</Banner> : null}

          <Title>{t('joinTitle')}</Title>
          <Field
            label={t('joinCode')}
            hint={t('joinCodeHint')}
            value={joinCode}
            onChangeText={(v) => setJoinCode(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
          />
          <Field label={t('teamName')} value={teamName} onChangeText={setTeamName} maxLength={60} />
          <Field
            label={t('phone')}
            hint={t('phoneHint')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={24}
          />
          <Body muted>{t('language')}</Body>
          <View style={styles.chips}>
            {APP_LANGUAGES.map((code) => (
              <Chip key={code} label={LANGUAGE_NAMES[code] ?? code} selected={lang === code} onPress={() => setLang(code)} />
            ))}
          </View>
          <Button
            label={t('join')}
            busy={busy === 'join'}
            disabled={joinCode.trim().length < 4 || teamName.trim().length === 0 || phone.trim().length === 0 || busy !== null}
            onPress={() => {
              if (!isValidPhone(phone)) return setError('errorPhone');
              void run('join', () => joinGame(joinCode.trim(), teamName.trim(), lang, phone.trim().replace(/\s+/g, ' ')));
            }}
          />

          <View style={styles.divider} />
          <Title>{t('rejoinTitle')}</Title>
          {/* Verder spelen met dezelfde hunt-code en de teamnaam waarmee het team zich aanmeldde. */}
          <Field
            label={t('joinCode')}
            value={rejoinCode}
            onChangeText={(v) => setRejoinCode(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
          />
          <Field label={t('teamName')} value={rejoinName} onChangeText={setRejoinName} maxLength={60} />
          <Button
            kind="secondary"
            label={t('rejoin')}
            busy={busy === 'rejoin'}
            disabled={rejoinCode.trim().length < 4 || rejoinName.trim().length === 0 || busy !== null}
            onPress={() => run('rejoin', () => rejoinGame(rejoinCode.trim(), rejoinName.trim()))}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: space.md, paddingBottom: space.xl, ...contentColumn },
  logo: { height: 64, width: (64 * 496) / 600, alignSelf: 'center', marginTop: space.xs, marginBottom: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm, marginBottom: space.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.xl },
});
