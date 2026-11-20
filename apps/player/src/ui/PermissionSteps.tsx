import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MessageKey } from '../core/i18n';
import { notificationPermission, requestNotificationPermission } from '../services/alerts';
import {
  BACKGROUND_LOCATION,
  locationPermission,
  requestAlwaysLocation,
  requestForegroundLocation,
  type PermissionResult,
} from '../services/location';
import { Body, Button, Screen, Title } from './components';
import { colors, space } from './theme';

/**
 * Toestemmingen bij de start van het spel, elk met een eigen kort
 * uitlegscherm vóór de vraag van de telefoon (zoals Apple en Google willen):
 * 1. locatie tijdens gebruik, 2. locatie altijd (scherm uit),
 * 3. meldingen (trillen in de zak). Camera, microfoon en galerij vraagt de
 * telefoon pas als een team een foto of video maakt.
 */
export type PermissionStep = 'location' | 'always' | 'notify';

/** Welke vragen nog open staan; al gegeven toestemming wordt niet opnieuw gevraagd. */
export async function pendingSteps(): Promise<PermissionStep[]> {
  if (Platform.OS === 'web') return [];
  const steps: PermissionStep[] = [];
  const location = await locationPermission();
  if (location === 'denied') steps.push('location');
  if (location !== 'always' && BACKGROUND_LOCATION) steps.push('always');
  if ((await notificationPermission()) === 'undetermined') steps.push('notify');
  return steps;
}

/** Stelt de vraag van de telefoon voor deze stap; geeft de locatietoestemming daarna. */
export async function askStep(step: PermissionStep): Promise<PermissionResult | null> {
  if (step === 'location') return requestForegroundLocation();
  if (step === 'always') return requestAlwaysLocation();
  await requestNotificationPermission();
  return null;
}

const TEXTS: Record<PermissionStep, { title: MessageKey; body: MessageKey; hint: MessageKey | null }> = {
  location: { title: 'permLocationTitle', body: 'permLocationBody', hint: null },
  always: { title: 'permAlwaysTitle', body: 'permAlwaysBody', hint: Platform.OS === 'ios' ? 'permAlwaysIos' : 'permAlwaysAndroid' },
  notify: { title: 'permNotifyTitle', body: 'permNotifyBody', hint: null },
};

const ICONS: Record<PermissionStep, string> = { location: '📍', always: '🌙', notify: '📳' };

export function PermissionStepScreen({
  step,
  t,
  busy,
  onContinue,
  onSkip,
}: {
  step: PermissionStep;
  t: (key: MessageKey) => string;
  busy: boolean;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const text = TEXTS[step];
  return (
    <SafeAreaView style={styles.safe}>
      <Screen scroll>
        <View style={styles.top}>
          <Text style={styles.icon} accessibilityElementsHidden importantForAccessibility="no">
            {ICONS[step]}
          </Text>
        </View>
        <Title>{t(text.title)}</Title>
        <Body>{t(text.body)}</Body>
        {text.hint ? <Body muted>{t(text.hint)}</Body> : null}
        <View style={styles.spacer} />
        <Button label={t('permContinue')} busy={busy} disabled={busy} onPress={onContinue} />
        {/* De eerste vraag is nodig om te spelen; de andere mag je overslaan. */}
        {step !== 'location' ? <Button kind="secondary" label={t('permSkip')} disabled={busy} onPress={onSkip} /> : null}
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  top: { alignItems: 'center', marginTop: space.lg },
  icon: { fontSize: 56 },
  spacer: { height: space.md },
});
