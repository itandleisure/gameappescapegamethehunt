import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Draait de app in Expo Go (de test-app uit de App Store)? Daar ontbreken de
 * kaartmodule en GPS op de achtergrond; de app valt dan terug op een kaart in
 * een webweergave en GPS zolang het scherm aan is.
 */
export const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
