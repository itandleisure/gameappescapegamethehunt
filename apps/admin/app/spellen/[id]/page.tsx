"use client";
import { GameIdField } from "@/editor/GameIdField";
import { GAME_LANGUAGES, gameLanguageList, gameLanguageName, gameLanguageShort, gameLanguageTag, languageName } from "@/lib/game-languages";
import { CompositionError } from "@hunt/engine";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { LayerRows } from "@/lib/game-model";
import {
  loadBaseVersions,
  loadChain,
  liveSessionsSummary,
  publishLive,
  type LiveSessions,
  setCityBaseVersion,
  versionLabel,
  type BaseVersion,
} from "@/lib/game-store";
import { GameNav } from "@/editor/GameNav";
import { TemplateVersions } from "@/editor/TemplateVersions";
import { CITY_TODOS, setupHref, todoState, type TodoKey } from "@/lib/city-rollout";
import {
  baseName,
  cleanName,
  displayName,
  variantName,
  type NameByLang,
} from "@/lib/game-name";
import { tKey } from "@/lib/i18n";
import { useLanguage } from "@/lib/language";
import { supabase } from "@/lib/supabase";
import { missingPerTask, newTranslationRows, sourceLanguage, taskLanguageStates } from "@/lib/task-translate";
import { PartialTranslation, translateTexts } from "@/lib/translate-client";

