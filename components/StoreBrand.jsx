import { useEffect, useState } from 'react';
import { configured, db } from '../lib/supabase';

export default function StoreBrand({ className = 'brand', suffix = '' }) {
  const [settings, setSettings] = useState({ store_name: 'ReVeste', logo_url: '' });
  useEffect(() => { if (configured) db.settings().then(value => value && setSettings(value)).catch(() => {}); }, []);
  return <span className={className}>
    {settings.logo_url ? <img className="custom-logo" src={settings.logo_url} alt={`Logo ${settings.store_name}`} /> : <span className="brand-mark">{settings.store_name?.charAt(0) || 'R'}</span>}
    <span>{settings.store_name}{suffix && <small>{suffix}</small>}</span>
  </span>;
}
