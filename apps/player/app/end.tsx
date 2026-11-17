import { t as tx } from '@hunt/engine';
import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDuration } from '../src/core/i18n';
import { leaveGame } from '../src/services/game';
import { stopTracking } from '../src/services/location';
import { removePlayAreas } from '../src/services/map-download';
import { Body, Button, Title } from '../src/ui/components';
import { useGame } from '../src/ui/GameProvider';
import { colors, space } from '../src/ui/theme';

/** Einde van het spel: uitkomst, eindscore en speeltijd. */
export default function EndScreen() {
  const { controller, snapshot, t, lang } = useGame();
  const state = snapshot?.state;
  const ended = state?.ended;

  useEffect(() => {
    if (!ended) return;
    void stopTracking();
    // Na afloop heeft de telefoon de kaart van het speelveld niet meer nodig.
    void removePlayAreas();
  }, [ended]);

  if (!controller || !snapshot || !state) return <Redirect href="/" />;
  if (!ended) return <Redirect href="/play" />;
  const game = snapshot.game;
  const ending = game.endings.find((e) => e.id === ended.ending);
  const tr = (value: Parameters<typeof tx>[0]) => tx(value, lang, game.defaultLanguage);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>{t('gameOver')}</Text>
        <Title>{tr(ending?.title)}</Title>
        <Body>{tr(ending?.body)}</Body>
        <Text style={styles.label}>{t('finalScore')}</Text>
        <Text style={styles.score}>{state.score}</Text>
        <Text style={styles.label}>{t('time')}</Text>
        <Text style={styles.time}>{formatDuration(ended.at - controller.context!.startedAt)}</Text>
        <Button
          kind="secondary"
          label={t('leave')}
          onPress={() =>
            Alert.alert(t('leave'), t('leaveConfirm'), [
              { text: t('no'), style: 'cancel' },
              { text: t('yes'), style: 'destructive', onPress: () => void leaveGame() },
            ])
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.md, paddingBottom: space.xl },
  kicker: { color: colors.accent, fontWeight: '700', textTransform: 'uppercase', marginBottom: space.sm },
  label: { color: colors.textMuted, fontSize: 14, marginTop: space.lg },
  score: { color: colors.text, fontSize: 56, fontWeight: '800' },
  time: { color: colors.text, fontSize: 28, fontWeight: '700' },
});
