import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { WalletProvider } from './hooks/useWallet.jsx';
import { useWallet } from './hooks/useWallet.jsx';
import Header from './components/Header.jsx';
import WalletModal from './components/WalletModal.jsx';
import HomePage from './pages/HomePage.jsx';
import FeedPage from './pages/FeedPage.jsx';
import SubmitPage from './pages/SubmitPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import ExplorerPage from './pages/ExplorerPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import AuthorityPage from './pages/AuthorityPage.jsx';
import MunicipalPage from './pages/MunicipalPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

const PAGE_MAP = {
  Home: HomePage,
  Feed: FeedPage,
  Submit: SubmitPage,
  Analytics: AnalyticsPage,
  Explorer: ExplorerPage,
  Profile: ProfilePage,
  Authority: AuthorityPage,
  Municipal: MunicipalPage,
  Admin: AdminPage,
};

// Valid tabs per role — keeps tab in sync when role changes
const ROLE_TABS = {
  CITIZEN: ['Home', 'Feed', 'Submit', 'Analytics', 'Explorer', 'Profile'],
  AUTHORITY: ['Home', 'Feed', 'Authority', 'Analytics', 'Explorer', 'Profile'],
  MUNICIPAL_TEAM: ['Home', 'Feed', 'Municipal', 'Analytics', 'Explorer', 'Profile'],
  ADMIN: ['Home', 'Feed', 'Submit', 'Analytics', 'Explorer', 'Profile', 'Authority', 'Municipal', 'Admin'],
};

function AppInner() {
  const [tab, setTab] = useState('Home');
  const [walletModal, setWalletModal] = useState(false);
  const { role } = useWallet();

  // Reset to Home if the current tab is no longer in the role's allowed tabs
  useEffect(() => {
    if (role && ROLE_TABS[role] && !ROLE_TABS[role].includes(tab)) {
      setTab('Home');
    }
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  const Page = PAGE_MAP[tab] || HomePage;
  const isFull = tab === 'Home';

  return (
    <div className="app">
      {/* Ambient grid background */}
      <div className="bg-grid" aria-hidden />
      <div className="bg-glow" aria-hidden />

      <Header tab={tab} setTab={setTab} />

      <main className={isFull ? 'main-full' : 'main'}>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            style={{ width: '100%' }}
          >
            <Page setTab={setTab} onConnect={() => setWalletModal(true)} />
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {walletModal && <WalletModal onClose={() => setWalletModal(false)} />}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <AppInner />
    </WalletProvider>
  );
}