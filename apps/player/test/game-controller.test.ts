import { composeGame, type GpsFix } from '@hunt/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { leeuwarden, leeuwardenPoints, theHuntBase } from '../../../packages/engine/test/fixtures/the-hunt.js';
import { GameController, STORAGE_KEY, randomUuid } from '../src/core/game-controller.js';
import { MemoryStore } from '../src/core/types.js';
import { FakeBackend } from './fake-backend.js';

const game = composeGame(theHuntBase, [leeuwarden], { id: 'the-hunt-leeuwarden', version: 1 });
const T0 = Date.UTC(2026, 10, 21, 13, 0, 0);
const SKEW = 90_000; // telefoonklok loopt anderhalve minuut achter

function setup(g = game) {
  let device = T0 - SKEW;
  let n = 0;
  const backend = new FakeBackend(g, T0);
  const store = new MemoryStore();
  const deps = {
    backend,
    store,
    deviceNow: () => device,
    newId: () => `id-${++n}`,
  };
  const advance = (ms: number) => {
    device += ms;
    backend.serverNow += ms;
  };
  const fix = (p: { lat: number; lng: number }, accuracy = 8): GpsFix => ({ ...p, accuracy, at: device });
  return { backend, store, deps, advance, fix, device: () => device };
}

describe('GameController', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it('meldt een team aan, rekent op servertijd en start eenmalig', async () => {
    const c = await GameController.join(s.deps, 'LWD001', 'De Speurders', 'nl', '06 12345678');
    expect(c.team.track).toBe(1);
    expect(c.snapshot().state).toBeNull();
    expect(c.snapshot().now).toBe(T0); // klok gecorrigeerd

    await c.start();
    s.advance(60_000);
    await c.start(); // tweede keer verandert niets
    expect(c.team.startedAt).toBe(T0);
    const state = c.snapshot().state!;
    expect(state.tasks.start!.status).toBe('visible');
    expect(state.tasks.start!.onMap).toBe(true);
  });

  it('opent de startlocatie pas na twee goede GPS-metingen, slechte metingen tellen niet', async () => {
    const c = await GameController.join(s.deps, 'LWD001', 'Team', 'nl', '06 12345678');
    await c.start();
    s.advance(5_000);
    expect(await c.onLocation(s.fix(leeuwardenPoints.start, 80))).toEqual([]);
    expect(await c.onLocation(s.fix(leeuwardenPoints.start))).toEqual([]);
    s.advance(1_000);
    expect(await c.onLocation(s.fix(leeuwardenPoints.start))).toEqual(['start']);
    expect(c.snapshot().state!.tasks.start!.status).toBe('open');
    // Opnieuw binnen de cirkel opent niets dubbel
    s.advance(1_000);
    expect(await c.onLocation(s.fix(leeuwardenPoints.start))).toEqual([]);
  });

  it('geeft na Nee op de bevestigingsvraag 20 seconden om de cirkel uit te lopen', async () => {
    const base = JSON.parse(JSON.stringify(theHuntBase)) as typeof theHuntBase;
    base.tasks.find((t) => t.id === 'start')!.confirm = { nl: 'Is dit het juiste extractiepunt?' };
    const confirmGame = composeGame(base, [leeuwarden], { id: 'the-hunt-leeuwarden', version: 1 });
    s = setup(confirmGame);
    const c = await GameController.join(s.deps, 'LWD001', 'Team', 'nl', '06 12345678');
    await c.start();
    const arrive = async () => {
      await c.onLocation(s.fix(leeuwardenPoints.start));
      s.advance(1_000);
      return c.onLocation(s.fix(leeuwardenPoints.start));
    };
    expect(await arrive()).toEqual(['start']);
    expect(c.snapshot().state!.tasks.start!.status).toBe('confirming');
    expect(await c.decline('start')).toBe(20);
    // Binnen de 20 seconden komt de vraag niet terug, ook niet als ze blijven staan.
    s.advance(10_000);
    expect(await arrive()).toEqual([]);
    expect(c.snapshot().state!.tasks.start!.status).toBe('visible');
    // Daarna wel, als ze er nog staan.
    s.advance(10_000);
    expect(await arrive()).toEqual(['start']);
    expect(c.snapshot().state!.tasks.start!.status).toBe('confirming');
  });

  it('stuurt het telefoonnummer mee en laat het aanmeldende team een teamfoto maken', async () => {
    const c = await GameController.join(s.deps, 'LWD001', 'Fotogeniek', 'nl', '+31 6 1234 5678');
    expect(s.backend.phones).toEqual(['+31 6 1234 5678']);
    expect(c.snapshot().teamPhotoNeeded).toBe(true);
    await c.submitTeamPhoto('file:///team.jpg');
    expect(c.snapshot().teamPhotoNeeded).toBe(false);
    expect(c.snapshot().pending).toBeGreaterThan(0);
    // Een tweede telefoon met de teamcode hoeft geen teamfoto te maken.
    const second = await GameController.rejoin(s.deps, c.team.teamCode);
    expect(second.snapshot().teamPhotoNeeded).toBe(false);
  });

  it('zet in een testsessie de klok vooruit, zodat regels op tijd meteen gebeuren', async () => {
    const c = await GameController.join(s.deps, 'LWD001', 'Haastig', 'nl', '0612345678');
    await c.start();
    const second = game.rules.find((r) => r.id === 'tijdlijn-10')!;
    const shown = (second.then.find((a) => a.kind === 'show') as { select: { task: string } }).select.task;
    expect(c.snapshot().state!.tasks[shown]!.status).toBe('hidden');
    expect(await c.skipTime(10)).toBe(true);
    expect(c.snapshot().state!.tasks[shown]!.status).toBe('visible');
  });

  it('zet buiten een testsessie de klok niet vooruit', async () => {
    s.backend.testMode = false;
    const c = await GameController.join(s.deps, 'LWD001', 'Eerlijk', 'nl', '0612345678');
    await c.start();
    expect(await c.skipTime(10)).toBe(false);
  });

  it('opent in een testsessie een opdracht zonder GPS, en anders niet', async () => {
    const c = await GameController.join(s.deps, 'LWD001', 'Testers', 'nl', '06 12345678');
    await c.start();
    expect(c.testTargets()).toContain('start');
    expect(await c.simulateArrival('niet-bestaand')).toBe(false);
    expect(await c.simulateArrival('start')).toBe(true);
    expect(c.snapshot().state!.tasks.start!.status).toBe('open');
    expect(c.snapshot().state!.rejected ?? []).toEqual([]);

    s.backend.testMode = false;
    const echt = await GameController.join(s.deps, 'LWD001', 'Echt', 'nl', '06 12345678');
    await echt.start();
    expect(echt.testTargets()).toEqual([]);
    expect(await echt.simulateArrival('start')).toBe(false);
    expect(echt.snapshot().state!.tasks.start!.status).toBe('visible');
  });

  it('beantwoordt, gebruikt hints en stuurt alles met servertijd naar de server', async () => {
    const c = await GameController.join(s.deps, 'LWD001', 'Team', 'nl', '06 12345678');
    await c.start();
    s.advance(1_000);
    await c.onLocation(s.fix(leeuwardenPoints.start));
    s.advance(1_000);
    await c.onLocation(s.fix(leeuwardenPoints.start));
    await c.answer('start', { type: 'info' });
    await c.tick();

    const sent = s.backend.events.get(c.team.id)!;
    expect(sent.map((e) => e.type)).toEqual(['locationReached', 'answered']);
    expect(sent[0]!.at).toBe(T0 + 2_000);
    expect(c.snapshot().pending).toBe(0);

    // Hint mag niet voor een opdracht die nog niet zichtbaar is
    expect(await c.useHint('puzzel-tangram')).toBe(false);
  });

  it('blijft offline doorspelen en verstuurt later alles, zonder dubbelingen', async () => {
    const c = await GameController.join(s.deps, 'LWD001', 'Team', 'nl', '06 12345678');
    await c.start();
    s.backend.offline = true;
    s.advance(1_000);
    await c.onLocation(s.fix(leeuwardenPoints.start));
    s.advance(1_000);
    await c.onLocation(s.fix(leeuwardenPoints.start));
    await c.answer('start', { type: 'info' });
    await c.tick();
    const snap = c.snapshot();
    expect(snap.online).toBe(false);
    expect(snap.pending).toBe(2);
    expect(snap.state!.tasks.start!.status).toBe('done'); // spel loopt gewoon door

    s.backend.offline = false;
    s.advance(1_000);
    await c.tick(); // nog binnen de wachttijd na de fout
    s.advance(10_000);
    await c.tick();
    expect(s.backend.events.get(c.team.id)).toHaveLength(2);
    expect(c.snapshot().pending).toBe(0);
    expect(c.snapshot().online).toBe(true);
  });

  it('verstuurt GPS-posities en houdt ze vast als het versturen mislukt', async () => {
    const c = await GameController.join(s.deps, 'LWD001', 'Team', 'nl', '06 12345678');
    await c.start();
    // Geen bereik onderweg: alles blijft bewaard.
    s.backend.offline = true;
    for (let i = 0; i < 10; i++) {
      s.advance(6_000);
      await c.onLocation(s.fix({ lat: leeuwardenPoints.start.lat + i * 0.0002, lng: leeuwardenPoints.start.lng }));
    }
    await c.tick();
    expect(s.backend.positions).toHaveLength(0);
    s.backend.offline = false;
    s.advance(20_000);
    await c.tick();
    expect(s.backend.positions.length).toBeGreaterThanOrEqual(9);
    expect(s.backend.positions[0]!.at).toBeGreaterThan(T0); // servertijd
  });

  it('verstuurt posities binnen enkele seconden, voor de live kaart', async () => {
    const c = await GameController.join(s.deps, 'LWD001', 'Team', 'nl', '06 12345678');
    await c.start();
    for (let i = 0; i < 4; i++) {
      s.advance(2_000);
      await c.onLocation(s.fix({ lat: leeuwardenPoints.start.lat + i * 0.0005, lng: leeuwardenPoints.start.lng }));
      await c.tick();
    }
    // Na 8 seconden rijden staat de route al (bijna) helemaal op de server.
    expect(s.backend.positions.length).toBeGreaterThanOrEqual(3);
  });

  it('telt een foto direct mee en uploadt hem op de achtergrond', async () => {
    const c = await GameController.join(s.deps, 'LWD001', 'Team', 'nl', '06 12345678');
    await c.start();
    s.backend.offline = true;
    await c.submitPhoto('fotomissie', 'file:///foto.jpg');
    const event = c.snapshot();
    expect(event.pending).toBe(2); // gebeurtenis + foto
    s.backend.offline = false;
    s.advance(30_000);
    await c.tick();
    expect(s.backend.photos).toHaveLength(1);
    expect(s.backend.photos[0]!.path).toMatch(/^team-1\/fotomissie\//);
    const answered = s.backend.events.get(c.team.id)!.find((e) => e.type === 'answered')!;
    expect(answered).toMatchObject({ task: 'fotomissie', answer: { type: 'photo', photoId: s.backend.photos[0]!.photo.photoId } });
  });

  it('gaat na een herstart verder en neemt gebeurtenissen van een tweede telefoon over', async () => {
    const c = await GameController.join(s.deps, 'LWD001', 'Team', 'nl', '06 12345678');
    await c.start();
    s.advance(1_000);
    await c.onLocation(s.fix(leeuwardenPoints.start));
    s.advance(1_000);
    await c.onLocation(s.fix(leeuwardenPoints.start));
    await c.tick();

    // Tweede telefoon met de teamcode beantwoordt de start
    const other = setup();
    const phone2 = await GameController.rejoin({ ...s.deps, store: other.store, newId: () => 'tweede-1' }, c.team.teamCode);
    await phone2.answer('start', { type: 'info' });
    await phone2.tick();

    // Eerste telefoon herstart
    expect(await s.store.getItem(STORAGE_KEY)).not.toBeNull();
    const resumed = (await GameController.resume(s.deps))!;
    expect(resumed.snapshot().state!.tasks.start!.status).toBe('done');
    await resumed.leave();
    expect(await GameController.resume(s.deps)).toBeNull();
  });

  it('maakt geldige uuid\'s voor de database', () => {
    expect(randomUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('centrale start', () => {
  it('leest de uitleg, wacht op de spelleider en start met de uitleg afgerond', async () => {
    const s = setup({ ...game, briefing: 'intro' });
    s.backend.centralStart = true;
    const c = await GameController.join(s.deps, 'LWD001', 'De Speurders', 'nl', '06 12345678');
    expect(c.centralStart).toBe(true);
    expect(c.briefingTasks()).toHaveLength(12);

    // Op Start drukken doet niets zolang de spelleider niet is gestart.
    await c.start();
    expect(c.snapshot().state).toBeNull();
    await c.markReady();
    expect(c.team.readyAt).toBe(T0);
    expect(await c.checkStarted()).toBe(false);

    s.advance(5 * 60_000);
    s.backend.startSession();
    expect(await c.checkStarted()).toBe(true);
    const state = c.snapshot().state!;
    expect(c.team.startedAt).toBe(T0 + 5 * 60_000);
    expect(state.tasks['uitleg-01']!.status).toBe('done');
  });
});

describe('teamchat', () => {
  async function twoTeams() {
    const s = setup();
    s.backend.teamChat = true;
    const vossen = await GameController.join(s.deps, 'LWD001', 'Vossen', 'nl', '06 12345678');
    // Tweede team op een andere telefoon (eigen opslag), zelfde server.
    const wolven = await GameController.join({ ...s.deps, store: new MemoryStore() }, 'LWD001', 'Wolven', 'nl', '06 12345678');
    return { s, vossen, wolven };
  }

  it('stuurt berichten naar de andere teams, met naam en ongelezen-teller', async () => {
    const { s, vossen, wolven } = await twoTeams();
    expect(vossen.teamChat).toBe(true);
    expect(await vossen.sendChat('  Wie heeft de sleutel?  ')).toBe(true);
    expect(await vossen.sendChat('   ')).toBe(false);
    await vossen.tick();
    expect(s.backend.chat.map((m) => [m.name, m.body])).toEqual([['Vossen', 'Wie heeft de sleutel?']]);
    expect(vossen.snapshot().chat).toHaveLength(1);
    expect(vossen.snapshot().chatUnread).toBe(0); // eigen bericht telt niet

    s.advance(1_000);
    await wolven.refreshChat();
    const snap = wolven.snapshot();
    expect(snap.chat.map((m) => m.body)).toEqual(['Wie heeft de sleutel?']);
    expect(snap.chatUnread).toBe(1);
    await wolven.markChatRead();
    expect(wolven.snapshot().chatUnread).toBe(0);

    s.backend.postChat(null, null, 'Nog 10 minuten!');
    await wolven.refreshChat();
    expect(wolven.snapshot().chatUnread).toBe(1);
    expect(wolven.snapshot().chat.at(-1)).toMatchObject({ teamId: null, body: 'Nog 10 minuten!' });
  });

  it('bewaart een bericht zonder bereik en verstuurt het één keer zodra het weer kan', async () => {
    const { s, vossen } = await twoTeams();
    s.backend.offline = true;
    await vossen.sendChat('Hallo?');
    expect(vossen.snapshot().chat).toMatchObject([{ body: 'Hallo?', pending: true }]);
    expect(s.backend.chat).toHaveLength(0);

    // Na een herstart van de app staat het bericht er nog.
    const again = (await GameController.resume(s.deps))!;
    expect(again.snapshot().chat).toMatchObject([{ body: 'Hallo?', pending: true }]);

    s.backend.offline = false;
    s.advance(120_000);
    await again.tick();
    expect(s.backend.chat.map((m) => m.body)).toEqual(['Hallo?']);
    expect(again.snapshot().chat).toHaveLength(1);
    expect(again.snapshot().chat[0]!.pending).toBeUndefined();
  });

  it('krijgt live een seintje bij een nieuw bericht', async () => {
    const { s, wolven } = await twoTeams();
    const stop = wolven.watchChat();
    s.backend.postChat('team-1', 'Vossen', 'Hoi!');
    await new Promise((r) => setTimeout(r, 0));
    expect(wolven.snapshot().chat.map((m) => m.body)).toEqual(['Hoi!']);
    // De spelleider haalt het bericht weg.
    s.backend.chat = [];
    s.backend.notifyChat(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(wolven.snapshot().chat).toEqual([]);
    stop();
  });

  it('volgt de spelleider die de chat aan- of uitzet, en verwijderde berichten verdwijnen', async () => {
    const s = setup();
    const c = await GameController.join(s.deps, 'LWD001', 'Vossen', 'nl', '06 12345678');
    expect(c.teamChat).toBe(false);
    expect(await c.sendChat('Hallo')).toBe(false);

    s.backend.teamChat = true;
    s.backend.postChat('team-9', 'Wolven', 'iets ongepasts');
    s.advance(31_000);
    await c.tick(); // haalt de instelling op
    await c.tick(); // en daarna de chat
    expect(c.teamChat).toBe(true);
    expect(c.snapshot().chat.map((m) => m.body)).toEqual(['iets ongepasts']);

    s.backend.chat = [];
    await c.refreshChat(true);
    expect(c.snapshot().chat).toEqual([]);

    s.backend.teamChat = false;
    s.advance(31_000);
    await c.tick();
    expect(c.teamChat).toBe(false);
    expect(c.snapshot().chatUnread).toBe(0);
  });
});
