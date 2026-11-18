"use client";
import { composeGame, CompositionError, type Rule } from "@hunt/engine";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  actionsToRow,
  rowsToBase,
  type LayerRows,
  type TranslationRow,
} from "@/lib/game-model";
import { loadChain } from "@/lib/game-store";
import { useT } from "@/lib/language";
import {
  describeRule,
  formatDuration,
  parseRule,
  relabel,
  settingSeconds,
  settingValue,
  splitDuration,
  timeSettings,
  withTimes,
} from "@/lib/rules";
import { supabase } from "@/lib/supabase";
import { GameNav } from '@/editor/GameNav';

interface Draft {
  id: string;
  label: string;
  when: string;
  then: string;
  isNew: boolean;
}

const pretty = (v: unknown) => JSON.stringify(v, null, 2);

type Hms = { h: string; m: string; s: string };
const toHms = (seconds: number): Hms => {
  const d = splitDuration(seconds);
  return { h: String(d.h), m: String(d.m), s: String(d.s) };
};
/** Totaal in seconden, of null als een veld geen geldig getal is. */
const hmsSeconds = (v: Hms): number | null => {
  const parts = [v.h, v.m, v.s].map((x) => (x.trim() === "" ? 0 : Number(x.replace(",", "."))));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return Math.round(parts[0]! * 3600 + parts[1]! * 60 + parts[2]!);
};

