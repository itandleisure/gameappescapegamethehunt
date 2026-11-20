import type { GameEvent, GamePackage, GpsFix } from '@hunt/engine';
import type { Backend, ChatMessage, PendingPhoto, TeamRecord } from '../src/core/types.js';
import { mediaExtension } from '../src/core/supabase-backend.js';

/** Nep-server voor tests: houdt alles in het geheugen en kan "offline" gaan. */
export class FakeBackend implements Backend {
  offline = false;
  testMode = true;
  serverNow: number;
  teams = new Map<string, TeamRecord>();
  events = new Map<string, GameEvent[]>();
  positions: GpsFix[] = [];
  photos: { teamId: string; photo: PendingPhoto; path: string }[] = [];
  private order = 0;

  /** Versie die de hunt speelt; `liveUpdate` zet hem op een nieuwe versie. */
  versionId = 'versie-1';

  constructor(
    private game: GamePackage,
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

  phones: string[] = [];

  async joinSession(joinCode: string, teamName: string, language: string, phone = '') {
    this.phones.push(phone);
    this.guard();
    if (joinCode !== 'LWD001') throw new Error('P0002');
    if ([...this.teams.values()].some((t) => t.name.toLowerCase() === teamName.toLowerCase())) throw new Error('23505');
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

  async rejoinTeam(teamName: string, joinCode = '') {
    this.guard();
    const team = joinCode.trim() === '' || joinCode.trim().toUpperCase() === 'LWD001'
      ? [...this.teams.values()].find((t) => t.name.toLowerCase() === teamName.trim().toLowerCase())
      : undefined;
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
      session: { id: 'sessie-1', name: 'Test', timezone: 'Europe/Amsterdam', status: 'open' as const, testMode: this.testMode, teamChat: this.teamChat, joinCode: 'LWD001' },
      game: this.game,
      versionId: this.versionId,
    };
  }

  /** Zoals de beheerder die het spel live bijwerkt. */
  liveUpdate(game: GamePackage, versionId: string) {
    this.game = game;
    this.versionId = versionId;
  }

  async loadSessionVersion() {
    this.guard();
    return this.versionId;
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
    const path = `${teamId}/${photo.task}/${photo.photoId}.${mediaExtension(photo)}`;
    this.photos.push({ teamId, photo, path });
    return path;
  }

  async serverTime() {
    this.guard();
    return this.serverNow;
  }

  teamChat = false;
  chat: ChatMessage[] = [];
  /** Aantal pogingen om een chatbericht te sturen (ook dubbele). */
  chatSends = 0;
  private chatWatchers = new Set<(deleted: boolean) => void>();

  async loadChat(_sessionId: string, since?: number) {
    this.guard();
    return this.chat.filter((m) => since === undefined || m.createdAt > since).map((m) => ({ ...m }));
  }

  async sendChat(_sessionId: string, teamId: string, message: { id: string; body: string }) {
    this.guard();
    this.chatSends += 1;
    if (!this.teamChat) throw new Error('42501');
    if (this.chat.some((m) => m.id === message.id)) return;
    this.chat.push({ id: message.id, teamId, name: this.teams.get(teamId)?.name ?? null, body: message.body, createdAt: this.serverNow });
    this.notifyChat();
  }

  watchChat(_sessionId: string, onChange: (deleted: boolean) => void) {
    this.chatWatchers.add(onChange);
    return () => void this.chatWatchers.delete(onChange);
  }

  /** Bericht van een ander team of de spelleiding (teamId null). */
  postChat(teamId: string | null, name: string | null, body: string) {
    this.chat.push({ id: `chat-${this.chat.length + 1}`, teamId, name, body, createdAt: this.serverNow });
    this.notifyChat();
  }

  notifyChat(deleted = false) {
    for (const watch of this.chatWatchers) watch(deleted);
  }

  async loadTeamChat() {
    this.guard();
    return this.teamChat;
  }
}
