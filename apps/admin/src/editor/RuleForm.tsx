"use client";
import type { Action, Placement, Rule } from "@hunt/engine";
import { useState } from "react";
import { actionLine, conditionText, type Names } from "@/lib/flow";
import { useT } from "@/lib/language";
import {
  parseRule,
  relabel,
  settingSeconds,
  settingValue,
  splitDuration,
  timeSettings,
  withTimes,
  type TimeSetting,
} from "@/lib/rules";

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

const pretty = (v: unknown) => JSON.stringify(v, null, 2);
const placementKey = (p: Placement) => (typeof p === "string" ? p : `pg:${p.playground}`);
const placementFrom = (k: string): Placement => (k.startsWith("pg:") ? { playground: k.slice(3) } : (k as "map" | "list"));

export interface RuleFormProps {
  rule: Rule;
  isNew: boolean;
  names: Names;
  tasks: { id: string; name: string }[];
  playgrounds: { id: string; name: string }[];
  busy: boolean;
  onSave: (rule: Rule) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

/**
 * Een regel wijzigen met gewone velden: wanneer, de omschrijving en wat er
 * gebeurt (berichten en opdrachten). De technische JSON staat eronder,
 * ingeklapt, voor alles wat niet in de velden past.
 */
export function RuleForm({ rule: initial, isNew, names, tasks, playgrounds, busy, onSave, onCancel, onDelete }: RuleFormProps) {
  const t = useT();
  const [rule, setRule] = useState<Rule>(initial);
  const [labelTouched, setLabelTouched] = useState(false);
  const [origin, setOrigin] = useState<{ label: string; settings: TimeSetting[] }>({
    label: initial.label ?? "",
    settings: timeSettings(initial.when),
  });
  const [hms, setHms] = useState<Hms[]>(() => timeSettings(initial.when).map((s) => toHms(settingSeconds(s))));
  const [json, setJson] = useState({ when: pretty(initial.when), then: pretty(initial.then) });
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settings = timeSettings(rule.when);

  const update = (next: Rule) => {
    setRule(next);
    setJson({ when: pretty(next.when), then: pretty(next.then) });
    setJsonError(null);
  };

  const setTime = (i: number, v: Hms) => {
    const values = hms.map((x, j) => (j === i ? v : x));
    setHms(values);
    const secs = values.map(hmsSeconds);
    if (secs.some((n) => n === null)) return;
    const when = withTimes(rule.when, settings.map((st, j) => settingValue(st, secs[j]!)));
    // De omschrijving ("10 - …", "Na 10 minuten: …") loopt mee, tot je hem zelf wijzigt.
    const label = labelTouched ? rule.label ?? "" : relabel(origin.label, origin.settings, secs as number[]);
    update({ ...rule, when, label });
  };

  const setAction = (i: number, a: Action) => update({ ...rule, then: rule.then.map((x, j) => (j === i ? a : x)) });
  const removeAction = (i: number) => update({ ...rule, then: rule.then.filter((_, j) => j !== i) });
  const addAction = (a: Action) => update({ ...rule, then: [...rule.then, a] });
  const firstTask = tasks[0]?.id ?? "";

  const onJson = (field: "when" | "then", value: string) => {
    const next = { ...json, [field]: value };
    setJson(next);
    const parsed = parseRule(rule.id || "nieuw", rule.label ?? "", next.when, next.then);
    if (!parsed.rule) {
      setJsonError(parsed.error ?? null);
      return;
    }
    setJsonError(null);
    const r = { ...parsed.rule, id: rule.id };
    setRule(r);
    const st = timeSettings(r.when);
    setHms(st.map((s) => toHms(settingSeconds(s))));
    setOrigin({ label: r.label ?? "", settings: st });
  };

  const save = () => {
    if (jsonError) return setError(t("Herstel eerst de technische JSON."));
    if (hms.some((v) => hmsSeconds(v) === null)) return setError(t("Vul uren, minuten en seconden in als getal van 0 of meer."));
    if (rule.then.length === 0) return setError(t("Voeg minstens één ding toe dat er gebeurt."));
    setError(null);
    const label = (rule.label ?? "").trim();
    const out: Rule = { id: rule.id, when: rule.when, then: rule.then };
    if (label) out.label = label;
    onSave(out);
  };

  return (
    <div className="card flow-form">
      <label htmlFor="rule-label">{t("Omschrijving")}</label>
      <input
        id="rule-label"
        value={rule.label ?? ""}
        placeholder={t("Bijvoorbeeld: 10 - Puzzel 1 vrijgeven")}
        onChange={(e) => {
          setLabelTouched(true);
          setRule({ ...rule, label: e.target.value });
        }}
      />

      <h3>{t("Wanneer")}</h3>
      {settings.length ? (
        settings.map((s, i) => (
          <div key={i} className="flow-time">
            {(["h", "m", "s"] as const).map((unit) => (
              <label key={unit}>
                <input
                  inputMode="numeric"
                  value={hms[i]?.[unit] ?? ""}
                  aria-label={unit === "h" ? t("uren") : unit === "m" ? t("minuten") : t("seconden")}
                  onChange={(e) => setTime(i, { ...hms[i]!, [unit]: e.target.value })}
                />
                {unit === "h" ? t("u") : unit === "m" ? t("min") : t("sec")}
              </label>
            ))}
            <span className="muted small">
              {s.kind === "elapsed" ? t("na de start") : t("na {task}", { task: names.task(s.task) })}
            </span>
          </div>
        ))
      ) : null}
      {rule.when.kind !== "elapsed" ? (
        <p className="muted small">{t("Als: {what}", { what: conditionText(rule.when, names) })}</p>
      ) : null}

      <h3>{t("Wat er gebeurt")}</h3>
      <ol className="flow-edit-actions">
        {rule.then.map((a, i) => (
          <li key={i}>
            {a.kind === "message" ? (
              <>
                <label htmlFor={`msg-${i}`}>✉️ {t("Bericht aan het team")}</label>
                <textarea
                  id={`msg-${i}`}
                  rows={5}
                  value={a.text.nl ?? ""}
                  onChange={(e) => setAction(i, { ...a, text: { ...a.text, nl: e.target.value } })}
                />
                {Object.keys(a.text).some((l) => l !== "nl") ? (
                  <p className="muted small">{t("Dit bericht heeft ook andere talen; die veranderen niet mee.")}</p>
                ) : null}
              </>
            ) : a.kind === "show" && "task" in a.select ? (
              <div className="row">
                <div>
                  <label>🧩 {t("Opdracht tonen")}</label>
                  <select value={a.select.task} onChange={(e) => setAction(i, { ...a, select: { task: e.target.value } })}>
                    {tasks.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>{t("Waar")}</label>
                  <select value={placementKey(a.on)} onChange={(e) => setAction(i, { ...a, on: placementFrom(e.target.value) })}>
                    <option value="list">{t("in de opdrachtenlijst")}</option>
                    <option value="map">{t("op de kaart")}</option>
                    {playgrounds.map((p) => (
                      <option key={p.id} value={`pg:${p.id}`}>
                        {t("op het tabblad {name}", { name: p.name })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : a.kind === "open" ? (
              <div>
                <label>⚡ {t("Opdracht direct openen")}</label>
                <select value={a.task} onChange={(e) => setAction(i, { ...a, task: e.target.value })}>
                  {tasks.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : a.kind === "hideScore" ? (
              <p>
                🙈 {t("Punten verdwijnen uit beeld bij het team")}{" "}
                <span className="muted small">{t("(de spelleiding ziet ze gewoon in de ranglijst)")}</span>
              </p>
            ) : (
              (() => {
                const line = actionLine(a, names);
                return (
                  <p>
                    {line.icon} {line.text} <span className="muted small">{t("(wijzigen bij Technisch)")}</span>
                  </p>
                );
              })()
            )}
            <button className="link" onClick={() => removeAction(i)}>
              {t("Weghalen")}
            </button>
          </li>
        ))}
      </ol>
      <div className="actions">
        <button className="secondary" onClick={() => addAction({ kind: "message", text: { nl: "" } })}>
          + {t("Bericht")}
        </button>
        <button
          className="secondary"
          disabled={!firstTask}
          onClick={() => addAction({ kind: "show", select: { task: firstTask }, on: "list" })}
        >
          + {t("Opdracht tonen")}
        </button>
        <button className="secondary" disabled={!firstTask} onClick={() => addAction({ kind: "open", task: firstTask })}>
          + {t("Opdracht direct openen")}
        </button>
        <button
          className="secondary"
          disabled={rule.then.some((x) => x.kind === "hideScore")}
          onClick={() => addAction({ kind: "hideScore" })}
        >
          + {t("Punten verbergen")}
        </button>
      </div>

      <details className="flow-tech">
        <summary>{t("Technisch (JSON)")}</summary>
        <p className="muted small">{t("Sleutel: {key}", { key: rule.id })}</p>
        <label htmlFor="rule-when">{t("Als (voorwaarde, JSON)")}</label>
        <textarea id="rule-when" rows={6} className="mono" value={json.when} onChange={(e) => onJson("when", e.target.value)} />
        <label htmlFor="rule-then">{t("Dan (acties, JSON)")}</label>
        <textarea id="rule-then" rows={10} className="mono" value={json.then} onChange={(e) => onJson("then", e.target.value)} />
        {jsonError ? <p className="errors">{jsonError}</p> : null}
      </details>

      {error ? <p className="errors">{error}</p> : null}
      <div className="actions">
        <button onClick={save} disabled={busy}>
          {isNew ? t("Toevoegen") : t("Opslaan")}
        </button>
        <button className="secondary" onClick={onCancel} disabled={busy}>
          {t("Annuleren")}
        </button>
        {onDelete ? (
          <button className="link" onClick={onDelete} disabled={busy}>
            {t("Verwijderen")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
