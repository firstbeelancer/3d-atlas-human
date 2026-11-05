import { useEffect } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router';
import { Header } from './Header';
import { Footer } from './Footer';
import { AdultToggle } from './AdultToggle';

/** Новая страница открывается сверху; ссылка с #якорем прокручивает к нужному блоку. */
function useScrollOnNavigate() {
  const { pathname, hash } = useLocation();
  const type = useNavigationType();
  useEffect(() => {
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
      return;
    }
    if (type !== 'POP') window.scrollTo(0, 0);
  }, [pathname, hash, type]);
}

export function Layout() {
  useScrollOnNavigate();
  return (
    <div className="flex min-h-dvh flex-col">
      <Header tools={<AdultToggle />} />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
