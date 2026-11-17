import type { GameEvent, GamePackage, GpsFix } from '@hunt/engine';
import type { Backend, PendingPhoto, TeamRecord } from '../src/core/types.js';

/** Nep-server voor tests: houdt alles in het geheugen en kan "offline" gaan. */
export class FakeBackend implements Backend {
  offline = false;
  serverNow: number;
  teams = new Map<string, TeamRecord>();
  events = new Map<string, GameEvent[]>();
  positions: GpsFix[] = [];
  photos: { teamId: string; photo: PendingPhoto; path: string }[] = [];
  private order = 0;

  constructor(
    private readonly game: GamePackage,
    start: number,
  ) {
    this.serverNow = start;
  }

  private guard() {
    if (this.offline) throw new Error('Network request failed');
  }

  async ensureSignedIn() {
    this.guard();
  }

  async joinSession(joinCode: string, teamName: string, language: string) {
    this.guard();
    if (joinCode !== 'LWD001') throw new Error('P0002');
    this.order += 1;
    const team: TeamRecord = {
      id: `team-${this.order}`,
      sessionId: 'sessie-1',
      name: teamName,
      language,
      track: ((this.order - 1) % 5) + 1,
      teamCode: `CODE${this.order}`,
      startedAt: null,
      endedAt: null,
    };
    this.teams.set(team.id, team);
    return { ...team };
  }

  async rejoinTeam(teamCode: string) {
    this.guard();
    const team = [...this.teams.values()].find((t) => t.teamCode === teamCode);
    if (!team) throw new Error('P0002');
    return { ...team };
  }

  async startTeam(teamId: string) {
    this.guard();
    const team = this.teams.get(teamId)!;
    team.startedAt ??= this.serverNow;
    return { ...team };
  }

  async loadTeam(teamId: string) {
    this.guard();
    return { ...this.teams.get(teamId)! };
  }

  async loadGame() {
    this.guard();
    return {
      session: { id: 'sessie-1', name: 'Test', timezone: 'Europe/Amsterdam', status: 'open' as const, testMode: true },
      game: this.game,
    };
  }

  async loadEvents(teamId: string) {
    this.guard();
    return [...(this.events.get(teamId) ?? [])];
  }

  async sendEvents(teamId: string, events: GameEvent[]) {
    this.guard();
    const list = this.events.get(teamId) ?? [];
    for (const e of events) if (!list.some((x) => x.id === e.id)) list.push(e);
    this.events.set(teamId, list);
  }

  async recordPositions(_teamId: string, fixes: GpsFix[]) {
    this.guard();
    this.positions.push(...fixes);
  }

  async uploadPhoto(teamId: string, photo: PendingPhoto) {
    this.guard();
    const path = `${teamId}/${photo.task}/${photo.photoId}.jpg`;
    this.photos.push({ teamId, photo, path });
    return path;
  }

  async serverTime() {
    this.guard();
    return this.serverNow;
  }
}
