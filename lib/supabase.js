const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const configured = Boolean(url && anonKey);
const sessionKey = 'reveste_session';

export const getSession = () => {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(sessionKey)); } catch { return null; }
};

export const saveSession = (session) => {
  if (typeof window === 'undefined') return;
  session ? localStorage.setItem(sessionKey, JSON.stringify(session)) : localStorage.removeItem(sessionKey);
};

async function request(path, options = {}) {
  if (!configured) throw new Error('Configure as variáveis do Supabase na Vercel.');
  const session = getSession();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session?.access_token || anonKey}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...options.headers,
    },
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || 'Não foi possível concluir a operação.');
  return data;
}

export const auth = {
  async signIn(email, password) {
    const session = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
    saveSession(session); return session;
  },
  async signUp(name, email, password) {
    const session = await request('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password, data: { name } }) });
    if (session.access_token) saveSession(session); return session;
  },
  async profile() {
    const session = getSession();
    if (!session) return null;
    const rows = await request(`/rest/v1/profiles?id=eq.${session.user.id}&select=*`);
    return rows[0] || null;
  },
  signOut() { saveSession(null); },
};

export const db = {
  products: (onlyActive = true) => request(`/rest/v1/products?select=*&order=created_at.desc${onlyActive ? '&active=eq.true&stock=gt.0' : ''}`),
  orders: () => request('/rest/v1/orders?select=*,order_items(*,products(name,image_url,size))&order=created_at.desc'),
  profiles: () => request('/rest/v1/profiles?select=*&order=created_at.desc'),
  settings: async () => (await request('/rest/v1/store_settings?id=eq.1&select=*'))[0],
  createProduct: (product) => request('/rest/v1/products', { method: 'POST', body: JSON.stringify(product) }),
  updateProduct: (id, product) => request(`/rest/v1/products?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(product) }),
  deleteProduct: (id) => request(`/rest/v1/products?id=eq.${id}`, { method: 'DELETE' }),
  updateOrder: (id, status) => request(`/rest/v1/orders?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateShipment: (id, shipment) => request(`/rest/v1/orders?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(shipment) }),
  updateSettings: (settings) => request('/rest/v1/store_settings?id=eq.1', { method: 'PATCH', body: JSON.stringify(settings) }),
  checkout: (payload) => request('/rest/v1/rpc/create_order', { method: 'POST', body: JSON.stringify({ payload }) }),
  donations: () => request('/rest/v1/donations?select=*&order=created_at.desc'),
  createDonation: (donation) => request('/rest/v1/donations', { method: 'POST', body: JSON.stringify(donation) }),
  updateDonation: (id, status) => request(`/rest/v1/donations?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateProfileRole: (id, role) => request(`/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  posCheckout: (payload) => request('/rest/v1/rpc/create_pos_order', { method: 'POST', body: JSON.stringify({ payload }) }),
  report: (from, to) => request(`/rest/v1/orders?select=*,order_items(quantity,unit_price,products(name,category))&created_at=gte.${from}&created_at=lte.${to}&order=created_at.asc`),
  cashSession: async () => (await request('/rest/v1/cash_sessions?status=eq.open&select=*,cash_movements(*)&order=opened_at.desc&limit=1'))[0],
  cashHistory: () => request('/rest/v1/cash_sessions?select=*,profiles(name),cash_movements(*)&order=opened_at.desc'),
  openCash: (openingBalance) => request('/rest/v1/rpc/open_cash_session', { method: 'POST', body: JSON.stringify({ p_opening_balance: Number(openingBalance) }) }),
  cashMovement: (type, amount, reason) => request('/rest/v1/rpc/add_cash_movement', { method: 'POST', body: JSON.stringify({ p_movement_type: type, p_amount: Number(amount), p_reason: reason }) }),
  closeCash: (countedBalance, notes) => request('/rest/v1/rpc/close_cash_session', { method: 'POST', body: JSON.stringify({ p_counted_balance: Number(countedBalance), p_closing_notes: notes }) }),
  trackingEvents: (orderId) => request(`/rest/v1/tracking_events?order_id=eq.${orderId}&select=*&order=occurred_at.asc`),
  addTrackingEvent: (event) => request('/rest/v1/tracking_events', { method: 'POST', body: JSON.stringify(event) }),
  updateProfile: (_id, profile) => request('/rest/v1/rpc/update_my_avatar', { method: 'POST', body: JSON.stringify({ p_avatar_url: profile.avatar_url }) }),
  order: async (id) => (await request(`/rest/v1/orders?id=eq.${id}&select=*,order_items(*,products(name,image_url,size))`))[0],
};

export { configured };
