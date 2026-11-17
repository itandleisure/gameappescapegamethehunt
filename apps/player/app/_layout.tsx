// Definieert de achtergrondtaak voor GPS; moet als eerste geladen worden.
import '../src/services/location';
import { getLocales } from 'expo-localization';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { APP_LANGUAGES, pickLanguage } from '../src/core/i18n';
import { GameProvider } from '../src/ui/GameProvider';
import { colors } from '../src/ui/theme';

const deviceLanguage = pickLanguage(
  getLocales().map((l) => l.languageTag),
  APP_LANGUAGES,
  'en',
);

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GameProvider deviceLanguage={deviceLanguage}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="play" />
          <Stack.Screen name="tasks" options={{ presentation: 'modal' }} />
          <Stack.Screen name="task/[id]" options={{ presentation: 'modal', gestureEnabled: false }} />
          <Stack.Screen name="end" options={{ gestureEnabled: false }} />
        </Stack>
      </GameProvider>
    </SafeAreaProvider>
  );
}
