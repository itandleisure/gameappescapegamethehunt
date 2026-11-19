import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { photoResize } from '../core/photo';

export interface Photo {
  uri: string;
  width: number;
  height: number;
}

/**
 * Foto maken met de camera, verkleind tot maximaal 2048 px aan de langste
 * zijde (staand, liggend of panorama) en als JPEG opgeslagen: een paar
 * honderd KB in plaats van 5 tot 15 MB, wat data en uploadtijd scheelt.
 * Kleinere foto's worden niet vergroot. Null bij annuleren of geen toestemming.
 */
export async function takePhoto(): Promise<Photo | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  return shrink(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 }));
}

/**
 * Een foto kiezen die al op de telefoon staat (fotobibliotheek), op dezelfde
 * manier verkleind. Null bij annuleren. Voor de spelleider, die een eerder
 * gemaakte foto in de teamchat zet.
 */
export async function pickPhoto(): Promise<Photo | null> {
  return shrink(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 }));
}

async function shrink(result: ImagePicker.ImagePickerResult): Promise<Photo | null> {
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const resize = photoResize(asset.width, asset.height);
  // Ook zonder verkleinen opnieuw opslaan: dan is het altijd een JPEG (geen HEIC van de iPhone) en staat hij rechtop.
  const saved = await ImageManipulator.manipulateAsync(asset.uri, resize ? [{ resize }] : [], {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
