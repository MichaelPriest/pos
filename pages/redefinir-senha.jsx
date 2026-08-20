import { useEffect, useRef, useState } from 'react';
import Head from '../src/shims/Head';
import Link from '../src/shims/Link';
import StoreBrand from '../components/StoreBrand';
import { auth } from '../lib/supabase';

export default function ResetPassword(){
  const started=useRef(false);
  const [ready,setReady]=useState(false),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[message,setMessage]=useState(''),[done,setDone]=useState(false);
  useEffect(()=>{if(started.current)return;started.current=true;auth.acceptPasswordRecovery().then(()=>setReady(true)).catch(error=>setMessage(error.message))},[]);
  const submit=async event=>{event.preventDefault();if(password.length<8)return setMessage('A nova senha deve ter pelo menos 8 caracteres.');if(password!==confirmation)return setMessage('As senhas informadas não são iguais.');try{await auth.updatePassword(password);setDone(true);setMessage('Senha atualizada com sucesso. Você já pode entrar novamente.');await auth.signOut()}catch(error){setMessage(error.message)}};
  return <><Head><title>Nova senha | ReVeste</title></Head><main className="auth-action-page"><section><Link href="/loja"><StoreBrand/></Link><p className="eyebrow">PROTEJA SUA CONTA</p><h1>Cadastre uma nova senha.</h1>{!ready&&!message&&<span>Validando seu link seguro...</span>}{message&&<div className="form-message" role="status">{message}</div>}{ready&&!done&&<form onSubmit={submit}><label>Nova senha<input required autoFocus minLength="8" type="password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)}/></label><label>Confirmar nova senha<input required minLength="8" type="password" autoComplete="new-password" value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></label><button className="shop-primary">Salvar nova senha</button></form>}{done&&<Link className="shop-primary" href="/login">Entrar com a nova senha</Link>}</section></main></>;
}
