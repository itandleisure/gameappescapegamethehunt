"use client";
import { composeGame, CompositionError, type Rule } from "@hunt/engine";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RuleForm } from "@/editor/RuleForm";
import {
  actionLine,
  conditionText,
  extraConditions,
  labelWithoutTime,
  namesFor,
  newRuleKey,
  timeline,
  type Names,
} from "@/lib/flow";
import {
  actionsToRow,
  rowsToBase,
  type LayerRows,
  type TranslationRow,
} from "@/lib/game-model";
import { loadChain } from "@/lib/game-store";
import { useT } from "@/lib/language";
import { describeRule, formatMinutes } from "@/lib/rules";
import { supabase } from "@/lib/supabase";
import { tx } from "@/lib/text";
import { GameNav } from '@/editor/GameNav';

/** Welke regel open staat om te wijzigen, en waar het formulier staat. */
interface Editing {
  rule: Rule;
  isNew: boolean;
  where: "flow" | "tech";
}

/** Wat een regel doet, als lijstje in gewone taal. */
function ActionList({ rule, names }: { rule: Rule; names: Names }) {
  return (
    <ul className="flow-actions">
      {rule.then.map((a, i) => {
        const line = actionLine(a, names);
        return (
          <li key={i}>
            <span className="flow-icon" aria-hidden>
              {line.icon}
            </span>
            <div>
              {line.text}
              {line.detail !== undefined ? (
                <details className="flow-message">
                  <summary>{line.detail.split("\n").find((l) => l.trim()) ?? "…"}</summary>
                  <p>{line.detail}</p>
                </details>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function RulesPage() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const [rows, setRows] = useState<LayerRows | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  const names = namesFor(base);
  const taskOptions = base.tasks.map((x) => ({ id: x.id, name: names.task(x.id) }));
  const playgroundOptions = base.playgrounds.map((p) => ({ id: p.id, name: tx(p.name) || p.id }));
  const { moments, other } = timeline(base.rules);
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

  const saveRule = (rule: Rule, isNew: boolean) =>
    run(async () => {
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(rule.id))
        throw new Error(
          t("Gebruik voor de sleutel alleen kleine letters, cijfers en streepjes."),
        );
      if (isNew && base.rules.some((r) => r.id === rule.id))
        throw new Error(t("Die sleutel bestaat al."));
      // Eerst proef-samenstellen: onbekende opdrachten, reeksen of eindes komen hier boven.
      const rules = isNew
        ? [...base.rules, rule]
        : base.rules.map((r) => (r.id === rule.id ? rule : r));
      composeGame({ ...base, rules }, [], { id: "proef", version: 0 });

      const texts: TranslationRow[] = [];
      const actions = actionsToRow(rule, texts);
      const position = isNew
        ? Math.max(-1, ...rows.rules.map((r) => r.position)) + 1
        : rows.rules.find((r) => r.key === rule.id)!.position;
      const row = { condition: rule.when, actions, label: rule.label ?? null };
      if (isNew)
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
      setEditing(null);
    }, t("Opgeslagen. Publiceer het spel om het in de app te gebruiken."));

  const remove = (rule: Rule) => {
    if (!window.confirm(t("{name} verwijderen?", { name: rule.label || rule.id }))) return;
    void run(async () => {
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
      setEditing(null);
    }, t("Regel verwijderd."));
  };

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

  const form = (e: Editing) => (
    <RuleForm
      key={`${e.where}-${e.rule.id}`}
      rule={e.rule}
      isNew={e.isNew}
      names={names}
      tasks={taskOptions}
      playgrounds={playgroundOptions}
      busy={busy}
      onSave={(r) => void saveRule(r, e.isNew)}
      onCancel={() => setEditing(null)}
      onDelete={e.isNew ? undefined : () => remove(e.rule)}
    />
  );
  const isEditing = (rule: Rule, where: Editing["where"]) =>
    editing && !editing.isNew && editing.where === where && editing.rule.id === rule.id;
  const edit = (rule: Rule, where: Editing["where"]) => setEditing({ rule, isNew: false, where });

  const lastMoment = moments.length ? moments[moments.length - 1]!.seconds : 0;
  const newMoment = () => {
    const seconds = lastMoment + 600;
    setEditing({
      rule: {
        id: newRuleKey(base.rules, `moment-${formatMinutes(seconds).replace(":", "-")}`),
        label: `${formatMinutes(seconds)} - `,
        when: { kind: "elapsed", minutes: seconds / 60 },
        then: [{ kind: "message", text: { nl: "" } }],
      },
      isNew: true,
      where: "flow",
    });
  };
  const newOther = () => {
    const first = base.tasks[0]?.id ?? "";
    setEditing({
      rule: {
        id: newRuleKey(base.rules, "regel"),
        label: "",
        when: { kind: "completed", select: { task: first } },
        then: [{ kind: "message", text: { nl: "" } }],
      },
      isNew: true,
      where: "flow",
    });
  };
  const newFormHere = (kind: "moment" | "other") =>
    editing?.isNew && (kind === "moment" ? editing.rule.id.startsWith("moment") : editing.rule.id.startsWith("regel"))
      ? form(editing)
      : null;

  return (
    <>
      <p className="muted">
        <Link href="/spellen">{t('Spellen')}</Link> ›{" "}
        <Link href={`/spellen/${id}`}>{rows.game.slug}</Link> › {t("Spelverloop")}
      </p>
      <h1>{t('Spelverloop')}</h1>
      <GameNav id={id} layer={rows.game.layer} active="regels" />
      <p className="muted">
        {t('Wat er tijdens het spel gebeurt en wanneer. Elk moment gaat één keer per team. Wijzig een moment met Wijzigen en publiceer het spel om het in de app te gebruiken. In een testevent kun je in de app de tijd vooruitzetten, zodat je niet hoeft te wachten.')}
      </p>
      {notice ? <p className="notice">{notice}</p> : null}
      {errors.length > 0 ? (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}

      <h2>{t('Tijdlijn')}</h2>
      {moments.length === 0 ? <p className="muted">{t('Nog geen momenten op tijd.')}</p> : null}
      <ol className="flow-timeline">
        {moments.map((m) => (
          <li key={m.seconds} className="flow-moment">
            <div className="flow-when">
              {m.seconds === 0 ? t('Start') : t('{n} min', { n: formatMinutes(m.seconds) })}
            </div>
            <div className="flow-items">
              {m.rules.map((rule) =>
                isEditing(rule, "flow") ? (
                  <div key={rule.id}>{form(editing!)}</div>
                ) : (
                  <div key={rule.id} className="card flow-item">
                    <div className="flow-head">
                      <strong>{rule.label ? labelWithoutTime(rule.label) : rule.id}</strong>
                      <button className="secondary" disabled={busy} onClick={() => edit(rule, "flow")}>
                        {t('Wijzigen')}
                      </button>
                    </div>
                    {extraConditions(rule).length ? (
                      <p className="flow-if">
                        {t('Alleen als: {what}', {
                          what: extraConditions(rule).map((c) => conditionText(c, names)).join(` ${t('én')} `),
                        })}
                      </p>
                    ) : null}
                    <ActionList rule={rule} names={names} />
                  </div>
                ),
              )}
            </div>
          </li>
        ))}
      </ol>
      {newFormHere("moment")}
      {!editing?.isNew ? (
        <div className="actions">
          <button className="secondary" disabled={busy} onClick={newMoment}>
            + {t('Moment toevoegen')}
          </button>
        </div>
      ) : null}

      <h2>{t('Als dit gebeurt')}</h2>
      <p className="muted">{t('Dingen die niet op een vaste tijd gaan, maar zodra een team iets doet.')}</p>
      <div className="flow-other">
        {other.map((rule) =>
          isEditing(rule, "flow") ? (
            <div key={rule.id}>{form(editing!)}</div>
          ) : (
            <div key={rule.id} className="card flow-item">
              <div className="flow-head">
                <strong>{rule.label || rule.id}</strong>
                <button className="secondary" disabled={busy} onClick={() => edit(rule, "flow")}>
                  {t('Wijzigen')}
                </button>
              </div>
              <p className="flow-if">{t('Als: {what}', { what: conditionText(rule.when, names) })}</p>
              <ActionList rule={rule} names={names} />
            </div>
          ),
        )}
      </div>
      {newFormHere("other")}
      {!editing?.isNew ? (
        <div className="actions">
          <button className="secondary" disabled={busy} onClick={newOther}>
            + {t('Regel toevoegen')}
          </button>
        </div>
      ) : null}

      <details className="flow-tech-all">
        <summary>{t('Technische weergave: alle regels op volgorde')}</summary>
        <p className="muted">
          {t('Een regel is “als dit gebeurt, dan dat”. Elke regel vuurt één keer, op het eerste moment dat de voorwaarde waar wordt. Volgorde telt bij regels die op hetzelfde moment vuren.')}
        </p>
        <ol className="rules">
          {base.rules.map((rule, i) => (
            <li key={rule.id} className="card">
              {isEditing(rule, "tech") ? (
                form(editing!)
              ) : (
                <>
                  <strong>{rule.label ?? rule.id}</strong>{" "}
                  <span className="muted">{rule.id}</span>
                  <p>{describeRule(rule)}</p>
                  <div className="actions">
                    <button className="secondary" disabled={busy} onClick={() => edit(rule, "tech")}>
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
                  </div>
                </>
              )}
            </li>
          ))}
        </ol>
      </details>
    </>
  );
}
