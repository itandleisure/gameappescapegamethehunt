'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth, type Org } from '@/lib/auth';
import { displayName } from '@/lib/game-name';
import type { GameRow } from '@/lib/game-model';
import { useLanguage } from '@/lib/language';
import { PARTNER_ROLES, roleKey } from '@/lib/roles';
import { supabase } from '@/lib/supabase';

interface Partner {
  id: string;
  name: string;
  description: string | null;
}
interface Account {
  /** Leeg bij een openstaande uitnodiging. */
  user_id: string | null;
  email: string;
  role: Org['role'];
  invited: boolean;
}
interface City {
  id: string;
  name: string;
}

/** Keuzelijst met de huidige rol erbij, ook als die niet meer te kiezen is. */
const withCurrent = (roles: Org['role'][], current: Org['role']) => (roles.includes(current) ? roles : [...roles, current]);

/**
 * Eén partner bewerken (alleen het platform): naam en omschrijving, de steden
 * die de partner mag spelen en de accounts eronder. Elk account onder de
 * partner heeft de rechten van de partner.
 */
export default function PartnerPage() {
  const { id } = useParams<{ id: string }>();
  const { org } = useAuth();
  const { t } = useLanguage();
  const [partner, setPartner] = useState<Partner | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [notes, setNotes] = useState<Map<string, string>>(new Map());
  const [cities, setCities] = useState<City[]>([]);
  const [shared, setShared] = useState<Set<string>>(new Set());
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  /** Account waarvan de omschrijving open staat om te bewerken. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const allowed = !!org && org.platform && ['owner', 'admin'].includes(org.role);

  const load = useCallback(async () => {
    if (!org) return;
    const db = supabase();
    const [p, m, i, n, g, s] = await Promise.all([
      db.rpc('partner_orgs'),
      db.rpc('org_members', { p_org: id }),
      db.from('invitations').select('email, role').eq('org_id', id).is('accepted_at', null).order('created_at'),
      db.rpc('org_account_notes', { p_org: id }),
      db.from('games').select('id, layer, slug, settings').eq('org_id', org.id).eq('layer', 'city'),
      db.from('game_shares').select('game_id').eq('org_id', id),
    ]);
    const found = ((p.data ?? []) as Partner[]).find((x) => x.id === id) ?? null;
    setPartner(found);
    if (found) {
      setName(found.name);
      setDescription(found.description ?? '');
    }
    setAccounts([
      ...((m.data ?? []) as { user_id: string; email: string; role: Org['role'] }[]).map((x) => ({ ...x, invited: false })),
      ...((i.data ?? []) as { email: string; role: Org['role'] }[]).map((x) => ({ ...x, user_id: null, invited: true })),
    ]);
    setNotes(new Map(((n.data ?? []) as { email: string; note: string }[]).map((x) => [x.email, x.note])));
    setCities(
      ((g.data ?? []) as Pick<GameRow, 'id' | 'layer' | 'slug' | 'settings'>[])
        .map((x) => ({ id: x.id, name: displayName(x) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    setShared(new Set(((s.data ?? []) as { game_id: string }[]).map((x) => x.game_id)));
  }, [org, id]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (!org) return null;
  if (!allowed) return <p className="muted">{t('Alleen eigenaren en beheerders van het platform kunnen partners beheren.')}</p>;
  if (partner === undefined) return <p className="muted">{t('Laden…')}</p>;
  if (partner === null) {
    return (
      <>
        <p className="error">{t('Deze partner bestaat niet (meer).')}</p>
        <Link href="/instellingen/leden">{t('Terug naar Toegang')}</Link>
      </>
    );
  }

  const run = async (work: () => Promise<{ error: { message: string } | null }>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: e } = await work();
    if (e) setError(e.message);
    else {
      setNotice(done);
      await load();
    }
    setBusy(false);
  };
  const roleLabel = (r: Org['role']) => t(roleKey(r));
  const loginUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/login`;

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => supabase().rpc('update_partner', { p_org: id, p_name: name, p_description: description }), t('Partner opgeslagen.'));
  };
  const toggleCity = (city: string, on: boolean) =>
    void run(
      async () =>
        on
          ? supabase().from('game_shares').insert({ game_id: city, org_id: id })
          : supabase().from('game_shares').delete().eq('game_id', city).eq('org_id', id),
      on ? t('Stad gedeeld met de partner.') : t('Stad niet meer gedeeld met de partner.'),
    );
  const invite = (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    void run(async () => {
      const result = await supabase().rpc('invite_member', { p_org: id, p_email: address, p_role: 'editor' });
      if (result.error) return result;
      if (note.trim()) {
        const saved = await supabase().rpc('set_account_note', { p_email: address, p_note: note });
        if (saved.error) return saved;
      }
      const { error: mail } = await supabase().auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/wachtwoord` },
      });
      if (mail) {
        return { error: { message: t('Uitgenodigd, maar de mail kon niet worden verstuurd. Laat {email} een account aanmaken op {url} met dit e-mailadres.', { email: address, url: loginUrl }) } };
      }
      return { error: null };
    }, t('Uitgenodigd. {email} krijgt een mail met een inloglink en kiest daarna zelf een wachtwoord.', { email: address })).then(() => {
      setEmail('');
      setNote('');
    });
  };
  const changeRole = (a: Account, next: Org['role']) =>
    void run(async () => supabase().rpc('set_member_role', { p_org: id, p_user: a.user_id, p_role: next }), t('Rol gewijzigd.'));
  const remove = (a: Account) => {
    if (a.invited) {
      void run(async () => supabase().from('invitations').delete().eq('org_id', id).eq('email', a.email), t('Uitnodiging ingetrokken.'));
      return;
    }
    if (!window.confirm(t('{email} verwijderen uit {org}? Het account gaat dicht als het nergens anders lid van is.', { email: a.email, org: partner.name }))) return;
    void run(async () => supabase().rpc('remove_member', { p_org: id, p_user: a.user_id }), t('Lid verwijderd.'));
  };
  const saveNote = (a: Account) =>
    void run(async () => supabase().rpc('set_account_note', { p_email: a.email, p_note: draft }), t('Omschrijving opgeslagen.')).then(() =>
      setEditing(null),
    );

  return (
    <>
      <p className="small">
        <Link href="/instellingen/leden">← {t('Toegang')}</Link>
      </p>
      <h1>{partner.name}</h1>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <form onSubmit={save}>
        <h2>{t('Gegevens')}</h2>
        <label htmlFor="partner-name">{t('Naam')}</label>
        <input id="partner-name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="partner-description">{t('Omschrijving (alleen voor beheerders van het platform)')}</label>
        <textarea
          id="partner-description"
          rows={3}
          maxLength={1000}
          placeholder={t('Bijvoorbeeld: wie het is, welke afspraken, tot wanneer')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="actions">
          <button type="submit" disabled={busy}>
            {t('Opslaan')}
          </button>
        </div>
      </form>

      <h2>{t('Steden')}</h2>
      <p className="muted small">{t('Vink de steden aan die deze partner mag spelen.')}</p>
      <div>
        {cities.length === 0 ? <span className="muted">{t('Nog geen steden om te delen.')}</span> : null}
        {cities.map((c) => (
          <label key={c.id} style={{ display: 'inline-flex', gap: 4, marginRight: 16, fontWeight: 'normal' }}>
            <input type="checkbox" disabled={busy} checked={shared.has(c.id)} onChange={(e) => toggleCity(c.id, e.target.checked)} />
            {c.name}
          </label>
        ))}
      </div>

      <h2>{t('Accounts')}</h2>
      <p className="muted small">{t('Elk account onder deze partner heeft de rechten van de partner: dezelfde steden, tickets en resultaten.')}</p>
      <table className="stack">
        <tbody>
          {accounts.length === 0 ? (
            <tr>
              <td className="muted">{t('Nog geen accounts.')}</td>
            </tr>
          ) : null}
          {accounts.map((a) => (
            <tr key={a.email}>
              <td data-label={t('E-mail')}>
                {a.email}
                {a.invited ? <span className="muted"> · {t('uitgenodigd')}</span> : null}
                {editing === a.email ? (
                  <div>
                    <textarea rows={2} maxLength={1000} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={t('Omschrijving')} />
                    <button className="link" disabled={busy} onClick={() => saveNote(a)}>
                      {t('Opslaan')}
                    </button>{' '}
                    <button className="link" disabled={busy} onClick={() => setEditing(null)}>
                      {t('Annuleren')}
                    </button>
                  </div>
                ) : (
                  <div className="small muted">
                    {notes.get(a.email.toLowerCase()) ?? ''}{' '}
                    <button
                      className="link"
                      onClick={() => {
                        setEditing(a.email);
                        setDraft(notes.get(a.email.toLowerCase()) ?? '');
                      }}
                    >
                      {notes.has(a.email.toLowerCase()) ? t('Omschrijving wijzigen') : t('Omschrijving toevoegen')}
                    </button>
                  </div>
                )}
              </td>
              <td data-label={t('Rol')}>
                {a.invited ? (
                  roleLabel(a.role)
                ) : (
                  <select aria-label={t('Rol')} value={a.role} disabled={busy} onChange={(e) => changeRole(a, e.target.value as Org['role'])}>
                    {withCurrent(PARTNER_ROLES, a.role).map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                )}{' '}
                <button className="link" disabled={busy} onClick={() => remove(a)}>
                  {a.invited ? t('Intrekken') : t('Verwijderen')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form onSubmit={invite}>
        <h3>{t('Account toevoegen')}</h3>
        <label htmlFor="account-email">{t('E-mail')}</label>
        <input id="account-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="account-note">{t('Omschrijving (alleen voor beheerders van het platform)')}</label>
        <textarea id="account-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="actions">
          <button type="submit" disabled={busy}>
            {t('Uitnodigen')}
          </button>
        </div>
      </form>
    </>
  );
}
