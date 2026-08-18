import Head from 'next/head';
import { useMemo, useState } from 'react';

const products = [
  { id: 1, name: 'Vestido Floral Vintage', category: 'Vestidos', size: 'M', price: 89.9, stock: 1, color: '#e9b9ac', emoji: '👗' },
  { id: 2, name: 'Jaqueta Jeans Oversized', category: 'Casacos', size: 'G', price: 129.9, stock: 2, color: '#aac1cf', emoji: '🧥' },
  { id: 3, name: 'Bolsa Couro Caramelo', category: 'Acessórios', size: 'Único', price: 74.9, stock: 1, color: '#c99d78', emoji: '👜' },
  { id: 4, name: 'Camisa Linho Natural', category: 'Camisas', size: 'P', price: 65.9, stock: 3, color: '#ded3be', emoji: '👚' },
  { id: 5, name: 'Calça Alfaiataria Bege', category: 'Calças', size: '38', price: 98.9, stock: 1, color: '#c7b79e', emoji: '👖' },
  { id: 6, name: 'Tênis Retrô Branco', category: 'Calçados', size: '37', price: 119.9, stock: 1, color: '#d7d8d3', emoji: '👟' },
];

const Icon = ({ name }) => {
  const icons = { home: '⌂', box: '◇', sale: '▣', user: '♙', chart: '⌁', tag: '◇', store: '▤', settings: '⚙', help: '?', search: '⌕', bell: '♢', plus: '+', arrow: '→', trend: '↗', bag: '▢', menu: '☰' };
  return <span className="icon" aria-hidden="true">{icons[name]}</span>;
};

