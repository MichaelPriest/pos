import '../styles/reveste.css';
import UserMenu from '../components/UserMenu';

function MyApp({ Component, pageProps }) {
  return <><Component {...pageProps} /><UserMenu /></>;
}

export default MyApp;
