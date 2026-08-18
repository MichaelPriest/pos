import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { auth, getSession } from '../lib/supabase';

export default function AuthGuard({ admin = false, children }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getSession()) { router.replace(`/login?next=${encodeURIComponent(router.asPath)}`); return; }
    auth.profile().then((profile) => {
      if (admin && profile?.role !== 'admin') router.replace('/loja');
      else setReady(true);
    }).catch(() => { auth.signOut(); router.replace('/login'); });
  }, [admin, router]);

  if (!ready) return <div className="page-loader"><span>R</span><p>Carregando sua experiência...</p></div>;
  return children;
}