const money = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Home() {
  const [active, setActive] = useState('Visão geral');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [cart, setCart] = useState([]);
  const [toast, setToast] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);

  const filtered = useMemo(() => products.filter((product) =>
    (category === 'Todos' || product.category === category) &&
    product.name.toLowerCase().includes(query.toLowerCase())
  ), [category, query]);

  const addToCart = (product) => {
    setCart((current) => [...current, product]);
    setToast(`${product.name} adicionado à venda`);
    setTimeout(() => setToast(''), 2200);
  };

  const nav = [
    ['Visão geral', 'home'], ['Produtos', 'box'], ['Vendas', 'sale'], ['Clientes', 'user'],
    ['Relatórios', 'chart'], ['Categorias', 'tag'], ['Loja online', 'store']
  ];

  return (
    <>
      <Head>
        <title>ReVeste — Gestão do brechó</title>
        <meta name="description" content="Gestão completa e vendas para brechós." />
      </Head>
      <div className="app-shell">
        <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
          <div className="brand"><span className="brand-mark">R</span><span>Re<span>Veste</span></span></div>
          <div className="store-card">
            <div className="store-avatar">CA</div>
            <div><strong>Closet da Ana</strong><small>Plano Essencial</small></div>
            <button aria-label="Opções da loja">⌄</button>
          </div>
          <nav>
            <p className="nav-label">MENU PRINCIPAL</p>
            {nav.map(([label, icon]) => (
              <button key={label} className={active === label ? 'active' : ''} onClick={() => { setActive(label); setMobileMenu(false); }}>
                <Icon name={icon} />{label}{label === 'Vendas' && <span className="nav-badge">8</span>}
              </button>
            ))}
            <p className="nav-label lower">CONFIGURAÇÕES</p>
            <button><Icon name="settings" />Configurações</button>
            <button><Icon name="help" />Central de ajuda</button>
          </nav>
          <div className="upgrade-card">
            <div className="spark">✦</div><strong>Desbloqueie mais</strong>
            <p>Tenha relatórios avançados e loja online completa.</p>
            <button>Conhecer o Pro <Icon name="arrow" /></button>
          </div>
          <div className="profile"><div className="avatar">AR</div><div><strong>Ana Rodrigues</strong><small>ana@closet.com</small></div><span>•••</span></div>
        </aside>

        <main>
          <header className="topbar">
            <button className="mobile-toggle" onClick={() => setMobileMenu(!mobileMenu)}><Icon name="menu" /></button>
            <div className="global-search"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar produtos, clientes ou vendas..." /><kbd>⌘ K</kbd></div>
            <button className="icon-button" aria-label="Notificações"><Icon name="bell" /><i /></button>
            <button className="primary-button" onClick={() => setToast('Nova venda iniciada! Escolha os produtos abaixo.')}><Icon name="plus" /> Nova venda</button>
          </header>

          <div className="content">
            <section className="welcome-row">
              <div><p className="eyebrow">TERÇA-FEIRA, 18 DE AGOSTO</p><h1>Bom dia, Ana! <span>👋</span></h1><p>Acompanhe o desempenho do seu brechó hoje.</p></div>
              <div className="period-picker"><button className="selected">Hoje</button><button>7 dias</button><button>30 dias</button><button>Este ano</button></div>
            </section>

            <section className="stats-grid">
              <article className="stat-card"><div className="stat-icon green">$</div><div className="stat-heading"><span>Faturamento hoje</span><span className="positive"><Icon name="trend" /> 12,5%</span></div><strong>{money(1284.5)}</strong><small>Ontem: R$ 1.141,80</small></article>
              <article className="stat-card"><div className="stat-icon peach"><Icon name="bag" /></div><div className="stat-heading"><span>Vendas realizadas</span><span className="positive"><Icon name="trend" /> 8,2%</span></div><strong>18</strong><small>Ticket médio: R$ 71,36</small></article>
              <article className="stat-card"><div className="stat-icon violet">♙</div><div className="stat-heading"><span>Novos clientes</span><span className="positive"><Icon name="trend" /> 5,4%</span></div><strong>7</strong><small>Total de clientes: 384</small></article>
              <article className="stat-card"><div className="stat-icon blue">◇</div><div className="stat-heading"><span>Peças em estoque</span><span className="low">9 com estoque baixo</span></div><strong>247</strong><small>32 novas este mês</small></article>
            </section>

            <section className="dashboard-grid">
              <article className="panel sales-panel">
                <div className="panel-title"><div><h2>Vendas da semana</h2><p>Comparativo de faturamento diário</p></div><button>Ver relatório <Icon name="arrow" /></button></div>
                <div className="chart-wrap">
                  <div className="y-axis"><span>R$ 2k</span><span>R$ 1,5k</span><span>R$ 1k</span><span>R$ 500</span><span>R$ 0</span></div>
                  <div className="chart">
                    <div className="grid-lines"><i/><i/><i/><i/><i/></div>
                    <svg viewBox="0 0 680 190" preserveAspectRatio="none" aria-label="Gráfico de vendas">
                      <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4d7c63" stopOpacity=".25"/><stop offset="1" stopColor="#4d7c63" stopOpacity="0"/></linearGradient></defs>
                      <path className="area" d="M0 145 C55 140,75 105,110 112 S185 145,225 103 S300 88,340 96 S415 120,455 82 S530 38,570 52 S640 46,680 20 L680 190 L0 190Z" />
                      <path className="line" d="M0 145 C55 140,75 105,110 112 S185 145,225 103 S300 88,340 96 S415 120,455 82 S530 38,570 52 S640 46,680 20" />
                      {[['0','145'],['110','112'],['225','103'],['340','96'],['455','82'],['570','52'],['680','20']].map(([cx,cy]) => <circle key={cx} cx={cx} cy={cy} r="5" />)}
                    </svg>
                    <div className="x-axis"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span></div>
                  </div>
                </div>
                <div className="chart-summary"><span><i className="dot current"/>Esta semana <strong>R$ 7.842,60</strong></span><span><i className="dot previous"/>Semana anterior <strong>R$ 6.951,20</strong></span><span className="growth">+12,8% de crescimento</span></div>
              </article>

              <article className="panel recent-panel">
                <div className="panel-title"><div><h2>Vendas recentes</h2><p>Últimas transações realizadas</p></div><button aria-label="Mais opções">•••</button></div>
                <div className="transactions">
                  {[['Mariana Costa','2 peças','R$ 189,80','Pix','MC','mint'],['Júlia Fernandes','1 peça','R$ 129,90','Cartão','JF','pink'],['Camila Oliveira','3 peças','R$ 247,70','Dinheiro','CO','purple'],['Beatriz Lima','1 peça','R$ 74,90','Pix','BL','orange']].map((sale) => (
                    <div className="transaction" key={sale[0]}><div className={`customer ${sale[5]}`}>{sale[4]}</div><div><strong>{sale[0]}</strong><small>{sale[1]} · Hoje, {sale[0] === 'Mariana Costa' ? '10:42' : sale[0] === 'Júlia Fernandes' ? '10:18' : sale[0] === 'Camila Oliveira' ? '09:56' : '09:31'}</small></div><div className="sale-value"><strong>{sale[2]}</strong><small>{sale[3]}</small></div></div>
                  ))}
                </div>
                <button className="all-sales">Ver todas as vendas <Icon name="arrow" /></button>
              </article>
            </section>

            <section className="panel products-panel">
              <div className="panel-title"><div><h2>Produtos em destaque</h2><p>Peças com mais visualizações na sua loja</p></div><div className="product-actions"><div className="mini-search"><Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar peça" /></div><select value={category} onChange={(e) => setCategory(e.target.value)}><option>Todos</option>{[...new Set(products.map(p => p.category))].map(c => <option key={c}>{c}</option>)}</select></div></div>
              <div className="product-list">
                {filtered.map((product) => <article className="product" key={product.id} onClick={() => addToCart(product)}>
                  <div className="product-image" style={{ backgroundColor: product.color }}><span>{product.emoji}</span><button aria-label="Adicionar à venda">+</button></div>
                  <div><p className="product-category">{product.category}</p><h3>{product.name}</h3><span className="size">Tam. {product.size}</span><div className="product-foot"><strong>{money(product.price)}</strong><small>{product.stock} {product.stock === 1 ? 'unidade' : 'unidades'}</small></div></div>
                </article>)}
              </div>
            </section>
          </div>
        </main>
        {cart.length > 0 && <button className="cart-float" onClick={() => setToast(`${cart.length} ${cart.length === 1 ? 'item' : 'itens'} · Total ${money(cart.reduce((a,p) => a + p.price, 0))}`)}><Icon name="bag" /><span>{cart.length}</span></button>}
        {toast && <div className="toast">✓ {toast}</div>}
      </div>
    </>
  );
}
