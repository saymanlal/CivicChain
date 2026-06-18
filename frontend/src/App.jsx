import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { WalletProvider } from './hooks/useWallet.jsx';
import { useWallet } from './hooks/useWallet.jsx';
import Header from './components/Header.jsx';
import WalletModal from './components/WalletModal.jsx';
import FeedPage      from './pages/FeedPage.jsx';
import SubmitPage    from './pages/SubmitPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import ProfilePage   from './pages/ProfilePage.jsx';
import AuthorityPage from './pages/AuthorityPage.jsx';
import MunicipalPage from './pages/MunicipalPage.jsx';
import AdminPage     from './pages/AdminPage.jsx';

const PAGE_MAP = {
  Feed:      FeedPage,
  Submit:    SubmitPage,
  Analytics: AnalyticsPage,
  Profile:   ProfilePage,
  Authority: AuthorityPage,
  Municipal: MunicipalPage,
  Admin:     AdminPage,
};

// Valid tabs per role — keeps tab in sync when role changes
const ROLE_DEFAULT_TABS = {
  CITIZEN:        'Feed',
  AUTHORITY:      'Feed',
  MUNICIPAL_TEAM: 'Feed',
  ADMIN:          'Feed',
};

function AppInner() {
  const [tab,         setTab]         = useState('Feed');
  const [walletModal, setWalletModal] = useState(false);
  const { role } = useWallet();

  // Reset to Feed if the current tab is no longer in the role's allowed tabs
  useEffect(() => {
    const roleTabs = {
      CITIZEN:        ['Feed', 'Submit', 'Analytics', 'Profile'],
      AUTHORITY:      ['Feed', 'Authority', 'Analytics', 'Profile'],
      MUNICIPAL_TEAM: ['Feed', 'Municipal', 'Analytics', 'Profile'],
      ADMIN:          ['Feed', 'Submit', 'Analytics', 'Profile', 'Authority', 'Municipal', 'Admin'],
    };
    if (role && roleTabs[role] && !roleTabs[role].includes(tab)) {
      setTab('Feed');
    }
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  const Page = PAGE_MAP[tab] || FeedPage;

  return (
    <div className="app">
      {/* Ambient grid background */}
      <div className="bg-grid" aria-hidden />
      <div className="bg-glow" aria-hidden />

      <Header tab={tab} setTab={setTab} />

      <main className="main">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            style={{ width: '100%' }}
          >
            <Page onConnect={() => setWalletModal(true)} />
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