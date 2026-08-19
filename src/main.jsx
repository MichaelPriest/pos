import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './vite-reset.css';
import '../styles/reveste.css';
import UserMenu from '../components/UserMenu';
import AppErrorBoundary from './components/AppErrorBoundary';
import SystemLayout from './components/SystemLayout';

const Store = lazy(() => import('../pages/loja'));
const Product = lazy(() => import('../pages/produto'));
const Favorites = lazy(() => import('../pages/favoritos'));
const Notifications = lazy(() => import('../pages/notificacoes'));
const Login = lazy(() => import('../pages/login'));
const ForgotPassword = lazy(() => import('../pages/esqueci-senha'));
const ResetPassword = lazy(() => import('../pages/redefinir-senha'));
const Account = lazy(() => import('../pages/minha-conta'));
const Checkout = lazy(() => import('../pages/checkout'));
const Donate = lazy(() => import('../pages/doar'));
const Admin = lazy(() => import('../pages/admin'));
const Pos = lazy(() => import('../pages/pdv'));
const Cash = lazy(() => import('../pages/caixa'));
const Reports = lazy(() => import('../pages/relatorios'));
const StaffProfile = lazy(() => import('../pages/perfil'));
const Receipt = lazy(() => import('../pages/comprovante/[id]'));
const Label = lazy(() => import('../pages/etiqueta/[id]'));
const Finance = lazy(() => import('../pages/financeiro'));
const Team = lazy(() => import('../pages/equipe'));
const Employee = lazy(() => import('../pages/funcionario'));
const HR = lazy(() => import('../pages/rh'));
const TimeClock = lazy(() => import('../pages/ponto'));
const Forbidden = lazy(() => import('../pages/forbidden'));
const NotFound = lazy(() => import('../pages/not-found'));
const Audit = lazy(() => import('../pages/auditoria'));

function LoadingScreen(){return <div className="route-loading"><span className="brand-mark">R</span><i/><p>Carregando...</p></div>}

function App(){return <AppErrorBoundary><BrowserRouter><Suspense fallback={<LoadingScreen/>}><Routes><Route path="/" element={<Navigate to="/loja" replace/>}/><Route path="/loja" element={<Store/>}/><Route path="/produto/:id" element={<Product/>}/><Route path="/favoritos" element={<Favorites/>}/><Route path="/notificacoes" element={<Notifications/>}/><Route path="/login" element={<Login/>}/><Route path="/esqueci-senha" element={<ForgotPassword/>}/><Route path="/redefinir-senha" element={<ResetPassword/>}/><Route path="/minha-conta" element={<Account/>}/><Route path="/checkout" element={<Checkout/>}/><Route path="/doar" element={<Donate/>}/><Route path="/comprovante/:id" element={<Receipt/>}/><Route path="/etiqueta/:id" element={<Label/>}/><Route path="/403" element={<Forbidden/>}/><Route element={<SystemLayout/>}><Route path="/admin" element={<Admin/>}/><Route path="/pdv" element={<Pos/>}/><Route path="/caixa" element={<Cash/>}/><Route path="/financeiro" element={<Finance/>}/><Route path="/relatorios" element={<Reports/>}/><Route path="/equipe" element={<Team/>}/><Route path="/equipe/:id" element={<Employee/>}/><Route path="/rh" element={<HR/>}/><Route path="/ponto" element={<TimeClock/>}/><Route path="/auditoria" element={<Audit/>}/><Route path="/perfil" element={<StaffProfile/>}/><Route path="/configuracoes" element={<Navigate to="/admin?tab=Personalizar" replace/>}/></Route><Route path="*" element={<NotFound/>}/></Routes></Suspense><UserMenu/></BrowserRouter></AppErrorBoundary>}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
