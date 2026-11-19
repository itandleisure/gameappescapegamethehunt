import { joinRoute, parseJoinLink } from '../src/core/links';

/**
 * Binnenkomende links: een spellink (https://<spel-domein>/<game-ID>:<spelcode>
 * of thehunt:///?code=…) opent het aanmeldscherm met de spelcode ingevuld.
 * Andere links gaan ongewijzigd door.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const link = parseJoinLink(path);
    return link ? joinRoute(link) : path;
  } catch {
    return path;
  }
}
