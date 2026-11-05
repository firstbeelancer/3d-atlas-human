import { BrowserRouter, Route, Routes } from 'react-router';
import './styles/index.css';
import { ThemeProvider } from './lib/theme';
import { AdultProvider } from './lib/adult';
import { Layout } from './components/layout/Layout';
import { HomePage } from './pages/HomePage';
import { SectionPage } from './pages/SectionPage';
import { AboutPage } from './pages/AboutPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ComingSoon } from './components/section/ComingSoon';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="razdel/:slug" element={<SectionPage />} />
        <Route path="kletki/:slug" element={<ComingSoon />} />
        <Route path="o-proekte" element={<AboutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AdultProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AdultProvider>
    </ThemeProvider>
  );
}
