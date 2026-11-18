import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { GameController, Snapshot } from '../core/game-controller';
import { msg, type MessageKey } from '../core/i18n';
import { currentGame, onGameChange, resumeGame } from '../services/game';

interface GameContextValue {
  /** Nog bezig met laden van een eerder spel. */
  loading: boolean;
  controller: GameController | null;
  snapshot: Snapshot | null;
  /** Taal van het team (of van de telefoon vóór het aanmelden). */
  lang: string;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children, deviceLanguage }: { children: ReactNode; deviceLanguage: string }) {
  const [loading, setLoading] = useState(true);
  const [controller, setController] = useState<GameController | null>(currentGame());
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    const stop = onGameChange(setController);
    void resumeGame().finally(() => setLoading(false));
    return stop;
  }, []);

  // Toestand bijhouden: bij elke wijziging, en elke seconde voor de timer en tijdregels.
  useEffect(() => {
    if (!controller) {
      setSnapshot(null);
      return;
    }
    setSnapshot(controller.snapshot());
    const unsubscribe = controller.subscribe(setSnapshot);
    const clock = setInterval(() => setSnapshot(controller.snapshot()), 1_000);
    const sync = setInterval(() => void controller.tick(), 5_000);
    // Teamchat: nieuwe berichten live binnenhalen zolang de app open is.
    let stopChat = controller.watchChat();
    let chatOn = controller.teamChat;
    const chatWatch = controller.subscribe(() => {
      if (controller.teamChat === chatOn) return;
      chatOn = controller.teamChat; // de spelleider zette de chat aan of uit
      stopChat();
      stopChat = controller.watchChat();
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void controller.tick();
    });
    return () => {
      unsubscribe();
      chatWatch();
      stopChat();
      clearInterval(clock);
      clearInterval(sync);
      appState.remove();
    };
  }, [controller]);

  const lang = snapshot?.team.language ?? deviceLanguage;
  const value = useMemo<GameContextValue>(
    () => ({ loading, controller, snapshot, lang, t: (key, vars) => msg(lang, key, vars) }),
    [loading, controller, snapshot, lang],
  );
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame buiten GameProvider');
  return value;
}
