// Definieert de achtergrondtaak voor GPS; moet als eerste geladen worden.
import '../src/services/location';
import { getLocales } from 'expo-localization';
import { ErrorBoundary as DefaultErrorBoundary, Stack, type ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { APP_LANGUAGES, pickLanguage } from '../src/core/i18n';
import { logError, startDiagnostics } from '../src/services/diagnostics';
import { installErrorHooks } from '../src/services/error-hooks';
import { prepareMapProvider } from '../src/services/map-provider';
import { GameProvider } from '../src/ui/GameProvider';
import { colors } from '../src/ui/theme';

const deviceLanguage = pickLanguage(
  getLocales().map((l) => l.languageTag),
  APP_LANGUAGES,
  'en',
);

// Kaartdienst kiezen voordat er een kaart getekend of gedownload wordt.
void prepareMapProvider();

// Fouten en technische meldingen naar het logboek (tabblad Logging in het beheer).
installErrorHooks();
startDiagnostics();

/** Een scherm dat crasht: in het logboek zetten en de standaard foutmelding tonen. */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  useEffect(() => {
    logError('scherm_crash', props.error);
  }, [props.error]);
  return <DefaultErrorBoundary {...props} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GameProvider deviceLanguage={deviceLanguage}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="play" />
          <Stack.Screen name="tasks" options={{ presentation: 'modal' }} />
          <Stack.Screen name="chat" options={{ presentation: 'modal' }} />
          <Stack.Screen name="news" options={{ presentation: 'modal' }} />
          <Stack.Screen name="help" options={{ presentation: 'modal' }} />
          <Stack.Screen name="task/[id]" options={{ presentation: 'modal', gestureEnabled: false }} />
          <Stack.Screen name="end" options={{ gestureEnabled: false }} />
          <Stack.Screen name="leader-login" />
          <Stack.Screen name="leader" options={{ gestureEnabled: false }} />
        </Stack>
      </GameProvider>
    </SafeAreaProvider>
  );
}
