import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/yeseva-one/400.css';
import '@fontsource/great-vibes/400.css';
import './theme.css';
import { useConnected } from './socket';
import { PlayerPage } from './player/PlayerPage';
import { ScreenPage } from './screen/ScreenPage';
import { AdminPage } from './admin/AdminPage';

function App() {
  const connected = useConnected();
  return (
    <>
      {!connected && <div className="offline">Нет связи… переподключаемся</div>}
      <Routes>
        <Route path="/" element={<PlayerPage />} />
        <Route path="/screen" element={<ScreenPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
