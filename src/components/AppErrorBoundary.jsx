import React from 'react';

export default class AppErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, details) {
    console.error('ReVeste UI error', error, details);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="app-error"><div className="brand-mark">R</div><p>ALGO NÃO SAIU COMO ESPERADO</p><h1>Não foi possível abrir esta página.</h1><span>Seus dados estão seguros. Atualize a página para tentar novamente.</span><button onClick={() => location.reload()}>Atualizar página</button><a href="/loja">Voltar para a loja</a></main>;
  }
}
