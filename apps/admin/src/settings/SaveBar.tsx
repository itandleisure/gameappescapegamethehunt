'use client';
import { useLanguage } from '@/lib/language';

/** Knop Opslaan met de melding eronder. */
export function SaveBar({
  canEdit,
  dirty,
  busy,
  error,
  notice,
  onSave,
}: {
  canEdit: boolean;
  dirty: boolean;
  busy: string | null;
  error: string | null;
  notice: string | null;
  onSave: () => void;
}) {
  const { t } = useLanguage();
  return (
    <>
      {canEdit ? (
        <div className="actions">
          <button disabled={!!busy || !dirty} onClick={onSave}>
            {t('Opslaan')}
          </button>
        </div>
      ) : (
        <p className="muted">{t('Alleen eigenaren, beheerders en partners kunnen dit wijzigen.')}</p>
      )}
      {busy ? <p className="muted">{busy}</p> : null}
      {dirty && !busy ? <p className="muted">{t('Niet opgeslagen wijzigingen')}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}
    </>
  );
}
