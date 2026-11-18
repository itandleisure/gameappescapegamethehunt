"use client";
import {
  composeGame,
  type BaseGame,
  type Playground,
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
  type ChangeEvent,
  type PointerEvent,
} from "react";
import { rowsToBase, type LayerRows } from "@/lib/game-model";
import { loadChain } from "@/lib/game-store";
import { t as tr } from "@/lib/i18n";
import { useT } from "@/lib/language";
import { mediaPath } from "@/lib/map-settings";
import {
  newPiece,
  playgroundKey,
  rectBetween,
  toImagePoint,
} from "@/lib/playgrounds";
import { supabase } from "@/lib/supabase";

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
  /** Reeks met speluitleg die teams vóór een centrale start lezen. */
  const [briefing, setBriefing] = useState("");
  const [newName, setNewName] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await loadChain(supabase(), id);
      const b = rowsToBase(c[0]!);
      setChain(c);
      setBase(b);
      setList(b.playgrounds);
      setKnown(new Set(b.playgrounds.map((p) => p.id)));
      setBriefing(b.briefing ?? "");
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
      if (briefing) settings.briefing = briefing;
      else delete settings.briefing;
      must(await db.from("games").update({ settings }).eq("id", id));
      setNotice(t("Opgeslagen. Publiceer het spel om het in de app te zien."));
      await load();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="muted">
        <Link href="/spellen">{t('Spellen')}</Link> ›{" "}
        <Link href={`/spellen/${id}`}>{self.game.slug}</Link> › {t("Tabbladen")}
      </p>
      <h1>{t('Tabbladen')}</h1>
      <p className="muted">
        {t('Tabbladen staan in de app onder Opdrachten, zoals Speluitleg en Extractiepunt. Een tabblad kan een naslagtekst hebben (per taal) en een foto met afgedekte vakken: elk vak wordt zichtbaar zodra de opdracht die erbij hoort goed is. Gelezen uitleg verdwijnt uit de lijst; de naslagtekst blijft hier staan.')}
      </p>
      {!isBase ? (
        <p className="notice">
          {t("Tabbladen stel je in bij het basisspel:")}{" "}
          <Link href={`/spellen/${chain[0]!.game.id}/tabbladen`}>
            {chain[0]!.game.slug}
          </Link>
          .
        </p>
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

          <section className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>{t('Speluitleg vóór de start')}</h2>
            <p className="muted">
              {t("Bij een hunt met centrale start lezen teams deze uitleg terwijl ze wachten. Pas als iedereen klaar is, start de spelleider het spel. De gelezen uitleg telt dan bij de start als afgerond.")}
            </p>
            <label htmlFor="briefing">{t('Reeks')}</label>
            <select
              id="briefing"
              value={briefing}
              onChange={(e) => {
                setBriefing(e.target.value);
                setDirty(true);
              }}
            >
              <option value="">{t('Geen (uitleg tijdens het spel)')}</option>
              {base.sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} ({t("{n} schermen", { n: s.tasks.length })})
                </option>
              ))}
            </select>
          </section>

          {list.map((p) => (
            <PlaygroundCard
              key={p.id}
              gameId={id}
              base={base}
              playground={p}
              onChange={(change) => update(p.id, change)}
              onError={(e) => setErrors([e])}
            />
          ))}

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
        </>
      )}
    </>
  );
}

function PlaygroundCard({
  gameId,
  base,
  playground: p,
  onChange,
  onError,
}: {
  gameId: string;
  base: BaseGame;
  playground: Playground;
  onChange: (change: (p: Playground) => Playground) => void;
  onError: (message: string) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
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

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const size = await imageSize(file);
      const db = supabase();
      const path = mediaPath(gameId, `playground-${p.id}`, file.type);
      const up = await db.storage
        .from("media")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw new Error(up.error.message);
      const url = db.storage.from("media").getPublicUrl(path).data.publicUrl;
      // Een foto met dezelfde verhouding houdt zijn vakken; anders schalen we ze mee.
      const old = reveal;
      const sx = old ? size.width / old.width : 1;
      const sy = old ? size.height / old.height : 1;
      const pieces = (old?.pieces ?? []).map((piece) => ({
        ...piece,
        x: Math.round(piece.x * sx),
        y: Math.round(piece.y * sy),
        w: Math.round(piece.w * sx),
        h: Math.round(piece.h * sy),
      }));
      setReveal({ image: url, width: size.width, height: size.height, pieces });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

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
      <div className="row">
        {base.languages.map((lang) => (
          <div key={lang}>
            <label htmlFor={`${p.id}-name-${lang}`}>
              {t("Naam ({lang})", { lang: lang.toUpperCase() })}
            </label>
            <input
              id={`${p.id}-name-${lang}`}
              value={p.name[lang] ?? ""}
              onChange={(e) => setText("name", lang, e.target.value)}
            />
          </div>
        ))}
      </div>

      <h3>{t('Naslagtekst')}</h3>
      <p className="muted">
        {t('Staat altijd bovenaan dit tabblad, bijvoorbeeld de tijdlijn van het spel.')}
      </p>
      {base.languages.map((lang) => (
        <div key={lang}>
          <label htmlFor={`${p.id}-body-${lang}`}>
            {t("Tekst ({lang})", { lang: lang.toUpperCase() })}
          </label>
          <textarea
            id={`${p.id}-body-${lang}`}
            rows={6}
            value={p.body?.[lang] ?? ""}
            onChange={(e) => setText("body", lang, e.target.value)}
          />
        </div>
      ))}

      <h3>{t('Foto met afgedekte vakken')}</h3>
      <div className="actions" style={{ marginTop: 0 }}>
        <label className={`filebutton${busy ? " disabled" : ""}`}>
          {busy ? t("Bezig…") : reveal ? t("Andere foto") : t("Foto uploaden")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => void upload(e)}
            disabled={busy}
          />
        </label>
        {reveal ? (
          <button className="link" onClick={() => setReveal(undefined)}>
            {t('Foto weghalen')}
          </button>
        ) : null}
      </div>
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
                  border: `2px solid ${i === selected ? "#2f81f7" : "#f5a524"}`,
                  color: "#f5a524",
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
      ) : (
        <p className="muted">{t('Geen foto op dit tabblad.')}</p>
      )}
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

function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () =>
      reject(new Error(tr("Deze afbeelding kan niet worden gelezen.")));
    img.src = url;
  });
}
