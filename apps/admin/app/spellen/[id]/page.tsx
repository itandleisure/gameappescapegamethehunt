"use client";
import { CompositionError } from "@hunt/engine";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { LayerRows } from "@/lib/game-model";
import {
  createBaseVersion,
  loadBaseVersions,
  loadChain,
  publish,
  setCityBaseVersion,
  type BaseVersion,
} from "@/lib/game-store";
import { tKey } from "@/lib/i18n";
import { useLanguage } from "@/lib/language";
import { supabase } from "@/lib/supabase";

const LAYER_LABEL = {
  base: tKey("Basisspel"),
  city: tKey("Stad"),
  client: tKey("Klant"),
} as const;
const ANSWER_LABEL: Record<string, string> = {
  info: tKey("Info"),
  choice: tKey("Meerkeuze"),
  multi: tKey("Meerdere goed"),
  text: tKey("Tekst"),
  number: tKey("Getal"),
  photo: tKey("Foto"),
};

interface Version {
  id: string;
  version: number;
  published_at: string;
}

interface Child {
  id: string;
  slug: string;
  layer: "city" | "client";
  base_version: number | null;
}

function nl(
  rows: LayerRows,
  entity: string,
  id: string,
  field: string,
): string {
  const list = rows.translations.filter(
    (tk) => tk.entity === entity && tk.entity_id === id && tk.field === field,
  );
  return (
    (list.find((tk) => tk.lang === rows.game.default_language) ?? list[0])
      ?.text ?? ""
  );
}

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useLanguage();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [chain, setChain] = useState<LayerRows[] | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [baseVersions, setBaseVersions] = useState<BaseVersion[]>([]);
  const [versionNote, setVersionNote] = useState("");

  const load = useCallback(async () => {
    const db = supabase();
    try {
      const [c, v, k] = await Promise.all([
        loadChain(db, id),
        db
          .from("game_versions")
          .select("id, version, published_at")
          .eq("game_id", id)
          .order("version", { ascending: false }),
        db
          .from("games")
          .select("id, slug, layer, base_version")
          .eq("parent_id", id)
          .order("slug"),
      ]);
      setChain(c);
      setVersions((v.data ?? []) as Version[]);
      setChildren((k.data ?? []) as Child[]);
      setBaseVersions(await loadBaseVersions(db, c[0]!.game.id));
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!chain)
    return errors.length ? (
      <ul className="errors">
        {errors.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    ) : (
      <p className="muted">{t('Laden…')}</p>
    );

  const base = chain[0]!;
  const self = chain[chain.length - 1]!;
  const isBase = self.game.layer === "base";
  const legacy =
    isBase &&
    base.tasks.length === 0 &&
    (self.game.settings as { imported?: boolean }).imported;
  const title = isBase
    ? nl(base, "game", "", "name") || self.game.slug
    : self.game.slug;

  // Wat deze laag aanpast, per opdrachtsleutel.
  const changed = new Set<string>();
  if (!isBase) {
    const keyById = new Map(base.tasks.map((tk) => [tk.id, tk.key]));
    for (const tk of self.translations)
      if (tk.entity === "task") changed.add(tk.entity_id);
    for (const o of self.overrides)
      if (o.task_id) changed.add(keyById.get(o.task_id) ?? "");
    for (const l of self.locations) changed.add(keyById.get(l.task_id) ?? "");
  }

  const doPublish = async () => {
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      const version = await publish(supabase(), id);
      setNotice(
        t("Gepubliceerd als versie {n}. Nieuwe hunts kunnen deze versie kiezen.", { n: version }),
      );
      await load();
    } catch (err) {
      setErrors(
        err instanceof CompositionError
          ? err.issues
          : [err instanceof Error ? err.message : String(err)],
      );
    } finally {
      setBusy(false);
    }
  };

  // Versies van het basisspel: vastzetten (basisspel) en kiezen (stad).
  const city = chain.find((c) => c.game.layer === "city");
  const cityVersion = city?.game.base_version ?? null;
  const versionLabel = (v: BaseVersion) =>
    t("Versie {n}", { n: v.version }) +
    ` · ${new Date(v.created_at).toLocaleDateString(locale)}` +
    (v.note ? ` · ${v.note}` : "");

  const doCreateVersion = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      const n = await createBaseVersion(supabase(), id, versionNote);
      setVersionNote("");
      setNotice(
        t("Versie {n} vastgezet. Steden blijven op hun huidige versie tot je ze zelf overzet.", { n }),
      );
      await load();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  const doChooseVersion = async (value: string) => {
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      const version = value === "" ? null : Number(value);
      await setCityBaseVersion(supabase(), id, version);
      setNotice(
        (version === null
          ? t("Deze stad volgt nu de werkversie van het basisspel.")
          : t("Deze stad bouwt nu voort op versie {n} van het basisspel.", { n: version })) +
          " " +
          t("Publiceer de stad (en de klantvarianten eronder) opnieuw om dit in nieuwe hunts te gebruiken."),
      );
      await load();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      const r = await supabase().rpc("delete_game", { p_game: id });
      if (r.error) throw new Error(r.error.message);
      router.push("/spellen");
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
      setConfirmDelete(false);
      setBusy(false);
    }
  };

  const addTask = async (e: FormEvent) => {
    e.preventDefault();
    const key = newKey.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(key)) {
      setErrors([
        t("Gebruik voor de sleutel alleen kleine letters, cijfers en streepjes."),
      ]);
      return;
    }
    const position = Math.max(-1, ...base.tasks.map((tk) => tk.position)) + 1;
    const { error } = await supabase()
      .from("tasks")
      .insert({ game_id: id, key, position });
    if (error) setErrors([error.message]);
    else router.push(`/spellen/${id}/opdracht/${key}`);
  };

  const tasks = [...base.tasks].sort((a, b) => a.position - b.position);

  return (
    <>
      <p className="muted">
        <Link href="/spellen">{t('Spellen')}</Link>
        {chain.slice(0, -1).map((c) => (
          <span key={c.game.id}>
            {" "}
            › <Link href={`/spellen/${c.game.id}`}>{c.game.slug}</Link>
          </span>
        ))}
      </p>
      <h1>{title}</h1>
      <p className="muted">
        {t(LAYER_LABEL[self.game.layer])} · {self.game.slug} · {t("talen")}{" "}
        {self.game.languages.join(", ").toUpperCase()}
      </p>

      <div className="actions">
        <button
          onClick={() => void doPublish()}
          disabled={busy || Boolean(legacy)}
        >
          {busy ? t("Bezig…") : t("Publiceren")}
        </button>
        {!legacy && self.game.layer !== "client" ? (
          <Link
            href={`/spellen/${id}/kaart`}
            className="filebutton"
            style={{
              background: "transparent",
              color: "var(--text)",
              border: "1px solid var(--line)",
            }}
          >
            {t('Kaart')}
          </Link>
        ) : null}
        {!legacy ? (
          <Link
            href={`/spellen/${id}/overlay`}
            className="filebutton"
            style={{
              background: "transparent",
              color: "var(--text)",
              border: "1px solid var(--line)",
            }}
          >
            {t('Kaartstijl en overlay')}
          </Link>
        ) : null}
        {isBase && !legacy ? (
          <Link
            href={`/spellen/${id}/tabbladen`}
            className="filebutton"
            style={{
              background: "transparent",
              color: "var(--text)",
              border: "1px solid var(--line)",
            }}
          >
            {t('Tabbladen')}
          </Link>
        ) : null}
        {isBase && !legacy ? (
          <Link
            href={`/spellen/${id}/regels`}
            className="filebutton"
            style={{
              background: "transparent",
              color: "var(--text)",
              border: "1px solid var(--line)",
            }}
          >
            {t('Regels')}
          </Link>
        ) : null}
        {versions[0] ? (
          <span className="muted">
            {t("Laatste versie: v{n} van {date}", {
              n: versions[0].version,
              date: new Date(versions[0].published_at).toLocaleString(locale),
            })}
          </span>
        ) : (
          <span className="muted">{t('Nog niet gepubliceerd.')}</span>
        )}
      </div>
      {notice ? <p className="notice">{notice}</p> : null}
      {errors.length > 0 ? (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}

      {legacy ? (
        <p className="card">
          {t('Dit spel is als kant-en-klaar spelpakket geïmporteerd en heeft daarom geen losse opdrachten om te bewerken. Je kunt er wel hunts mee maken. Importeer het spel opnieuw als bundel om het te bewerken.')}
        </p>
      ) : null}

      {isBase && !legacy ? (
        <section className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>{t("Versies van het basisspel")}</h2>
          <p className="muted">
            {t("Wat je hier aanpast, is de werkversie. Zet een nieuwe versie vast als de wijzigingen klaar zijn. Daarna kies je per stad wanneer die overgaat.")}
          </p>
          {baseVersions.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("Versie")}</th>
                    <th>{t("Vastgezet")}</th>
                    <th>{t("Steden")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...baseVersions.map((v) => ({
                      key: String(v.version),
                      name: t("Versie {n}", { n: v.version }),
                      when:
                        new Date(v.created_at).toLocaleDateString(locale) +
                        (v.note ? ` · ${v.note}` : ""),
                      version: v.version as number | null,
                    })),
                    { key: "werk", name: t("Werkversie"), when: "–", version: null },
                  ].map((row) => {
                    const used = children.filter(
                      (c) => c.layer === "city" && c.base_version === row.version,
                    );
                    // De werkversie alleen tonen als er een stad op staat.
                    if (row.version === null && used.length === 0) return null;
                    return (
                      <tr key={row.key}>
                        <td>
                          <strong>{row.name}</strong>
                        </td>
                        <td className="muted">{row.when}</td>
                        <td>
                          <strong>
                            {used.length === 1
                              ? t("1 stad")
                              : t("{n} steden", { n: used.length })}
                          </strong>
                          {used.length > 0 ? (
                            <div className="muted">
                              {used.map((c, i) => (
                                <span key={c.id}>
                                  {i > 0 ? ", " : ""}
                                  <Link href={`/spellen/${c.id}`}>{c.slug}</Link>
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">{t("Nog geen versies vastgezet.")}</p>
          )}
          <form className="row" onSubmit={doCreateVersion}>
            <div>
              <label htmlFor="version-note">{t("Wat is er nieuw? (optioneel)")}</label>
              <input
                id="version-note"
                value={versionNote}
                maxLength={500}
                onChange={(e) => setVersionNote(e.target.value)}
                placeholder={t("Bijvoorbeeld: nieuwe puzzel bij het extractiepunt")}
              />
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <button type="submit" disabled={busy}>
                {busy
                  ? t("Bezig…")
                  : t("Versie {n} vastzetten", {
                      n: (baseVersions[0]?.version ?? 0) + 1,
                    })}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {self.game.layer === "city" ? (
        <section className="card" style={{ marginTop: 16 }}>
          <label htmlFor="base-version">{t("Versie van het basisspel")}</label>
          <select
            id="base-version"
            value={cityVersion === null ? "" : String(cityVersion)}
            disabled={busy}
            onChange={(e) => void doChooseVersion(e.target.value)}
          >
            {baseVersions.map((v) => (
              <option key={v.version} value={String(v.version)}>
                {versionLabel(v)}
                {v.version === baseVersions[0]?.version ? ` (${t("nieuwste")})` : ""}
              </option>
            ))}
            <option value="">{t("Werkversie (altijd de laatste wijzigingen, voor testen)")}</option>
          </select>
          <p className="muted" style={{ marginBottom: 0 }}>
            {cityVersion !== null &&
            baseVersions[0] &&
            baseVersions[0].version > cityVersion
              ? t("Er is een nieuwere versie van het basisspel: versie {n}. Kies die hierboven om deze stad over te zetten.", { n: baseVersions[0].version })
              : t("Nieuwe versies van het basisspel komen pas in deze stad als je ze hier kiest.")}
          </p>
        </section>
      ) : null}

      {self.game.layer === "client" && city ? (
        <p className="muted">
          {cityVersion === null
            ? t("Volgt de stad {city}, die de werkversie van het basisspel gebruikt.", { city: city.game.slug })
            : t("Volgt de stad {city}: versie {n} van het basisspel.", { city: city.game.slug, n: cityVersion })}
        </p>
      ) : null}

      {children.length > 0 ? (
        <>
          <h2>{isBase ? t("Steden") : t("Klantvarianten")}</h2>
          <ul>
            {children.map((c) => (
              <li key={c.id}>
                <Link href={`/spellen/${c.id}`}>{c.slug}</Link>{" "}
                <span className="muted">
                  ({t(LAYER_LABEL[c.layer])}
                  {c.layer === "city"
                    ? ` · ${c.base_version === null ? t("werkversie") : t("versie {n}", { n: c.base_version })}`
                    : ""}
                  )
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {!legacy ? (
        <>
          <h2>{t('Opdrachten')}</h2>
          {!isBase ? (
            <p className="muted">
              {self.game.layer === "city"
                ? t("Een stad past alleen de aanpasbare velden aan. Opdrachten met een stip zijn in deze variant aangepast.")
                : t("Een klant past alleen de aanpasbare velden aan. Opdrachten met een stip zijn in deze variant aangepast.")}
            </p>
          ) : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('Opdracht')}</th>
                  <th>{t('Antwoord')}</th>
                  <th>{t('Punten')}</th>
                  <th>{t('Locatie')}</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((tk) => {
                  const located = chain.some((c) =>
                    c.locations.some((l) => l.task_id === tk.id),
                  );
                  return (
                    <tr key={tk.id}>
                      <td>
                        <Link href={`/spellen/${id}/opdracht/${tk.key}`}>
                          <strong>
                            {nl(base, "task", tk.key, "title") || tk.key}
                          </strong>
                        </Link>
                        {changed.has(tk.key) ? (
                          <span
                            className="badge test"
                            style={{ marginLeft: 8 }}
                          >
                            {t('aangepast')}
                          </span>
                        ) : null}
                        <div className="muted">{tk.key}</div>
                      </td>
                      <td>
                        {ANSWER_LABEL[String(tk.answer.type)]
                          ? t(ANSWER_LABEL[String(tk.answer.type)]!)
                          : String(tk.answer.type)}
                      </td>
                      <td>{tk.points}</td>
                      <td>{located ? t("Ja") : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isBase ? (
            <form className="row" onSubmit={addTask} style={{ marginTop: 16 }}>
              <div>
                <label htmlFor="key">{t('Nieuwe opdracht (sleutel)')}</label>
                <input
                  id="key"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="puzzel-kompas"
                />
              </div>
              <div style={{ flex: "0 0 auto" }}>
                <button type="submit">{t('Toevoegen')}</button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}

      <section className="card" style={{ marginTop: 32 }}>
        <h2 style={{ marginTop: 0 }}>{t('Spel verwijderen')}</h2>
        <p className="muted">
          {t('Verwijdert dit spel met alle opdrachten, versies en testhunts. Een spel met varianten eronder of met echte hunts (geen testhunt) kan niet weg. Dit is niet terug te draaien.')}
        </p>
        {confirmDelete ? (
          <div className="actions">
            <span>{t("Weet je zeker dat je {name} wilt verwijderen?", { name: self.game.slug })}</span>
            <button
              className="danger"
              onClick={() => void doDelete()}
              disabled={busy}
            >
              {busy ? t("Bezig…") : t("Ja, verwijderen")}
            </button>
            <button
              className="secondary"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
            >
              {t('Annuleren')}
            </button>
          </div>
        ) : (
          <button
            className="secondary"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
          >
            {t('Spel verwijderen')}
          </button>
        )}
      </section>
    </>
  );
}
