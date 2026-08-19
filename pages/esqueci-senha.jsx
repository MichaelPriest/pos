import { useState } from 'react';
import Head from '../src/shims/Head';
import Link from '../src/shims/Link';
import StoreBrand from '../components/StoreBrand';
import { auth } from '../lib/supabase';

export default function ForgotPassword(){
  const [email,setEmail]=useState(''),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
  const submit=async event=>{event.preventDefault();setLoading(true);setMessage('');try{await auth.requestPasswordReset(email.trim().toLowerCase());setMessage('Se este e-mail estiver cadastrado, enviaremos um link seguro para redefinir sua senha.')}catch(error){setMessage(error.message)}finally{setLoading(false)}};
  return <><Head><title>Recuperar senha | ReVeste</title></Head><main className="auth-action-page"><section><Link href="/loja"><StoreBrand/></Link><p className="eyebrow">RECUPERAÇÃO DE ACESSO</p><h1>Esqueceu sua senha?</h1><span>Informe o e-mail da sua conta. O link recebido poderá ser utilizado uma única vez para cadastrar uma nova senha.</span><form onSubmit={submit}><label>E-mail<input required autoFocus type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="voce@email.com"/></label>{message&&<div className="form-message" role="status">{message}</div>}<button className="shop-primary" disabled={loading}>{loading?'Enviando...':'Enviar link de recuperação'}</button></form><Link href="/login">← Voltar ao login</Link></section></main></>;
}
