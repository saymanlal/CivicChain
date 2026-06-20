import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, LogOut, ChevronDown, Copy, CheckCircle2, ShieldCheck, Hammer, Crown } from 'lucide-react';
import { useWallet } from '../hooks/useWallet.jsx';
import WalletModal from './WalletModal.jsx';

// Tabs per role
const ROLE_TABS = {
  CITIZEN:        ['Home', 'Feed', 'Submit', 'Analytics', 'Explorer', 'Profile'],
  AUTHORITY:      ['Home', 'Feed', 'Authority', 'Analytics', 'Explorer', 'Profile'],
  MUNICIPAL_TEAM: ['Home', 'Feed', 'Municipal', 'Analytics', 'Explorer', 'Profile'],
  ADMIN:          ['Home', 'Feed', 'Submit', 'Analytics', 'Explorer', 'Profile', 'Authority', 'Municipal', 'Admin'],
};
const DEFAULT_TABS = ['Home', 'Feed', 'Submit', 'Analytics', 'Explorer', 'Profile'];

const ROLE_META = {
  CITIZEN:        { label: 'Citizen',    cls: 'citizen',   icon: null },
  AUTHORITY:      { label: 'Authority',  cls: 'authority', icon: ShieldCheck },
  MUNICIPAL_TEAM: { label: 'Municipal',  cls: 'municipal', icon: Hammer },
  ADMIN:          { label: 'Admin',      cls: 'admin',     icon: Crown },
};

export default function Header({ tab, setTab }) {
  const { wallet, balance, reputation, role, disconnect } = useWallet();
  const [showModal, setShowModal] = useState(false);
  const [showMenu,  setShowMenu]  = useState(false);
  const [copied,    setCopied]    = useState(false);

  const tabs     = role ? (ROLE_TABS[role] || DEFAULT_TABS) : DEFAULT_TABS;
  const roleMeta = role ? ROLE_META[role] : null;
  const RoleIcon = roleMeta?.icon;

  function copyAddr() {
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // If current tab no longer in role's tabs, switch to Feed
  function handleTabChange(t) {
    setTab(t);
    setShowMenu(false);
  }

  const short = addr => addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';

  return (
    <>
      <header className="header">
        <div className="header-inner">
          {/* Logo */}
          <button className="logo" onClick={() => handleTabChange('Home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <span className="logo-diamond"><span /></span>
            <span>Civic<span className="brand-2">Chain</span></span>
          </button>

          {/* Role-based Tabs */}
          <nav className="nav-tabs">
            {tabs.map(t => (
              <button
                key={t}
                className={`nav-tab ${tab === t ? 'active' : ''}`}
                onClick={() => handleTabChange(t)}
              >
                {t}
                {tab === t && (
                  <motion.div className="tab-underline" layoutId="underline" />
                )}
              </button>
            ))}
          </nav>

          {/* Wallet + Role */}
          {wallet ? (
            <div className="wallet-chip-wrap">
              <button className="wallet-chip" onClick={() => setShowMenu(v => !v)}>
                <span className="wallet-dot" />
                <span>{short(wallet.address)}</span>
                {roleMeta && (
                  <span className={`role-badge ${roleMeta.cls}`}>
                    {RoleIcon && <RoleIcon size={9} />}
                    {roleMeta.label}
                  </span>
                )}
                <ChevronDown size={12} />
              </button>
              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    className="wallet-menu"
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.12 }}
                  >
                    <div className="wallet-menu-addr">
                      <code>{wallet.address}</code>
                      <button className="icon-btn small" onClick={copyAddr}>
                        {copied ? <CheckCircle2 size={12}/> : <Copy size={12}/>}
                      </button>
                    </div>
                    {roleMeta && (
                      <div className="wallet-menu-role">
                        <span className={`role-badge ${roleMeta.cls}`} style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}>
                          {RoleIcon && <RoleIcon size={11} />}
                          {roleMeta.label}
                        </span>
                      </div>
                    )}
                    <div className="wallet-menu-stats">
                      <span>Balance <b>{balance}</b></span>
                      <span>Rep <b>{reputation}</b></span>
                    </div>
                    <button className="wallet-menu-item danger" onClick={() => { setShowMenu(false); disconnect(); }}>
                      <LogOut size={13} /> Disconnect
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button className="btn-connect" onClick={() => setShowModal(true)}>
              <Wallet size={14} /> Connect Wallet
            </button>
          )}
        </div>
      </header>

      <AnimatePresence>
        {showModal && <WalletModal onClose={() => setShowModal(false)} />}
      </AnimatePresence>
    </>
  );
}