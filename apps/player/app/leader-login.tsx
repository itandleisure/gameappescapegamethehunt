import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LeaderError } from '../src/core/leader';
import { leaderMsg, type LeaderKey } from '../src/core/leader-i18n';
import { joinAsLeader, useLeader } from '../src/services/leader';
import { Banner, Body, Button, Field, Title } from '../src/ui/components';
import { useGame } from '../src/ui/GameProvider';
import { colors, contentColumn, space } from '../src/ui/theme';

/** Inloggen als spelleider: spelleider-code van de hunt en een eigen naam. */
export default function LeaderLoginScreen() {
  const { lang } = useGame();
  const { leader } = useLeader();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LeaderKey | null>(null);
  const t = (key: LeaderKey) => leaderMsg(lang, key);

  if (leader) return <Redirect href="/leader" />;

  const login = async () => {
    setBusy(true);
    setError(null);
    try {
      await joinAsLeader(code.trim(), name.trim());
      router.replace('/leader');
    } catch (e) {
      setError(e instanceof LeaderError ? e.key : 'errorGeneric');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Title>{t('leaderTitle')}</Title>
          <Body muted>{t('leaderExplain')}</Body>
          {error ? <Banner tone="danger">{t(error)}</Banner> : null}
          <Field
            label={t('leaderCode')}
            hint={t('leaderCodeHint')}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
          />
          <Field label={t('leaderName')} value={name} onChangeText={setName} maxLength={40} autoComplete="name" />
          <Button
            label={t('leaderLogin')}
            busy={busy}
            disabled={code.trim().length < 4 || name.trim().length === 0 || busy}
            onPress={() => void login()}
          />
          <Button kind="secondary" label={t('leaderBack')} onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.md, paddingBottom: space.xl, gap: space.sm, ...contentColumn },
});
