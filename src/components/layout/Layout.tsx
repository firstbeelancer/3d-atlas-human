import { Outlet } from 'react-router';
import { Header } from './Header';
import { Footer } from './Footer';
import { AdultToggle } from './AdultToggle';

export function Layout() {
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