export default function RulesPage() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const [rows, setRows] = useState<LayerRows | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Gewijzigde tijden per regel: uren, minuten en seconden als tekst uit de invoervelden. */
  const [times, setTimes] = useState<Record<string, Hms[]>>({});

  const load = useCallback(async () => {
    try {
      const chain = await loadChain(supabase(), id);
      setRows(chain[0]!);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!rows)
    return errors.length ? (
      <ul className="errors">
        {errors.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
    ) : (
      <p className="muted">{t('Laden…')}</p>
    );
  if (rows.game.id !== id) {
    return (
      <p className="card">
        {t('Regels horen bij het basisspel. Open het basisspel om ze te bewerken.')}
      </p>
    );
  }

  const base = rowsToBase(rows);
  const db = supabase();
  const must = (r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
  };

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    setErrors([]);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
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

  // Op tijd geordend, zodat "10 - …", "20 - …", "35 - …" onder elkaar staan.
  // Alleen de weergave: de volgorde van de regels zelf blijft gelijk.
  const firstSeconds = (r: Rule) => settingSeconds(timeSettings(r.when)[0]!);
  const timed = base.rules
    .filter((r) => timeSettings(r.when).length > 0)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => firstSeconds(a.r) - firstSeconds(b.r) || a.i - b.i)
    .map(({ r }) => r);
  const saveTimes = () =>
    run(async () => {
      const changed = Object.entries(times);
      const updated = base.rules.map((r) => {
        const values = times[r.id];
        if (!values) return r;
        const seconds = values.map(hmsSeconds);
        if (seconds.some((n) => n === null))
          throw new Error(t("Regel {name}: vul uren, minuten en seconden in als getal van 0 of meer.", { name: r.label ?? r.id }));
        const settings = timeSettings(r.when);
        const secs = seconds as number[];
        const when = withTimes(r.when, settings.map((st, i) => settingValue(st, secs[i]!)));
        // De omschrijving ("Na 10 minuten: …") loopt mee met de nieuwe tijd.
        return r.label ? { ...r, when, label: relabel(r.label, settings, secs) } : { ...r, when };
      });
      composeGame({ ...base, rules: updated }, [], { id: "proef", version: 0 });
      for (const [key] of changed) {
        const rule = updated.find((r) => r.id === key)!;
        must(
          await db
            .from("rules")
            .update({ condition: rule.when, label: rule.label ?? null })
            .eq("game_id", id)
            .eq("key", key),
        );
      }
      setTimes({});
    }, t("Tijden opgeslagen. Publiceer het spel om ze in de app te gebruiken."));

  const saveDraft = () =>
    run(async () => {
      if (!draft) return;
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(draft.id))
        throw new Error(
          t("Gebruik voor de sleutel alleen kleine letters, cijfers en streepjes."),
        );
      if (draft.isNew && base.rules.some((r) => r.id === draft.id))
        throw new Error(t("Die sleutel bestaat al."));
      const { rule, error } = parseRule(
        draft.id,
        draft.label,
        draft.when,
        draft.then,
      );
      if (!rule) throw new Error(error);
      // Eerst proef-samenstellen: onbekende opdrachten, reeksen of eindes komen hier boven.
      const rules = draft.isNew
        ? [...base.rules, rule]
        : base.rules.map((r) => (r.id === rule.id ? rule : r));
      composeGame({ ...base, rules }, [], { id: "proef", version: 0 });

      const texts: TranslationRow[] = [];
      const actions = actionsToRow(rule, texts);
      const position = draft.isNew
        ? Math.max(-1, ...rows.rules.map((r) => r.position)) + 1
        : rows.rules.find((r) => r.key === rule.id)!.position;
      const row = { condition: rule.when, actions, label: rule.label ?? null };
      if (draft.isNew)
        must(
          await db
            .from("rules")
            .insert({ game_id: id, key: rule.id, position, ...row }),
        );
      else
        must(
          await db
            .from("rules")
            .update(row)
            .eq("game_id", id)
            .eq("key", rule.id),
        );
      must(
        await db
          .from("translations")
          .delete()
          .eq("game_id", id)
          .eq("entity", "rule")
          .eq("entity_id", rule.id),
      );
      if (texts.length)
        must(
          await db
            .from("translations")
            .insert(texts.map((tk) => ({ ...tk, game_id: id }))),
        );
      setDraft(null);
    }, t("Regel opgeslagen. Publiceer het spel om hem te gebruiken."));

  const remove = (rule: Rule) =>
    run(async () => {
      composeGame(
        { ...base, rules: base.rules.filter((r) => r.id !== rule.id) },
        [],
        { id: "proef", version: 0 },
      );
      must(
        await db.from("rules").delete().eq("game_id", id).eq("key", rule.id),
      );
      must(
        await db
          .from("translations")
          .delete()
          .eq("game_id", id)
          .eq("entity", "rule")
          .eq("entity_id", rule.id),
      );
    }, t("Regel verwijderd."));

  const move = (index: number, delta: number) =>
    run(async () => {
      const order = [...base.rules];
      const [item] = order.splice(index, 1);
      order.splice(index + delta, 0, item!);
      for (const [position, r] of order.entries()) {
        must(
          await db
            .from("rules")
            .update({ position })
            .eq("game_id", id)
            .eq("key", r.id),
        );
      }
    }, t("Volgorde opgeslagen."));

  // Het bewerkvak staat bij de regel zelf (of bovenaan voor een nieuwe regel),
  // zodat je het ziet zonder te scrollen.
  const editor = draft ? (
    <div className="card">
      <div className="row">
        <div>
          <label htmlFor="key">{t('Sleutel')}</label>
          <input
            id="key"
            value={draft.id}
            disabled={!draft.isNew}
            onChange={(e) => setDraft({ ...draft, id: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="label">{t('Omschrijving')}</label>
          <input
            id="label"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </div>
      </div>
      <label htmlFor="when">{t('Als (voorwaarde, JSON)')}</label>
      <textarea
        id="when"
        rows={6}
        className="mono"
        value={draft.when}
        onChange={(e) => setDraft({ ...draft, when: e.target.value })}
      />
      <label htmlFor="then">{t('Dan (acties, JSON)')}</label>
      <textarea
        id="then"
        rows={10}
        className="mono"
        value={draft.then}
        onChange={(e) => setDraft({ ...draft, then: e.target.value })}
      />
      {(() => {
        const { rule } = parseRule(
          draft.id || "nieuw",
          draft.label,
          draft.when,
          draft.then,
        );
        return rule ? <p className="muted">{describeRule(rule)}</p> : null;
      })()}
      <div className="actions">
        <button onClick={() => void saveDraft()} disabled={busy}>
          {t('Opslaan')}
        </button>
        <button className="secondary" onClick={() => setDraft(null)}>
          {t('Annuleren')}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <p className="muted">
        <Link href="/spellen">{t('Spellen')}</Link> ›{" "}
        <Link href={`/spellen/${id}`}>{rows.game.slug}</Link> › {t("Regels")}
      </p>
      <h1>{t('Regels')}</h1>
      <GameNav id={id} layer={rows.game.layer} active="regels" />
      <p className="muted">
        {t('Een regel is “als dit gebeurt, dan dat”. Elke regel vuurt één keer, op het eerste moment dat de voorwaarde waar wordt. Volgorde telt bij regels die op hetzelfde moment vuren.')}
      </p>
      {notice ? <p className="notice">{notice}</p> : null}
      {errors.length > 0 ? (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}

      {timed.length > 0 ? (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>{t('Tijden')}</h2>
          <p className="muted">
            {t("Regels die op tijd gaan. Vul uren, minuten en seconden in en sla op; de omschrijving loopt mee. In een testhunt kun je in de app de tijd vooruitzetten, zodat je niet hoeft te wachten.")}
          </p>
          <table>
            <tbody>
              {timed.map((r) => {
                const settings = timeSettings(r.when);
                const values = times[r.id] ?? settings.map((s) => toHms(settingSeconds(s)));
                const preview = r.label ? relabel(r.label, settings, values.map((v) => hmsSeconds(v) ?? 0)) : r.id;
                return (
                  <tr key={r.id}>
                    <td>{preview}</td>
                    <td>
                      {settings.map((s, i) => (
                        <div key={i} style={{ display: "inline-flex", gap: 4, alignItems: "center", marginRight: 12 }}>
                          {(["h", "m", "s"] as const).map((unit) => (
                            <label key={unit} style={{ display: "inline-flex", gap: 2, alignItems: "center", margin: 0 }}>
                              <input
                                style={{ width: 56 }}
                                inputMode="numeric"
                                value={values[i]![unit]}
                                aria-label={`${unit === "h" ? t("uren") : unit === "m" ? t("minuten") : t("seconden")} ${s.kind === "elapsed" ? t("na de start") : t("na {task}", { task: s.task })}`}
                                onChange={(e) =>
                                  setTimes({
                                    ...times,
                                    [r.id]: values.map((v, j) => (j === i ? { ...v, [unit]: e.target.value } : v)),
                                  })
                                }
                              />
                              {unit === "h" ? t("u") : unit === "m" ? t("min") : t("sec")}
                            </label>
                          ))}
                          <span className="muted small">
                            {s.kind === "elapsed" ? t("na de start") : t("na {task}", { task: s.task })}
                            {hmsSeconds(values[i]!) !== null ? ` (${formatDuration(hmsSeconds(values[i]!)!)})` : ""}
                          </span>
                        </div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="actions">
            <button onClick={() => void saveTimes()} disabled={busy || Object.keys(times).length === 0}>
              {Object.keys(times).length ? t("Tijden opslaan") : t("Opgeslagen")}
            </button>
          </div>
        </section>
      ) : null}

      {draft?.isNew ? (
        editor
      ) : (
        <div className="actions">
          <button
            onClick={() =>
              setDraft({
                id: "",
                label: "",
                when: pretty({ kind: "elapsed", minutes: 10 }),
                then: pretty([
                  {
                    kind: "message",
                    text: { nl: "Nog 10 minuten!", en: "10 minutes left!" },
                  },
                ]),
                isNew: true,
              })
            }
          >
            {t('Nieuwe regel')}
          </button>
        </div>
      )}

      <h2>{t('Alle regels')}</h2>
      <ol className="rules">
        {base.rules.map((rule, i) => (
          <li key={rule.id} className="card">
            {draft && !draft.isNew && draft.id === rule.id ? (
              editor
            ) : (
              <>
                <strong>{rule.label ?? rule.id}</strong>{" "}
                <span className="muted">{rule.id}</span>
                <p>{describeRule(rule)}</p>
                <div className="actions">
                  <button
                    className="secondary"
                    onClick={() =>
                      setDraft({
                        id: rule.id,
                        label: rule.label ?? "",
                        when: pretty(rule.when),
                        then: pretty(rule.then),
                        isNew: false,
                      })
                    }
                  >
                    {t('Bewerken')}
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || i === 0}
                    onClick={() => void move(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || i === base.rules.length - 1}
                    onClick={() => void move(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    className="link"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(t("Regel {name} verwijderen?", { name: rule.id })))
                        void remove(rule);
                    }}
                  >
                    {t('Verwijderen')}
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}
