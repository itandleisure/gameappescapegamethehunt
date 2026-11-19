'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth, type Org } from '@/lib/auth';
import { displayName } from '@/lib/game-name';
import type { GameRow } from '@/lib/game-model';
import { tKey } from '@/lib/i18n';
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
}
interface Partner {
  id: string;
  name: string;
  owner_email: string | null;
  accepted: boolean;
}
interface City {
  id: string;
  name: string;
}

const ROLES: { role: Org['role']; label: string }[] = [
  { role: 'owner', label: tKey('Eigenaar') },
  { role: 'admin', label: tKey('Beheerder') },
  { role: 'editor', label: tKey('Redacteur') },
  { role: 'instructor', label: tKey('Spelleider') },
];

/**
 * Toegang tot de beheeromgeving. Registreren kan alleen met een uitnodiging:
 * eigenaren en beheerders nodigen collega's uit, en het platform maakt
 * partners aan (een eigen organisatie met een uitnodiging voor de eigenaar).
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
  const [role, setRole] = useState<Org['role']>('instructor');
  const [partnerName, setPartnerName] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canInvite = !!org && ['owner', 'admin'].includes(org.role);

  const load = useCallback(async () => {
    if (!org) return;
    const db = supabase();
    const [m, i, p, pl] = await Promise.all([
      db.rpc('org_members', { p_org: org.id }),
      db.from('invitations').select('email, role, created_at, accepted_at').eq('org_id', org.id).is('accepted_at', null).order('created_at'),
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
  const roleLabel = (r: Org['role']) => t(ROLES.find((x) => x.role === r)?.label ?? r);
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
      const result = await supabase().rpc('invite_member', { p_org: org.id, p_email: address, p_role: role });
      if (!result.error && !(await mailLink(address))) {
        return { error: { message: t('Uitgenodigd, maar de mail kon niet worden verstuurd. Laat {email} een account aanmaken op {url} met dit e-mailadres.', { email: address, url: loginUrl }) } };
      }
      return result;
    }, t('Uitgenodigd. {email} krijgt een mail met een inloglink en kiest daarna zelf een wachtwoord.', { email: address })).then(() => setEmail(''));
  };
  const addPartner = (e: FormEvent) => {
    e.preventDefault();
    const address = partnerEmail.trim();
    void run(async () => {
      const result = await supabase().rpc('create_partner', { p_name: partnerName, p_owner_email: address });
      if (!result.error && !(await mailLink(address))) {
        return { error: { message: t('Partner aangemaakt, maar de mail kon niet worden verstuurd. Laat {email} een account aanmaken op {url} met dit e-mailadres.', { email: address, url: loginUrl }) } };
      }
      return result;
    }, t('Partner aangemaakt. {email} krijgt een mail met een inloglink en kiest daarna zelf een wachtwoord.', { email: address })).then(() => {
      setPartnerName('');
      setPartnerEmail('');
    });
  };
  const changeRole = (member: Member, next: Org['role']) =>
    void run(async () => supabase().rpc('set_member_role', { p_org: org.id, p_user: member.user_id, p_role: next }), t('Rol gewijzigd.'));
  const removeMember = (member: Member) => {
    if (!window.confirm(t('{email} verwijderen uit {org}? Het account gaat dicht als het nergens anders lid van is.', { email: member.email, org: org.name }))) return;
    void run(async () => supabase().rpc('remove_member', { p_org: org.id, p_user: member.user_id }), t('Lid verwijderd.'));
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
                {canInvite && m.user_id !== user?.id && (m.role !== 'owner' || org.role === 'owner') ? (
                  <>
                    <select aria-label={t('Rol')} value={m.role} disabled={busy} onChange={(e) => changeRole(m, e.target.value as Org['role'])}>
                      {ROLES.filter((r) => r.role !== 'owner' || org.role === 'owner').map((r) => (
                        <option key={r.role} value={r.role}>
                          {t(r.label)}
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
                {canInvite ? (
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
          <label htmlFor="invite-role">{t('Rol')}</label>
          <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Org['role'])}>
            {ROLES.filter((r) => r.role !== 'owner' || org.role === 'owner').map((r) => (
              <option key={r.role} value={r.role}>
                {t(r.label)}
              </option>
            ))}
          </select>
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
            {t('Een partner krijgt een eigen organisatie met eigen hunts en resultaten. Vink per partner de steden aan die hij mag spelen.')}
          </p>
          <table>
            <tbody>
              {partners.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    {p.owner_email ?? ''} · <span className="muted">{p.accepted ? t('actief') : t('uitgenodigd')}</span>
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
            <label htmlFor="partner-email">{t('E-mail van de eigenaar')}</label>
            <input id="partner-email" type="email" required value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} />
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
