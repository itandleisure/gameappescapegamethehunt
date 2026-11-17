import type { ComponentType } from 'react';
import { IN_EXPO_GO } from '../../services/runtime';
import type { GameMapProps } from './types';

/**
 * Kiest de kaart: de native MapLibre-kaart in de echte app, een webkaart in
 * Expo Go. Met require() zodat Expo Go de native module nooit laadt.
 */
const GameMap: ComponentType<GameMapProps> = IN_EXPO_GO
  ? (require('./WebMap') as { default: ComponentType<GameMapProps> }).default
  : (require('./NativeMap') as { default: ComponentType<GameMapProps> }).default;

export default GameMap;
export type { GameMapProps, MapMarker } from './types';
