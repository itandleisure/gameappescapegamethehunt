'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth, type Org } from '@/lib/auth';
import { displayName } from '@/lib/game-name';
import type { GameRow } from '@/lib/game-model';
import { PARTNER_ROLES, PLATFORM_ROLES, roleKey } from '@/lib/roles';
import { useLanguage } from '@/lib/language';
import { supabase } from '@/lib/supabase';

interface Member {
  user_id: string;
  email: string;
  role: Org['role'];
}
interface Invitation {
  email: string;
  role: Org['role'];
  created_at: string;
  accepted_at: string | null;
  invited_by: string | null;
}
interface Partner {
  id: string;
  name: string;
  owner_email: string | null;
  accepted: boolean;
  member_count: number;
}
interface City {
  id: string;
  name: string;
}


/** Rollen die een partner kan hebben: nooit eigenaar of beheerder. */

/** Keuzelijst met de huidige rol erbij, ook als die niet meer te kiezen is (oude spelleider-accounts). */
const withCurrent = (roles: Org['role'][], current: Org['role']) => (roles.includes(current) ? roles : [...roles, current]);

/**
 * Toegang tot de beheeromgeving. Registreren kan alleen met een uitnodiging:
 * eigenaren en beheerders van het platform nodigen collega's uit en maken
 * partners aan (een eigen organisatie met een uitnodiging voor de
 * contactpersoon). Een partner nodigt zelf collega's uit, alleen met zijn eigen
 * rol; zijn leden verwijderen of hun rol wijzigen doet het platform.
 */