const LAYER_LABEL = {
  base: tKey("Template"),
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
  settings: Record<string, unknown>;
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
  /** Net uitgerold vanuit "Nieuwe stad uitrollen". */
  const [justCreated, setJustCreated] = useState(false);
  useEffect(() => {
    setJustCreated(new URLSearchParams(window.location.search).get("nieuw") === "1");
  }, []);
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
  /** Naam per taal terwijl die wordt aangepast; null als het formulier dicht is. */
  const [nameDraft, setNameDraft] = useState<NameByLang | null>(null);
  /** Voortgang van "Alle opdrachten vertalen". */
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  /** Open tickets die bij publiceren live bijgewerkt kunnen worden. */
  const [live, setLive] = useState<LiveSessions | null>(null);
  const [updateLive, setUpdateLive] = useState(false);

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
          .select("id, slug, layer, base_version, settings")
          .eq("parent_id", id)
          .order("slug"),
      ]);
      setChain(c);
      setVersions((v.data ?? []) as Version[]);
      setChildren((k.data ?? []) as Child[]);
      setBaseVersions(await loadBaseVersions(db, c[0]!.game.id));
      setLive(c[c.length - 1]!.game.layer === "base" ? null : await liveSessionsSummary(db, id));
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
  const title = displayName(self.game, self.translations);

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
      const { version, updated } = await publishLive(supabase(), id, updateLive && (live?.sessions ?? 0) > 0);
      setNotice(
        updated > 0
          ? t("Gepubliceerd als versie {n}. {count} lopende tickets zijn bijgewerkt: de spelers krijgen binnen een halve minuut de melding “Spel bijgewerkt” en spelen verder met hun voortgang.", { n: version, count: updated })
          : t("Gepubliceerd als versie {n}. Nieuwe tickets kunnen deze versie kiezen.", { n: version }),
      );
      setUpdateLive(false);
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
  const versionOption = (v: BaseVersion) =>
    versionLabel(v) +
    ` · ${new Date(v.created_at).toLocaleDateString(locale)}` +
    (v.note ? ` · ${v.note.split("\n")[0]}` : "");
  const versionText = (n: number | null) => {
    const v = baseVersions.find((x) => x.version === n);
    return n === null ? t("werkversie") : v ? versionLabel(v) : t("versie {n}", { n });
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
          : t("Deze stad bouwt nu voort op {version}.", { version: versionText(version) })) +
          " " +
          t("Publiceer de stad (en de klantvarianten eronder) opnieuw om dit in nieuwe tickets te gebruiken."),
      );
      await load();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  // Nog te doen bij een nieuwe stad: afvinken slaat meteen op.
  const todo = todoState(self.game.settings);
  const toggleTodo = async (key: TodoKey, done: boolean) => {
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      const settings = { ...self.game.settings, todo: { ...todo, [key]: done } };
      const r = await supabase().from("games").update({ settings }).eq("id", id);
      if (r.error) throw new Error(r.error.message);
      await load();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };

  const openName = () => {
    setErrors([]);
    setNotice(null);
    setNameDraft(isBase ? baseName(self) : variantName(self.game));
  };

  const doSaveName = async (e: FormEvent) => {
    e.preventDefault();
    if (!nameDraft) return;
    const name = cleanName(nameDraft, self.game.languages);
    const main = self.game.default_language;
    if (!name[main]) {
      setErrors([t("De naam in {lang} is verplicht.", { lang: languageName(main) })]);
      return;
    }
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      const db = supabase();
      const must = (r: { error: { message: string } | null }) => {
        if (r.error) throw new Error(r.error.message);
      };
      if (isBase) {
        // De naam in de app staat per taal in translations.
        must(
          await db
            .from("translations")
            .delete()
            .eq("game_id", id)
            .eq("entity", "game")
            .eq("entity_id", "")
            .eq("field", "name"),
        );
        must(
          await db.from("translations").insert(
            Object.entries(name).map(([lang, text]) => ({
              game_id: id,
              entity: "game",
              entity_id: "",
              field: "name",
              lang,
              text,
            })),
          ),
        );
      } else {
        must(
          await db
            .from("games")
            .update({ settings: { ...self.game.settings, name } })
            .eq("id", id),
        );
      }
      setNameDraft(null);
      setNotice(
        isBase
          ? t("Naam opgeslagen. Sla de template op als nieuwe versie en zet de steden over om de nieuwe naam in nieuwe tickets te zien. Tickets die al bestaan, houden hun oude naam.")
          : t("Naam opgeslagen."),
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

  /** Basisspel: een speltaal erbij. Daarna kun je de opdrachten automatisch laten vertalen. */
  const doAddLanguage = async (lang: string) => {
    if (!lang || self.game.languages.includes(lang)) return;
    setBusy(true);
    setErrors([]);
    setNotice(null);
    const { error } = await supabase()
      .from("games")
      .update({ languages: [...self.game.languages, lang] })
      .eq("id", id);
    setBusy(false);
    if (error) {
      setErrors([error.message]);
      return;
    }
    setNotice(
      (isBase ? t("{lang} toegevoegd. Vertaal nu de opdrachten (knop bij Opdrachten) en sla de template daarna op als nieuwe versie.", {
        lang: gameLanguageName(lang),
      }) : t("{lang} toegevoegd. Vertaal nu de opdrachten (knop bij Opdrachten) en publiceer daarna het spel.", {
        lang: gameLanguageName(lang),
      })),
    );
    await load();
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
  const source = sourceLanguage(base.game.languages, base.game.default_language);
  const targets = base.game.languages.filter((l) => l !== source);

  /** Basisspel: alle lege vertalingen van alle opdrachten vullen vanuit het Nederlands. */
  const doTranslateAll = async () => {
    const todo = missingPerTask(base.translations, tasks.map((tk) => tk.key), source, targets);
    setErrors([]);
    setNotice(null);
    if (todo.size === 0) {
      setNotice(t("Alle opdrachten zijn al vertaald."));
      return;
    }
    const order = tasks.map((tk) => tk.key).filter((k) => todo.has(k));
    setBusy(true);
    setBulk({ done: 0, total: order.length });
    let added = 0;
    try {
      for (const [i, key] of order.entries()) {
        let result;
        let partial: PartialTranslation | null = null;
        try {
          result = await translateTexts(source, targets, todo.get(key)!);
        } catch (err) {
          if (!(err instanceof PartialTranslation)) throw err;
          // Wat wel gelukt is opslaan, daarna stoppen met de melding.
          result = err.translations;
          partial = err;
        }
        const rows = newTranslationRows(base.translations, key, result);
        if (rows.length) {
          const { error } = await supabase()
            .from("translations")
            .insert(rows.map((r) => ({ ...r, game_id: id })));
          if (error) throw new Error(error.message);
          added += rows.length;
        }
        if (partial) throw partial;
        setBulk({ done: i + 1, total: order.length });
      }
      setNotice(
        (isBase ? t("{n} opdrachten vertaald ({rows} teksten). Controleer ze in de opdrachten en sla de template daarna op als nieuwe versie.", {
          n: order.length,
          rows: added,
        }) : t("{n} opdrachten vertaald ({rows} teksten). Controleer ze in de opdrachten en publiceer daarna het spel.", {
          n: order.length,
          rows: added,
        })),
      );
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
      setBulk(null);
      await load();
    }
  };

  return (
    <>
      <p className="muted">
        {isBase ? <Link href="/templates">{t('Templates')}</Link> : <Link href="/spellen">{t('Spellen')}</Link>}
        {chain.slice(0, -1).map((c) => (
          <span key={c.game.id}>
            {" "}
            › <Link href={`/spellen/${c.game.id}`}>{displayName(c.game, c.translations)}</Link>
          </span>
        ))}
      </p>
      <h1>{title}</h1>
      <p className="muted">
        {t(LAYER_LABEL[self.game.layer])} · {self.game.slug} · {t("talen")}{" "}
        {gameLanguageList(self.game.languages)}
        {nameDraft ? null : (
          <>
            {" · "}
            <button type="button" className="link small" onClick={openName}>
              {t("Naam aanpassen")}
            </button>
          </>
        )}
        {isBase && !nameDraft && !legacy ? (
          <>
            {" · "}
            <select
              aria-label={t("Taal toevoegen")}
              value=""
              disabled={busy}
              onChange={(e) => void doAddLanguage(e.target.value)}
              style={{ width: "auto", display: "inline-block", padding: "2px 6px" }}
            >
              <option value="">{t("Taal toevoegen")}…</option>
              {GAME_LANGUAGES.filter((l) => !self.game.languages.includes(l)).map((l) => (
                <option key={l} value={l}>
                  {gameLanguageName(l)}
                </option>
              ))}
            </select>
          </>
        ) : null}
      </p>
      {isBase ? null : <GameIdField gameId={self.game.id} />}
      {nameDraft ? (
        <form className="card" onSubmit={doSaveName} style={{ marginBottom: 16 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            {isBase
              ? t("Dit is de naam die spelers in de app zien.")
              : t("Dit is de naam in de beheeromgeving, bijvoorbeeld bij het kiezen van een spel voor een nieuw ticket. Spelers zien de naam van het basisspel.")}
          </p>
          <div className="row">
            {self.game.languages.map((lang) => (
              <div key={lang}>
                <label htmlFor={`name-${lang}`}>
                  {t("Naam")} ({gameLanguageShort(lang)})
                </label>
                <input
                  id={`name-${lang}`}
                  value={nameDraft[lang] ?? ""}
                  maxLength={120}
                  required={lang === self.game.default_language}
                  onChange={(e) => setNameDraft({ ...nameDraft, [lang]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? t("Bezig…") : t("Opslaan")}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setNameDraft(null)}
              disabled={busy}
            >
              {t("Annuleren")}
            </button>
          </div>
        </form>
      ) : null}

      <GameNav
        id={id}
        layer={self.game.layer}
        legacy={Boolean(legacy)}
        active="overzicht"
        // Een template legt zijn versies vast met de templateversies hieronder;
        // publiceren (een versie waar hunts mee spelen) hoort bij een stad of klant.
        before={
          isBase ? null : (
            <>
              <button onClick={() => void doPublish()} disabled={busy}>
                {busy ? t("Bezig…") : t("Publiceren")}
              </button>
              {live && live.sessions > 0 ? (
                <label
                  style={{ display: "inline-flex", gap: 6, alignItems: "center", fontWeight: "normal" }}
                  title={t("De open tickets van dit spel krijgen meteen de nieuwe versie. Opgeloste opdrachten, punten en tijd blijven bewaard.")}
                >
                  <input type="checkbox" checked={updateLive} disabled={busy} onChange={(e) => setUpdateLive(e.target.checked)} />
                  {t("Ook lopende spelers bijwerken ({sessions} open tickets, {teams} teams spelen nu)", {
                    sessions: live.sessions,
                    teams: live.teams,
                  })}
                </label>
              ) : null}
            </>
          )
        }
        after={
          isBase ? null : versions[0] ? (
            <span className="muted">
              {t("Laatste versie: v{n} van {date}", {
                n: versions[0].version,
                date: new Date(versions[0].published_at).toLocaleString(locale),
              })}
            </span>
          ) : (
            <span className="muted">{t('Nog niet gepubliceerd.')}</span>
          )
        }
      />
      {notice ? <p className="notice">{notice}</p> : null}
      {errors.length > 0 ? (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}

      {self.game.layer === "city" && todo ? (
        <section className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>
            {t("Stappenplan voor deze stad")}{" "}
            <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>
              {t("{done} van {n} klaar", {
                done: CITY_TODOS.filter((td) => todo[td.key]).length,
                n: CITY_TODOS.length,
              })}
            </span>
          </h2>
          {justCreated ? (
            <p className="notice">
              {t("De stad is aangemaakt. Loop het stappenplan door om de stad in te richten.")}
            </p>
          ) : null}
          {(() => {
            const next = CITY_TODOS.find((td) => !todo[td.key]);
            return next ? (
              <p>
                <Link href={setupHref(id, next.key)} className="button">
                  {CITY_TODOS.some((td) => todo[td.key])
                    ? t("Verder met het stappenplan")
                    : t("Start het stappenplan")}
                </Link>
              </p>
            ) : null;
          })()}
          {CITY_TODOS.map((td, i) => (
            <div key={td.key} className="check" style={{ margin: "6px 0" }}>
              <input
                type="checkbox"
                id={`todo-${td.key}`}
                checked={Boolean(todo[td.key])}
                disabled={busy}
                onChange={(e) => void toggleTodo(td.key, e.target.checked)}
              />
              <label
                htmlFor={`todo-${td.key}`}
                style={{
                  margin: 0,
                  fontWeight: 400,
                  fontSize: 15,
                  textDecoration: todo[td.key] ? "line-through" : undefined,
                  color: todo[td.key] ? "var(--muted)" : undefined,
                }}
              >
                {i + 1}. {t(td.label)}
              </label>
              <Link href={setupHref(id, td.key)} className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
                {t("openen")}
              </Link>
            </div>
          ))}
        </section>
      ) : null}

      {legacy ? (
        <p className="card">
          {t('Dit spel is als kant-en-klaar spelpakket geïmporteerd en heeft daarom geen losse opdrachten om te bewerken. Je kunt er wel tickets mee maken. Importeer het spel opnieuw als bundel om het te bewerken.')}
        </p>
      ) : null}

      {isBase && !legacy ? (
        <TemplateVersions
          baseId={id}
          versions={baseVersions}
          cities={children.map((c) => ({ ...c, name: displayName(c) }))}
          onChanged={async (message) => {
            setErrors([]);
            setNotice(message);
            await load();
          }}
          onError={(message) => {
            setNotice(null);
            setErrors([message]);
          }}
        />
      ) : null}

      {self.game.layer === "city" ? (
        <section className="card" style={{ marginTop: 16 }}>
          <label htmlFor="base-version">{t("Templateversie")}</label>
          <select
            id="base-version"
            value={cityVersion === null ? "" : String(cityVersion)}
            disabled={busy}
            onChange={(e) => void doChooseVersion(e.target.value)}
          >
            {baseVersions.map((v) => (
              <option key={v.version} value={String(v.version)}>
                {versionOption(v)}
                {v.version === baseVersions[0]?.version ? ` (${t("nieuwste")})` : ""}
              </option>
            ))}
            <option value="">{t("Werkversie (altijd de laatste wijzigingen, voor testen)")}</option>
          </select>
          <p className="muted" style={{ marginBottom: 0 }}>
            {cityVersion !== null &&
            baseVersions[0] &&
            baseVersions[0].version > cityVersion
              ? t("Er is een nieuwere versie van het basisspel: {version}. Kies die hierboven om deze stad over te zetten.", { version: versionLabel(baseVersions[0]) })
              : t("Nieuwe versies van het basisspel komen pas in deze stad als je ze hier kiest.")}
          </p>
        </section>
      ) : null}

      {self.game.layer === "client" && city ? (
        <p className="muted">
          {cityVersion === null
            ? t("Volgt de stad {city}, die de werkversie van het basisspel gebruikt.", { city: city.game.slug })
            : t("Volgt de stad {city}: {version}.", { city: city.game.slug, version: versionText(cityVersion) })}
        </p>
      ) : null}

      {children.length > 0 ? (
        <>
          <h2>{isBase ? t("Steden") : t("Klantvarianten")}</h2>
          <ul>
            {children.map((c) => (
              <li key={c.id}>
                <Link href={`/spellen/${c.id}`}>{displayName(c)}</Link>{" "}
                <span className="muted">
                  ({c.slug} · {t(LAYER_LABEL[c.layer])}
                  {c.layer === "city"
                    ? ` · ${versionText(c.base_version)}`
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
          <h2 id="opdrachten">{t('Opdrachten')}</h2>
          {isBase && targets.length > 0 && tasks.length > 0 ? (
            <div className="actions" style={{ marginTop: 0, marginBottom: 12 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => void doTranslateAll()}
                disabled={busy}
              >
                {bulk
                  ? t("Vertalen… {done} van {n}", { done: bulk.done, n: bulk.total })
                  : t("Alle opdrachten vertalen vanuit het Nederlands")}
              </button>
              <span className="muted small">
                {t("Vult alleen lege vertalingen in ({langs}); wat er al staat blijft staan.", {
                  langs: gameLanguageList(targets),
                })}
              </span>
            </div>
          ) : null}
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
                  {base.game.languages.length > 1 ? <th>{t('Talen')}</th> : null}
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
                      {base.game.languages.length > 1 ? (
                        <td>
                          <span className="langstate">
                            {Object.entries(
                              taskLanguageStates(base.translations, tk.key, source, base.game.languages),
                            ).map(([lang, state]) => (
                              <span
                                key={lang}
                                className={state}
                                title={
                                  state === "done"
                                    ? t("{lang}: vertaald", { lang: gameLanguageName(lang) })
                                    : state === "partial"
                                      ? t("{lang}: deels vertaald", { lang: gameLanguageName(lang) })
                                      : t("{lang}: nog niet vertaald", { lang: gameLanguageName(lang) })
                                }
                              >
                                {state === "done" ? "✓" : state === "partial" ? "◐" : "○"} {gameLanguageTag(lang)}
                              </span>
                            ))}
                          </span>
                        </td>
                      ) : null}
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
          {t('Verwijdert dit spel met alle opdrachten, versies en testtickets. Een spel met varianten eronder of met echte tickets (geen testticket) kan niet weg. Dit is niet terug te draaien.')}
        </p>
        {confirmDelete ? (
          <div className="actions">
            <span>{t("Weet je zeker dat je {name} wilt verwijderen?", { name: title })}</span>
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
