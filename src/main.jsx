import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './vite-reset.css';
import '../styles/reveste.css';
import UserMenu from '../components/UserMenu';
import SystemLayout from './components/SystemLayout';
import Store from '../pages/loja';
import Login from '../pages/login';
import Account from '../pages/minha-conta';
import Checkout from '../pages/checkout';
import Donate from '../pages/doar';
import Admin from '../pages/admin';
import Pos from '../pages/pdv';
import Cash from '../pages/caixa';
import Reports from '../pages/relatorios';
import StaffProfile from '../pages/perfil';
import Receipt from '../pages/comprovante/[id]';
import Label from '../pages/etiqueta/[id]';

function App(){return <BrowserRouter><Routes><Route path="/" element={<Navigate to="/loja" replace/>}/><Route path="/loja" element={<Store/>}/><Route path="/login" element={<Login/>}/><Route path="/minha-conta" element={<Account/>}/><Route path="/checkout" element={<Checkout/>}/><Route path="/doar" element={<Donate/>}/><Route path="/comprovante/:id" element={<Receipt/>}/><Route path="/etiqueta/:id" element={<Label/>}/><Route element={<SystemLayout/>}><Route path="/pdv" element={<Pos/>}/><Route path="/caixa" element={<Cash/>}/><Route path="/relatorios" element={<Reports/>}/><Route path="/perfil" element={<StaffProfile/>}/><Route path="/configuracoes" element={<Navigate to="/admin?tab=Personalizar" replace/>}/></Route><Route path="/admin" element={<Admin/>}/><Route path="*" element={<Navigate to="/loja" replace/>}/></Routes><UserMenu/></BrowserRouter>}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
