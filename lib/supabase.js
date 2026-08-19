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

let refreshPromise;
export async function refreshSession() {
  const session = getSession();
  if (!session?.refresh_token || !configured) return session;
  if (!refreshPromise) refreshPromise = fetch(`${url}/auth/v1/token?grant_type=refresh_token`, { method:'POST', headers:{ apikey:anonKey, 'Content-Type':'application/json' }, body:JSON.stringify({ refresh_token:session.refresh_token }) }).then(async response => {
    const data = await response.json();
    if (!response.ok) { saveSession(null); throw new Error('Sua sessão expirou. Entre novamente.'); }
    saveSession(data); return data;
  }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function validSession() {
  const session = getSession();
  if (!session) return null;
  const expiresAt = Number(session.expires_at || 0) * 1000;
  return expiresAt && expiresAt - Date.now() < 60000 ? refreshSession() : session;
}

async function request(path, options = {}) {
  if (!configured) throw new Error('Configure as variáveis do Supabase na Vercel.');
  const session = await validSession();
  let response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session?.access_token || anonKey}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...options.headers,
    },
  });
  if (response.status === 401 && session?.refresh_token && !options._retried) {
    await refreshSession();
    return request(path, { ...options, _retried:true });
  }
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
  async signOut() { const session=getSession();saveSession(null);if(session?.access_token)await fetch(`${url}/auth/v1/logout`,{method:'POST',headers:{apikey:anonKey,Authorization:`Bearer ${session.access_token}`}}).catch(()=>{}); },
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
  checkout: async (payload) => {
    const result = await request('/rest/v1/rpc/create_order', { method: 'POST', body: JSON.stringify({ payload }) });
    const id = Array.isArray(result) ? result[0]?.id || result[0] : result?.id || result;
    if (!id || typeof id !== 'string') throw new Error('O banco não retornou o identificador do pedido.');
    return id.replace(/^"|"$/g, '');
  },
  donations: () => request('/rest/v1/donations?select=*&order=created_at.desc'),
  createDonation: (donation) => request('/rest/v1/donations', { method: 'POST', body: JSON.stringify(donation) }),
  updateDonation: (id, status) => request(`/rest/v1/donations?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateProfileRole: (id, role) => request(`/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  posCheckout: (payload) => request('/rest/v1/rpc/create_pos_order', { method: 'POST', body: JSON.stringify({ payload }) }),
  report: (from, to) => request(`/rest/v1/orders?select=*,order_items(quantity,unit_price,products(name,category))&created_at=gte.${from}&created_at=lte.${to}&order=created_at.asc`),
  cashSession: async () => {
    const operatorId = getSession()?.user?.id;
    return (await request(`/rest/v1/cash_sessions?status=eq.open&operator_id=eq.${operatorId}&select=*,cash_movements(*)&order=opened_at.desc&limit=1`))[0];
  },
  cashHistory: () => request('/rest/v1/cash_sessions?select=*,profiles(name),cash_movements(*)&order=opened_at.desc'),
  openCash: (openingBalance) => request('/rest/v1/rpc/open_cash_session', { method: 'POST', body: JSON.stringify({ p_opening_balance: Number(openingBalance) }) }),
  cashMovement: (type, amount, reason) => request('/rest/v1/rpc/add_cash_movement', { method: 'POST', body: JSON.stringify({ p_movement_type: type, p_amount: Number(amount), p_reason: reason }) }),
  closeCash: (countedBalance, notes) => request('/rest/v1/rpc/close_cash_session', { method: 'POST', body: JSON.stringify({ p_counted_balance: Number(countedBalance), p_closing_notes: notes }) }),
  trackingEvents: (orderId) => request(`/rest/v1/tracking_events?order_id=eq.${orderId}&select=*&order=occurred_at.asc`),
  addTrackingEvent: (event) => request('/rest/v1/tracking_events', { method: 'POST', body: JSON.stringify(event) }),
  updateProfile: (_id, profile) => request('/rest/v1/rpc/update_my_avatar', { method: 'POST', body: JSON.stringify({ p_avatar_url: profile.avatar_url }) }),
  order: async (id) => (await request(`/rest/v1/orders?id=eq.${id}&select=*,order_items(*,products(name,image_url,size))`))[0],
  addresses: () => request('/rest/v1/customer_addresses?select=*&order=is_default.desc,created_at.desc'),
  saveAddress: (address) => request('/rest/v1/rpc/save_customer_address', { method: 'POST', body: JSON.stringify({ p_address:address }) }),
  deleteAddress: (id) => request(`/rest/v1/customer_addresses?id=eq.${id}`, { method: 'DELETE' }),
  updateMyDetails: (details) => request('/rest/v1/rpc/update_my_details', { method: 'POST', body: JSON.stringify({ p_name: details.name, p_phone: details.phone, p_document: details.document }) }),
  coupons: () => request('/rest/v1/coupons?select=*&order=created_at.desc'),
  createCoupon: (coupon) => request('/rest/v1/coupons', { method: 'POST', body: JSON.stringify(coupon) }),
  updateCoupon: (id, coupon) => request(`/rest/v1/coupons?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(coupon) }),
  deleteCoupon: (id) => request(`/rest/v1/coupons?id=eq.${id}`, { method: 'DELETE' }),
  validateCoupon: (code, subtotal) => request('/rest/v1/rpc/validate_coupon', { method:'POST', body:JSON.stringify({ p_code:code, p_subtotal:subtotal }) }),
  verifyPayment: async (orderId, sessionId) => {
    const response = await fetch('/api/payments/status', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${getSession()?.access_token || ''}` }, body:JSON.stringify({ order_id:orderId, session_id:sessionId }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Não foi possível verificar o pagamento.');
    return data;
  },
  resumePayment: async (order) => {
    const response = await fetch('/api/payments/create', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${getSession()?.access_token || ''}` }, body:JSON.stringify({ order_id:order.id, provider:order.payment_provider, resume:true }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Não foi possível retomar o pagamento.');
    return data;
  },
  financialEntries: () => request('/rest/v1/financial_entries?select=*&order=due_date.desc'),
  createFinancialEntry: (entry) => request('/rest/v1/financial_entries', { method:'POST', body:JSON.stringify(entry) }),
  updateFinancialEntry: (id, entry) => request(`/rest/v1/financial_entries?id=eq.${id}`, { method:'PATCH', body:JSON.stringify(entry) }),
  employees: () => request('/rest/v1/profiles?role=neq.customer&select=*,employee_details(*)&order=name.asc'),
  timeEntries: () => request('/rest/v1/time_entries?select=*,profiles(name,email)&order=clock_in.desc'),
  myOpenTimeEntry: async () => (await request(`/rest/v1/time_entries?employee_id=eq.${getSession()?.user?.id}&clock_out=is.null&select=*&limit=1`))[0],
  toggleTimeClock: (notes='') => request('/rest/v1/rpc/toggle_time_clock', { method:'POST', body:JSON.stringify({ p_notes:notes }) }),
  auditLogs: () => request('/rest/v1/audit_logs?select=*&order=created_at.desc&limit=500'),
};

export { configured };