export default function AccessPage() {
  const { org, user } = useAuth();
  const { t } = useLanguage();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [platform, setPlatform] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  /** Gedeelde steden per partner (game_shares). */
  const [shares, setShares] = useState<Map<string, Set<string>>>(new Map());
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Org['role']>('admin');
  const [partnerName, setPartnerName] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  /** Omschrijving bij een uitnodiging of nieuwe partner (alleen voor het platform). */
  const [note, setNote] = useState('');
  const [partnerNote, setPartnerNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Platform: eigenaren en beheerders beheren de leden. */
  const canManage = !!org && org.platform && ['owner', 'admin'].includes(org.role);
  /** Een partner nodigt collega's uit met zijn eigen rol. */
  const canInvite = canManage || (!!org && !org.platform);
  /** Leden per partner, opengeklapt in het overzicht. */
  const [partnerMembers, setPartnerMembers] = useState<Map<string, Member[]>>(new Map());

  const load = useCallback(async () => {
    if (!org) return;
    const db = supabase();
    const [m, i, p, pl] = await Promise.all([
      db.rpc('org_members', { p_org: org.id }),
      db.from('invitations').select('email, role, created_at, accepted_at, invited_by').eq('org_id', org.id).is('accepted_at', null).order('created_at'),
      db.rpc('partner_orgs'),
      db.rpc('is_platform_admin'),
    ]);
    setMembers((m.data ?? []) as Member[]);
    setInvitations((i.data ?? []) as Invitation[]);
    setPartners((p.data ?? []) as Partner[]);
    setPlatform(pl.data === true);
    if (pl.data === true) {
      const [g, s] = await Promise.all([
        db.from('games').select('id, layer, slug, settings').eq('org_id', org.id).eq('layer', 'city'),
        db.from('game_shares').select('game_id, org_id'),
      ]);
      setCities(
        ((g.data ?? []) as Pick<GameRow, 'id' | 'layer' | 'slug' | 'settings'>[])
          .map((x) => ({ id: x.id, name: displayName(x) }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      const map = new Map<string, Set<string>>();
      for (const r of (s.data ?? []) as { game_id: string; org_id: string }[]) {
        if (!map.has(r.org_id)) map.set(r.org_id, new Set());
        map.get(r.org_id)!.add(r.game_id);
      }
      setShares(map);
    }
  }, [org]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Leden van een partner ophalen (of opnieuw na een wijziging). */
  const loadPartnerMembers = useCallback(async (partner: string) => {
    const { data } = await supabase().rpc('org_members', { p_org: partner });
    setPartnerMembers((prev) => new Map(prev).set(partner, (data ?? []) as Member[]));
  }, []);

  if (!org) return null;

  const run = async (work: () => Promise<{ error: { message: string } | null }>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error } = await work();
    if (error) setError(error.message);
    else {
      setNotice(done);
      await load();
    }
    setBusy(false);
  };
  const roleLabel = (r: Org['role']) => t(roleKey(r));
  /** Omschrijving opslaan (alleen het platform); leeg laten slaat niets op. */
  const saveNote = async (address: string, text: string) =>
    text.trim() ? supabase().rpc('set_account_note', { p_email: address, p_note: text }) : { error: null };
  const loginUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/login`;

  /** Na de uitnodiging: inloglink mailen (Supabase Auth). Lukt dat niet, dan kan de persoon zelf een account aanmaken. */
  const mailLink = async (address: string) => {
    const { error: e } = await supabase().auth.signInWithOtp({
      email: address.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/wachtwoord` },
    });
    return !e;
  };
  const invite = (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    void run(async () => {
      const result = await supabase().rpc('invite_member', { p_org: org.id, p_email: address, p_role: org.platform ? role : org.role });
      if (!result.error && platform) {
        const saved = await saveNote(address, note);
        if (saved.error) return saved;
      }
      if (!result.error && !(await mailLink(address))) {
        return { error: { message: t('Uitgenodigd, maar de mail kon niet worden verstuurd. Laat {email} een account aanmaken op {url} met dit e-mailadres.', { email: address, url: loginUrl }) } };
      }
      return result;
    }, t('Uitgenodigd. {email} krijgt een mail met een inloglink en kiest daarna zelf een wachtwoord.', { email: address })).then(() => {
      setEmail('');
      setNote('');
    });
  };
  const addPartner = (e: FormEvent) => {
    e.preventDefault();
    const address = partnerEmail.trim();
    void run(async () => {
      const result = await supabase().rpc('create_partner', { p_name: partnerName, p_owner_email: address });
      if (!result.error) {
        const saved = await saveNote(address, partnerNote);
        if (saved.error) return saved;
      }
      if (!result.error && !(await mailLink(address))) {
        return { error: { message: t('Partner aangemaakt, maar de mail kon niet worden verstuurd. Laat {email} een account aanmaken op {url} met dit e-mailadres.', { email: address, url: loginUrl }) } };
      }
      return result;
    }, t('Partner aangemaakt. {email} krijgt een mail met een inloglink en kiest daarna zelf een wachtwoord.', { email: address })).then(() => {
      setPartnerName('');
      setPartnerEmail('');
      setPartnerNote('');
    });
  };
  const changeRole = (member: Member, next: Org['role'], target = org.id) =>
    void run(async () => supabase().rpc('set_member_role', { p_org: target, p_user: member.user_id, p_role: next }), t('Rol gewijzigd.')).then(
      () => (target === org.id ? undefined : loadPartnerMembers(target)),
    );
  const removeMember = (member: Member, target = org.id, targetName = org.name) => {
    if (!window.confirm(t('{email} verwijderen uit {org}? Het account gaat dicht als het nergens anders lid van is.', { email: member.email, org: targetName }))) return;
    void run(async () => supabase().rpc('remove_member', { p_org: target, p_user: member.user_id }), t('Lid verwijderd.')).then(() =>
      target === org.id ? undefined : loadPartnerMembers(target),
    );
  };
  const togglePartnerMembers = (partner: string) => {
    if (partnerMembers.has(partner)) {
      setPartnerMembers((prev) => {
        const next = new Map(prev);
        next.delete(partner);
        return next;
      });
    } else void loadPartnerMembers(partner);
  };
  const toggleCity = (partner: string, city: string, on: boolean) =>
    void run(
      async () =>
        on
          ? supabase().from('game_shares').insert({ game_id: city, org_id: partner })
          : supabase().from('game_shares').delete().eq('game_id', city).eq('org_id', partner),
      on ? t('Stad gedeeld met de partner.') : t('Stad niet meer gedeeld met de partner.'),
    );
  const withdraw = (address: string) =>
    void run(async () => supabase().from('invitations').delete().eq('org_id', org.id).eq('email', address), t('Uitnodiging ingetrokken.'));

  return (
    <>
      <h1>{t('Toegang')}</h1>
      <p className="muted">
        {t('Een account aanmaken kan alleen met een uitnodiging. Wie je uitnodigt, krijgt een mail met een inloglink en kiest daarna zelf een wachtwoord.')}
      </p>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <h2>{t('Leden van {org}', { org: org.name })}</h2>
      <table>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id}>
              <td>{m.email}</td>
              <td>
                {canManage && m.user_id !== user?.id && (m.role !== 'owner' || org.role === 'owner') ? (
                  <>
                    <select aria-label={t('Rol')} value={m.role} disabled={busy} onChange={(e) => changeRole(m, e.target.value as Org['role'])}>
                      {withCurrent(PLATFORM_ROLES, m.role).filter((r) => r !== 'owner' || org.role === 'owner').map((r) => (
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </select>{' '}
                    <button className="link" disabled={busy} onClick={() => removeMember(m)}>
                      {t('Verwijderen')}
                    </button>
                  </>
                ) : (
                  roleLabel(m.role)
                )}
              </td>
            </tr>
          ))}
          {invitations.map((i) => (
            <tr key={i.email}>
              <td>{i.email}</td>
              <td>
                {roleLabel(i.role)} · <span className="muted">{t('uitgenodigd')}</span>
                {canManage || (!org.platform && i.invited_by === user?.id) ? (
                  <>
                    {' '}
                    <button className="link" disabled={busy} onClick={() => withdraw(i.email)}>
                      {t('Intrekken')}
                    </button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {canInvite ? (
        <form onSubmit={invite}>
          <h2>{t('Collega uitnodigen')}</h2>
          <label htmlFor="invite-email">{t('E-mail')}</label>
          <input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {platform ? (
            <>
              <label htmlFor="invite-note">{t('Omschrijving (alleen voor beheerders van het platform)')}</label>
              <textarea id="invite-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </>
          ) : null}
          {org.platform ? (
            <>
              <label htmlFor="invite-role">{t('Rol')}</label>
              <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Org['role'])}>
                {PLATFORM_ROLES.filter((r) => r !== 'owner' || org.role === 'owner').map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <p className="muted small">{t('Je collega krijgt dezelfde rechten als jij: {role}, met dezelfde steden en spellen.', { role: roleLabel(org.role) })}</p>
          )}
          <div className="actions">
            <button type="submit" disabled={busy}>
              {t('Uitnodigen')}
            </button>
          </div>
        </form>
      ) : (
        <p className="muted">{t('Alleen eigenaren en beheerders kunnen collega\'s uitnodigen.')}</p>
      )}

      {platform ? (
        <>
          <h2>{t('Partners')}</h2>
          <p className="muted small">
            {t('Een partner krijgt een eigen organisatie met eigen hunts en resultaten. Vink per partner de steden aan die hij mag spelen.')}{' '}
            {t('Een partner kan zelf collega\'s uitnodigen met dezelfde rechten, maar nooit als eigenaar of beheerder.')}
          </p>
          <table>
            <tbody>
              {partners.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    {p.owner_email ?? ''} · <span className="muted">{p.accepted ? t('actief') : t('uitgenodigd')}</span> ·{' '}
                    <button className="link" onClick={() => togglePartnerMembers(p.id)}>
                      {t('{n} leden', { n: p.member_count })}
                    </button>
                    {partnerMembers.has(p.id) ? (
                      <ul className="small">
                        {partnerMembers.get(p.id)!.map((m) => (
                          <li key={m.user_id}>
                            {m.email}{' '}
                            {canManage ? (
                              <>
                                <select
                                  aria-label={t('Rol')}
                                  value={m.role}
                                  disabled={busy}
                                  onChange={(e) => changeRole(m, e.target.value as Org['role'], p.id)}
                                >
                                  {withCurrent(PARTNER_ROLES, m.role).map((r) => (
                                    <option key={r} value={r}>
                                      {roleLabel(r)}
                                    </option>
                                  ))}
                                </select>{' '}
                                <button className="link" disabled={busy} onClick={() => removeMember(m, p.id, p.name)}>
                                  {t('Verwijderen')}
                                </button>
                              </>
                            ) : (
                              roleLabel(m.role)
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="small">
                      {cities.length === 0 ? <span className="muted">{t('Nog geen steden om te delen.')}</span> : null}
                      {cities.map((c) => (
                        <label key={c.id} style={{ display: 'inline-flex', gap: 4, marginRight: 12, fontWeight: 'normal' }}>
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={shares.get(p.id)?.has(c.id) ?? false}
                            onChange={(e) => toggleCity(p.id, c.id, e.target.checked)}
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form onSubmit={addPartner}>
            <h3>{t('Partner toevoegen')}</h3>
            <label htmlFor="partner-name">{t('Naam')}</label>
            <input id="partner-name" required minLength={2} maxLength={80} value={partnerName} onChange={(e) => setPartnerName(e.target.value)} />
            <label htmlFor="partner-email">{t('E-mail van de contactpersoon')}</label>
            <input id="partner-email" type="email" required value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} />
            <label htmlFor="partner-note">{t('Omschrijving (alleen voor beheerders van het platform)')}</label>
            <textarea
              id="partner-note"
              rows={2}
              maxLength={1000}
              placeholder={t('Bijvoorbeeld: wie het is, welke afspraken, tot wanneer')}
              value={partnerNote}
              onChange={(e) => setPartnerNote(e.target.value)}
            />
            <div className="actions">
              <button type="submit" disabled={busy}>
                {t('Partner toevoegen')}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </>
  );
}
