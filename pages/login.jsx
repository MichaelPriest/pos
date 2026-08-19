import Head from '../src/shims/Head';
import Link from '../src/shims/Link';
import { useRouter } from '../src/shims/router';
import { useState } from 'react';
import { auth } from '../lib/supabase';

export default function Login() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [status, setStatus] = useState({ loading: false, error: '' });
  const submit = async (event) => {
    event.preventDefault(); setStatus({ loading: true, error: '' });
    try {
      const result = register ? await auth.signUp(form.name, form.email, form.password) : await auth.signIn(form.email, form.password);
      if (register && !result.access_token) setStatus({ loading: false, error: 'Cadastro realizado! Confirme seu e-mail para entrar.' });
      else {
        const profile = await auth.profile();
        const destination = profile?.role === 'customer' ? '/loja' : profile?.role === 'cashier' ? '/caixa' : '/admin';
        router.push(router.query.next || destination);
      }
    } catch (error) { setStatus({ loading: false, error: error.message }); }
  };
  return <><Head><title>{register ? 'Criar conta' : 'Entrar'} | ReVeste</title></Head><main className="auth-page">
    <section className="auth-art"><Link href="/loja" className="brand auth-brand"><span className="brand-mark">R</span><span>Re<span>Veste</span></span></Link><div><span className="auth-kicker">MODA CIRCULAR</span><h1>Peças com história.<br/>Um novo jeito de vestir.</h1><p>Compre de forma consciente e dê uma nova vida a peças únicas selecionadas à mão.</p></div><small>© 2026 ReVeste · Consumo consciente, estilo autêntico.</small></section>
    <section className="auth-form-wrap"><form className="auth-form" onSubmit={submit}><span className="auth-mobile-logo">ReVeste</span><p className="eyebrow">SUA CONTA</p><h2>{register ? 'Crie sua conta' : 'Que bom ter você de volta'}</h2><p>{register ? 'Cadastre-se para acompanhar seus pedidos.' : 'Entre para continuar suas compras.'}</p>
      {register && <label>Nome completo<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Como podemos te chamar?" /></label>}
      <label>E-mail<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="voce@email.com" /></label>
      <label>Senha<input required minLength="6" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Mínimo de 6 caracteres" /></label>
      {status.error && <div className="form-message">{status.error}</div>}
      <button className="shop-primary" disabled={status.loading}>{status.loading ? 'Aguarde...' : register ? 'Criar minha conta' : 'Entrar'}</button>
      <div className="auth-switch">{register ? 'Já tem uma conta?' : 'Ainda não tem conta?'} <button type="button" onClick={()=>{setRegister(!register);setStatus({loading:false,error:''})}}>{register ? 'Entrar' : 'Cadastre-se grátis'}</button></div>
      <Link href="/loja" className="back-store">← Voltar para a loja</Link>
    </form></section>
  </main></>;
}
