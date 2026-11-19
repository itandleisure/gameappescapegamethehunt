"use client";
import { gameLanguageName, gameLanguageShort, gameLanguageTag } from '@/lib/game-languages';
import {
  composeGame,
  type BaseGame,
  type Playground,
  type PlaygroundCode,
  type PlaygroundCodes,
  type PlaygroundReveal,
  type Text,
} from "@hunt/engine";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { rowsToBase, type LayerRows } from "@/lib/game-model";
import { loadChain } from "@/lib/game-store";
import { useT } from "@/lib/language";
import {
  cityCodeValues,
  initialCode,
  newPiece,
  playgroundKey,
  rectBetween,
  toImagePoint,
} from "@/lib/playgrounds";
import { supabase } from "@/lib/supabase";
import { GameNav } from '@/editor/GameNav';

/**
 * Tabbladen (playgrounds) van het basisspel: naam, naslagtekst per taal (zoals
 * de speluitleg met de tijdlijn) en een foto waarvan vakken afgedekt zijn tot de
 * bijbehorende puzzel goed is (zoals de GPS-code van het extractiepunt).
 */
export default function TabbladenPage() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const [chain, setChain] = useState<LayerRows[] | null>(null);
  const [base, setBase] = useState<BaseGame | null>(null);
  const [list, setList] = useState<Playground[]>([]);
  const [known, setKnown] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [newName, setNewName] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Taal van de tekstvelden op de pagina; één keuze voor alle tabbladen. */
  const [lang, setLang] = useState("");
  /** Welk tabblad open staat in de beheeromgeving; "nieuw" is het formulier voor een nieuw tabblad. */
  const [active, setActive] = useState("");

  const load = useCallback(async () => {
    try {
      const c = await loadChain(supabase(), id);
      const b = rowsToBase(c[0]!);
      setChain(c);
      setBase(b);
      setList(b.playgrounds);
      setKnown(new Set(b.playgrounds.map((p) => p.id)));
      setDirty(false);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!chain || !base)
    return errors.length ? (
      <ul className="errors">
        {errors.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    ) : (
      <p className="muted">{t('Laden…')}</p>
    );

  const self = chain[chain.length - 1]!;
  const baseRow = chain[0]!.game;
  const isBase = self.game.layer === "base";

  const update = (key: string, change: (p: Playground) => Playground) => {
    setList((l) => l.map((p) => (p.id === key ? change(p) : p)));
    setDirty(true);
  };

  const add = () => {
    const key = playgroundKey(newName);
    if (!key) return setErrors([t("Geef het tabblad een naam.")]);
    if (list.some((p) => p.id === key))
      return setErrors([t("Er is al een tabblad {name}.", { name: key })]);
    setList((l) => [
      ...l,
      { id: key, name: { [base.defaultLanguage]: newName.trim() } },
    ]);
    setNewName("");
    setActive(key);
    setErrors([]);
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    setErrors([]);
    setNotice(null);
    const cleaned = list.map(cleanPlayground);
    // Eerst controleren met de engine, zodat een fout vak niet in de database komt.
    try {
      composeGame({ ...base, playgrounds: cleaned }, [], {
        id: "controle",
        version: 0,
      });
    } catch (err) {
      const issues = (err as { issues?: string[] }).issues;
      setErrors(issues ?? [err instanceof Error ? err.message : String(err)]);
      setBusy(false);
      return;
    }
    const db = supabase();
    const must = (r: { error: { message: string } | null }) => {
      if (r.error) throw new Error(r.error.message);
    };
    try {
      const fresh = cleaned.filter((p) => !known.has(p.id));
      if (fresh.length)
        must(
          await db
            .from("playgrounds")
            .insert(fresh.map((p) => ({ game_id: id, key: p.id }))),
        );
      const keys = cleaned.map((p) => p.id);
      must(
        await db
          .from("translations")
          .delete()
          .eq("game_id", id)
          .eq("entity", "playground")
          .in("entity_id", keys),
      );
      const rows = cleaned.flatMap((p) => [
        ...textRows(p.id, "name", p.name),
        ...textRows(p.id, "body", p.body ?? {}),
      ]);
      if (rows.length)
        must(
          await db
            .from("translations")
            .insert(rows.map((r) => ({ ...r, game_id: id }))),
        );
      const settings: Record<string, unknown> = { ...baseRow.settings };
      const reveal = Object.fromEntries(
        cleaned.filter((p) => p.reveal).map((p) => [p.id, p.reveal!]),
      );
      if (Object.keys(reveal).length) settings.playgroundReveal = reveal;
      else delete settings.playgroundReveal;
      const code = Object.fromEntries(
        cleaned.filter((p) => p.code).map((p) => [p.id, p.code!]),
      );
      if (Object.keys(code).length) settings.playgroundCode = code;
      else delete settings.playgroundCode;
      // Elke stad vult haar eigen GPS-code in de vakjes in.
      const codesOpen = chain[0]!.overridable.some(
        (o) => o.task_id === null && o.field === "playgroundCodes",
      );
      if (Object.keys(code).length && !codesOpen)
        must(
          await db.from("overridable_fields").insert({
            game_id: id,
            task_id: null,
            field: "playgroundCodes",
            layers: ["city"],
            label: "GPS-code extractiepunt",
          }),
        );
      must(await db.from("games").update({ settings }).eq("id", id));
      setNotice(isBase ? t('Opgeslagen in de template. Steden krijgen dit pas als je bij Templateversies "Opslaan als nieuwe versie" kiest en de steden overzet.') : t("Opgeslagen. Publiceer het spel om het in de app te zien."));
      await load();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  const shown =
    active === "nieuw" || list.some((p) => p.id === active)
      ? active
      : (list[0]?.id ?? "nieuw");

  return (
    <>
      <p className="muted">
        <Link href="/spellen">{t('Spellen')}</Link> ›{" "}
        <Link href={`/spellen/${id}`}>{self.game.slug}</Link> › {t("Tabbladen")}
      </p>
      <h1>{t('Tabbladen')}</h1>
      <GameNav id={id} layer={self.game.layer} active="tabbladen" />
      <p className="muted">
        {t('Tabbladen staan in de app onder Opdrachten, zoals Extractiepunt. Een tabblad kan vakjes met de GPS-code hebben: elk vakje gaat open zodra de opdracht die erbij hoort goed is. Gelezen uitleg verdwijnt uit de lijst. Een tabblad met alleen uitleg (zoals Speluitleg) staat niet tussen de opdrachten.')}
      </p>
      {!isBase ? (
        <>
          <p className="notice">
            {t("Tabbladen stel je in bij het basisspel:")}{" "}
            <Link href={`/spellen/${chain[0]!.game.id}/tabbladen`}>
              {chain[0]!.game.slug}
            </Link>
            .
          </p>
          <CityCodes gameId={id} chain={chain} base={base} onSaved={load} />
        </>
      ) : (
        <>
          <div className="actions">
            <button onClick={() => void save()} disabled={busy || !dirty}>
              {busy ? t("Bezig…") : dirty ? t("Opslaan") : t("Opgeslagen")}
            </button>
          </div>
          {notice ? <p className="notice">{notice}</p> : null}
          {errors.length > 0 ? (
            <ul className="errors">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : null}

          <nav className="tabs" role="tablist">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p.id === shown}
                className={p.id === shown ? "active" : ""}
                onClick={() => setActive(p.id)}
              >
                {p.name[base.defaultLanguage] || p.id}
              </button>
            ))}
            <button
              type="button"
              role="tab"
              aria-selected={shown === "nieuw"}
              className={shown === "nieuw" ? "active" : ""}
              onClick={() => setActive("nieuw")}
            >
              {t("+ Nieuw tabblad")}
            </button>
          </nav>

          {shown !== "nieuw" && base.languages.length > 1 ? (
            <div className="row" style={{ alignItems: "center", gap: 8 }}>
              <span className="muted" style={{ flex: "0 0 auto" }}>
                {t("Teksten in")}
              </span>
              <div className="langs" role="tablist" aria-label={t("Taal")}>
                {base.languages.map((code) => (
                  <button
                    key={code}
                    type="button"
                    role="tab"
                    aria-selected={code === (lang || base.defaultLanguage)}
                    className={code === (lang || base.defaultLanguage) ? "active" : ""}
                    onClick={() => setLang(code)}
                    title={gameLanguageName(code)}
                  >
                    {gameLanguageTag(code)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {list.filter((p) => p.id === shown).map((p) => (
            <PlaygroundCard
              key={p.id}
              base={base}
              lang={lang || base.defaultLanguage}
              playground={p}
              onChange={(change) => update(p.id, change)}
            />
          ))}

          {shown === "nieuw" ? (
          <section className="card" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0 }}>{t('Nieuw tabblad')}</h2>
            <div className="row">
              <div>
                <label htmlFor="newpg">{t('Naam')}</label>
                <input
                  id="newpg"
                  value={newName}
                  placeholder={t('Speluitleg')}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div style={{ flex: "0 0 auto" }}>
                <button className="secondary" onClick={add}>
                  {t('Toevoegen')}
                </button>
              </div>
            </div>
          </section>
          ) : null}
        </>
      )}
    </>
  );
}

function PlaygroundCard({
  base,
  lang,
  playground: p,
  onChange,
}: {
  base: BaseGame;
  lang: string;
  playground: Playground;
  onChange: (change: (p: Playground) => Playground) => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState(0);
  const preview = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const reveal = p.reveal;
  const setReveal = (r: PlaygroundReveal | undefined) =>
    onChange((pg) => {
      const { reveal: _r, ...rest } = pg;
      return r ? { ...rest, reveal: r } : rest;
    });
  const setText = (field: "name" | "body", lang: string, value: string) =>
    onChange((pg) => ({
      ...pg,
      [field]: { ...(pg[field] ?? {}), [lang]: value },
    }));

  const point = (e: PointerEvent<HTMLDivElement>) => {
    const box = preview.current!.getBoundingClientRect();
    return toImagePoint({ x: e.clientX, y: e.clientY }, box, reveal!);
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!reveal?.pieces[selected]) return;
    e.preventDefault();
    preview.current!.setPointerCapture(e.pointerId);
    drag.current = point(e);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !reveal) return;
    const rect = rectBetween(drag.current, point(e));
    setReveal({
      ...reveal,
      pieces: reveal.pieces.map((piece, i) =>
        i === selected ? { ...piece, ...rect } : piece,
      ),
    });
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>
        {p.name[base.defaultLanguage] || p.id}{" "}
        <span className="muted">({p.id})</span>
      </h2>
      <label htmlFor={`${p.id}-name`}>
        {t("Naam in de app ({lang})", { lang: gameLanguageShort(lang) })}
      </label>
      <input
        id={`${p.id}-name`}
        value={p.name[lang] ?? ""}
        placeholder={p.name[base.defaultLanguage] ?? ""}
        onChange={(e) => setText("name", lang, e.target.value)}
      />

      {/* De codevakjes horen alleen bij het extractiepunt. */}
      {p.code || p.reveal || p.id === "extractiepunt" ? (
        <CodeEditor base={base} playground={p} onChange={onChange} />
      ) : null}

      {/* De oude foto met afgedekte vakken staat er alleen nog als een tabblad er een heeft, om hem weg te halen. */}
      {reveal ? (
        <>
          <h3>{t('Foto met afgedekte vakken')}</h3>
          <p className="muted">
            {t('Dit tabblad heeft nog een foto met afgedekte vakken van vóór de codevakjes. Haal die weg zodra de codevakjes klaar zijn; tot die tijd toont de app allebei.')}
          </p>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="link" onClick={() => setReveal(undefined)}>
              {t('Foto weghalen')}
            </button>
          </div>
        </>
      ) : null}
      {reveal ? (
        <div
          style={{
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            alignItems: "flex-start",
            marginTop: 12,
          }}
        >
          <div
            ref={preview}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            style={{
              position: "relative",
              width: 320,
              flex: "0 0 auto",
              cursor: "crosshair",
              touchAction: "none",
              userSelect: "none",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={reveal.image}
              alt=""
              draggable={false}
              style={{ width: "100%", display: "block", borderRadius: 8 }}
            />
            {reveal.pieces.map((piece, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${(piece.x / reveal.width) * 100}%`,
                  top: `${(piece.y / reveal.height) * 100}%`,
                  width: `${(piece.w / reveal.width) * 100}%`,
                  height: `${(piece.h / reveal.height) * 100}%`,
                  background: "rgba(0,0,0,0.6)",
                  border: `2px solid ${i === selected ? "#2f81f7" : "#e5963f"}`,
                  color: "#e5963f",
                  font: "700 14px sans-serif",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                {i + 1}
              </div>
            ))}
          </div>
          <div style={{ flex: "1 1 320px" }}>
            <p className="muted" style={{ marginTop: 0 }}>
              {t('Kies een vak en sleep op de foto om het te tekenen. Het vak blijft dicht in de app tot de gekozen opdracht goed is.')}{" "}
              {t('Foto: {w} × {h} px.', { w: reveal.width, h: reveal.height })}
            </p>
            {reveal.pieces.map((piece, i) => (
              <div
                key={i}
                className="row"
                style={{
                  marginBottom: 8,
                  padding: 6,
                  borderRadius: 8,
                  border: `1px solid ${i === selected ? "#2f81f7" : "transparent"}`,
                }}
              >
                <div style={{ flex: "0 0 auto" }}>
                  <input
                    type="radio"
                    name={`${p.id}-sel`}
                    checked={i === selected}
                    onChange={() => setSelected(i)}
                    aria-label={t("Vak {n} kiezen", { n: i + 1 })}
                  />{" "}
                  {i + 1}
                </div>
                <div>
                  <label htmlFor={`${p.id}-task-${i}`}>{t('Opdracht')}</label>
                  <select
                    id={`${p.id}-task-${i}`}
                    value={piece.task}
                    onChange={(e) =>
                      setReveal({
                        ...reveal,
                        pieces: reveal.pieces.map((x, j) =>
                          j === i ? { ...x, task: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    {base.tasks.map((tk) => (
                      <option key={tk.id} value={tk.id}>
                        {tk.title[base.defaultLanguage] || tk.id} ({tk.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: "0 0 auto" }}>
                  <button
                    className="link"
                    onClick={() => {
                      setReveal({
                        ...reveal,
                        pieces: reveal.pieces.filter((_, j) => j !== i),
                      });
                      setSelected(0);
                    }}
                  >
                    {t('Weghalen')}
                  </button>
                </div>
              </div>
            ))}
            <button
              className="secondary"
              onClick={() => {
                const used = new Set(reveal.pieces.map((x) => x.task));
                const task =
                  base.tasks.find(
                    (tk) => !used.has(tk.id) && tk.tags.includes("oplossing"),
                  )?.id ??
                  base.tasks[0]?.id ??
                  "";
                setReveal({
                  ...reveal,
                  pieces: [...reveal.pieces, newPiece(reveal, task)],
                });
                setSelected(reveal.pieces.length);
              }}
            >
              {t('Vak toevoegen')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function cleanText(text: Text): Text {
  return Object.fromEntries(
    Object.entries(text)
      .filter(
        (e): e is [string, string] =>
          typeof e[1] === "string" && e[1].trim() !== "",
      )
      .map(([k, v]) => [k, v.trim()]),
  ) as Text;
}

function cleanPlayground(p: Playground): Playground {
  const body = cleanText(p.body ?? {});
  const out: Playground = { id: p.id, name: cleanText(p.name) };
  if (Object.keys(body).length) out.body = body;
  if (p.reveal) out.reveal = p.reveal;
  if (p.code) {
    out.code = {
      boxes: p.code.boxes.map((b) => ({ task: b.task, value: b.value.trim() })),
    };
    if (p.code.hint) out.code.hint = p.code.hint;
  }
  return out;
}

function textRows(key: string, field: string, text: Text) {
  return Object.entries(cleanText(text)).map(([lang, tk]) => ({
    entity: "playground" as const,
    entity_id: key,
    field,
    lang,
    text: tk,
  }));
}

/** Titel van een opdracht voor in een keuzelijst van de beheeromgeving. */
function taskOption(base: BaseGame, id: string): string {
  const tk = base.tasks.find((x) => x.id === id);
  return tk ? `${tk.title[base.defaultLanguage] || tk.id} (${tk.id})` : id;
}

/**
 * Zes vakjes voor de GPS-code en een hintveld. In de app staat alleen het
 * stukje code (of een vraagteken), geen puzzelnaam: zo werkt dezelfde opzet in
 * elk land, ook met andere of anders genoemde puzzels.
 */
function CodeEditor({
  base,
  playground: p,
  onChange,
}: {
  base: BaseGame;
  playground: Playground;
  onChange: (change: (p: Playground) => Playground) => void;
}) {
  const t = useT();
  const code = p.code;
  const setCode = (c: PlaygroundCode | undefined) =>
    onChange((pg) => {
      const { code: _c, ...rest } = pg;
      return c ? { ...rest, code: c } : rest;
    });
  const setBox = (i: number, change: Partial<PlaygroundCode["boxes"][number]>) =>
    code &&
    setCode({
      ...code,
      boxes: code.boxes.map((b, j) => (j === i ? { ...b, ...change } : b)),
    });

  return (
    <>
      <h3>{t("GPS-code in vakjes")}</h3>
      <p className="muted">
        {t("Elk vakje gaat in de app open zodra de gekozen opdracht goed is en toont dan zijn stukje code. Puzzelnamen staan er niet bij. Elke stad vult haar eigen code in; wat je hier invult, geldt voor steden die niets invullen.")}
      </p>
      {!code ? (
        <div className="actions" style={{ marginTop: 0 }}>
          <button
            className="secondary"
            onClick={() => setCode(initialCode(p.reveal, base.tasks))}
          >
            {p.reveal
              ? t("Omzetten naar codevakjes")
              : t("Codevakjes toevoegen")}
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: "1 1 360px" }}>
            {code.boxes.map((box, i) => (
              <div key={i} className="row" style={{ marginBottom: 8 }}>
                <div style={{ flex: "0 0 auto", paddingTop: 28 }}>
                  {i + 1}
                </div>
                <div>
                  <label htmlFor={`${p.id}-code-task-${i}`}>
                    {t("Opdracht")}
                  </label>
                  <select
                    id={`${p.id}-code-task-${i}`}
                    value={box.task}
                    onChange={(e) => setBox(i, { task: e.target.value })}
                  >
                    {base.tasks.map((tk) => (
                      <option key={tk.id} value={tk.id}>
                        {taskOption(base, tk.id)}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: "0 0 120px" }}>
                  <label htmlFor={`${p.id}-code-value-${i}`}>
                    {t("Code")}
                  </label>
                  <input
                    id={`${p.id}-code-value-${i}`}
                    value={box.value}
                    placeholder="53."
                    onChange={(e) => setBox(i, { value: e.target.value })}
                  />
                </div>
                <div style={{ flex: "0 0 auto", paddingTop: 28 }}>
                  <button
                    className="link"
                    onClick={() =>
                      setCode({
                        ...code,
                        boxes: code.boxes.filter((_, j) => j !== i),
                      })
                    }
                  >
                    {t("Weghalen")}
                  </button>
                </div>
              </div>
            ))}
            <div className="actions" style={{ marginTop: 0 }}>
              <button
                className="secondary"
                onClick={() =>
                  setCode({
                    ...code,
                    boxes: [
                      ...code.boxes,
                      { task: base.tasks[0]?.id ?? "", value: "" },
                    ],
                  })
                }
              >
                {t("Vakje toevoegen")}
              </button>
              <button className="link" onClick={() => setCode(undefined)}>
                {t("Codevakjes weghalen")}
              </button>
            </div>
            <label htmlFor={`${p.id}-code-hint`}>{t("Hintveld")}</label>
            <select
              id={`${p.id}-code-hint`}
              value={code.hint ?? ""}
              onChange={(e) => {
                const { hint: _h, ...rest } = code;
                setCode(e.target.value ? { ...rest, hint: e.target.value } : rest);
              }}
            >
              <option value="">{t("Geen hintveld")}</option>
              {base.tasks.map((tk) => (
                <option key={tk.id} value={tk.id}>
                  {taskOption(base, tk.id)}
                </option>
              ))}
            </select>
            <p className="muted">
              {t("Het hintveld toont de tekst van deze opdracht zodra die in het spel verschijnt. Een stad past die tekst aan bij de opdracht zelf.")}
            </p>
          </div>
          <CodePreview values={code.boxes.map((b) => b.value)} hint={!!code.hint} />
        </div>
      )}
    </>
  );
}

/** Zo ziet het tabblad er in de app uit als alles open is. */
function CodePreview({ values, hint }: { values: string[]; hint: boolean }) {
  const t = useT();
  const cell = {
    background: "#2e3845",
    border: "1px solid #e5963f",
    borderRadius: 6,
    color: "#f4f5f6",
    font: "800 22px sans-serif",
    minHeight: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as const;
  return (
    <div style={{ flex: "0 0 280px" }}>
      <p className="muted" style={{ marginTop: 0 }}>
        {t("Voorbeeld in de app, alles open")}
      </p>
      <div
        style={{
          background: "#252f3d",
          padding: 12,
          borderRadius: 12,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {values.map((v, i) => (
          <div key={i} style={cell}>
            {v || "?"}
          </div>
        ))}
        {hint ? (
          <div
            style={{
              ...cell,
              gridColumn: "1 / -1",
              font: "400 14px sans-serif",
              padding: 8,
            }}
          >
            {t("Hinttekst")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Een stad vult hier haar eigen GPS-code in de vakjes van het basisspel in.
 * Een leeg vakje neemt de code van het basisspel over.
 */
function CityCodes({
  gameId,
  chain,
  base,
  onSaved,
}: {
  gameId: string;
  chain: LayerRows[];
  base: BaseGame;
  onSaved: () => Promise<void>;
}) {
  const t = useT();
  const self = chain[chain.length - 1]!;
  const withCode = base.playgrounds.filter((p) => p.code);
  const stored = (self.overrides.find(
    (o) => o.task_id === null && o.field === "playgroundCodes",
  )?.value ?? {}) as PlaygroundCodes;
  const [values, setValues] = useState<PlaygroundCodes>(() =>
    Object.fromEntries(withCode.map((p) => [p.id, cityCodeValues(p.code!, stored[p.id])])),
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!withCode.length) return null;

  const allowed = chain[0]!.overridable.some(
    (o) =>
      o.task_id === null &&
      o.field === "playgroundCodes" &&
      o.layers.includes(self.game.layer),
  );
  if (!allowed)
    return (
      <p className="muted">
        {self.game.layer === "city"
          ? t("De GPS-code in de vakjes kun je pas per stad invullen als het basisspel is opgeslagen met codevakjes en deze stad die versie gebruikt.")
          : t("De GPS-code in de vakjes vult de stad in.")}
      </p>
    );

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const db = supabase();
      const clean = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, v.map((x) => x.trim())]),
      );
      const any = Object.values(clean).some((v) => v.some((x) => x));
      const del = await db
        .from("overrides")
        .delete()
        .eq("game_id", gameId)
        .is("task_id", null)
        .eq("field", "playgroundCodes");
      if (del.error) throw new Error(del.error.message);
      if (any) {
        const ins = await db.from("overrides").insert({
          game_id: gameId,
          task_id: null,
          field: "playgroundCodes",
          value: clean,
        });
        if (ins.error) throw new Error(ins.error.message);
      }
      setDirty(false);
      setMessage(t("Opgeslagen. Publiceer het spel om het in de app te zien."));
      await onSaved();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {withCode.map((p) => {
        const hint = p.code!.hint;
        return (
          <section key={p.id} className="card" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0 }}>
              {t("GPS-code: {name}", { name: p.name[base.defaultLanguage] || p.id })}
            </h2>
            <p className="muted">
              {t("Vul de GPS-code van het extractiepunt in deze stad in, één stukje per vakje. Een leeg vakje neemt de code van het basisspel over.")}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(p.code!.boxes.length, 3)}, minmax(0, 140px))`, gap: 8 }}>
              {p.code!.boxes.map((box, i) => (
                <div key={i}>
                  <label htmlFor={`${p.id}-city-code-${i}`}>
                    {t("Vakje {n}", { n: i + 1 })}
                  </label>
                  <input
                    id={`${p.id}-city-code-${i}`}
                    value={values[p.id]?.[i] ?? ""}
                    placeholder={box.value}
                    onChange={(e) => {
                      const next = [...(values[p.id] ?? [])];
                      next[i] = e.target.value;
                      setValues({ ...values, [p.id]: next });
                      setDirty(true);
                    }}
                  />
                </div>
              ))}
            </div>
            {hint ? (
              <p className="muted">
                {t("De hinttekst pas je aan bij de opdracht:")}{" "}
                <Link href={`/spellen/${gameId}/opdracht/${hint}`}>
                  {taskOption(base, hint)}
                </Link>
              </p>
            ) : null}
          </section>
        );
      })}
      <div className="actions">
        <button onClick={() => void save()} disabled={busy || !dirty}>
          {busy ? t("Bezig…") : dirty ? t("Opslaan") : t("Opgeslagen")}
        </button>
      </div>
      {message ? <p className="notice">{message}</p> : null}
    </>
  );
}
