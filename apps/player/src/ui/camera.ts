import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** Foto maken met de camera, verkleind tot 2048 px breed (scheelt data en uploadtijd). Null bij annuleren of geen toestemming. */
export async function takePhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || !result.assets[0]) return null;
  const resized = await ImageManipulator.manipulateAsync(result.assets[0].uri, [{ resize: { width: 2048 } }], {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return resized.uri;
}
