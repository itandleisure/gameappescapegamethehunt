import { StyleSheet, Text, View } from 'react-native';
import type { GameMapProps } from '../../../src/ui/map/types';

/** Schermvoorbeeld: een grijs vlak in plaats van de kaart (die is in de browser niet te testen). */
export default function GameMap({ markers }: GameMapProps) {
  return (
    <View style={styles.map} testID="kaart">
      <Text style={styles.text}>{`Kaart (${markers.length} markeringen)`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: '#3a4048', alignItems: 'center', justifyContent: 'center' },
  text: { color: '#d0d4d8' },
});
