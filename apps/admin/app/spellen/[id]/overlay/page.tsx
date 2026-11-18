'use client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Kaartstijl en verzamelpunt staan nu op de pagina Kaart; oude links sturen daarheen door. */
export default function OverlayRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/spellen/${id}/kaart`);
  }, [id, router]);
  return null;
}
