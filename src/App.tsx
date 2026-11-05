import { BrowserRouter, Route, Routes } from 'react-router';
import './styles/index.css';
import { ThemeProvider } from './lib/theme';
import { Layout } from './components/layout/Layout';

function Placeholder() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6">
      <h1 className="m-0 text-[clamp(48px,8vw,104px)] font-bold leading-[0.95] tracking-[-0.045em]">Сердце</h1>
      <p className="max-w-[56ch] text-ink-soft">Временная страница для проверки дизайн-системы.</p>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="*" element={<Placeholder />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
