// crowdpulse/contracts/ReputationManager.js
//
// Methods:
//   increase({ user, amount, reason })
//   decrease({ user, amount, reason })
//   getScore({ user })
//   getLeaderboard()
//   getTrustLevel({ user })

const contract = {
    methods: {
  
      increase(args) {
        const { user, amount, reason } = args;
  
        require(user,   'User address required');
        require(amount > 0, 'Amount must be positive');
  
        const rep      = getState('reputation') || {};
        rep[user]      = (rep[user] || 0) + amount;
        setState('reputation', rep);
  
        const history  = getState('history') || [];
        history.push({
          user, action: 'increase', amount, reason: reason || '',
          by: msg.sender, at: blockTimestamp
        });
        setState('history', history);
  
        emit('REPUTATION_INCREASED', { user, amount, newScore: rep[user], reason });
        return rep[user];
      },
  
      decrease(args) {
        const { user, amount, reason } = args;
  
        require(user,   'User address required');
        require(amount > 0, 'Amount must be positive');
  
        const rep      = getState('reputation') || {};
        rep[user]      = Math.max(0, (rep[user] || 0) - amount);
        setState('reputation', rep);
  
        const history  = getState('history') || [];
        history.push({
          user, action: 'decrease', amount, reason: reason || '',
          by: msg.sender, at: blockTimestamp
        });
        setState('history', history);
  
        emit('REPUTATION_DECREASED', { user, amount, newScore: rep[user], reason });
        return rep[user];
      },
  
      getScore(args) {
        const rep = getState('reputation') || {};
        return rep[args.user] || 0;
      },
  
      getTrustLevel(args) {
        const rep   = getState('reputation') || {};
        const score = rep[args.user] || 0;
  
        if (score >= 200) return { level: 'EXPERT',    score, color: '#10b981' };
        if (score >= 100) return { level: 'TRUSTED',   score, color: '#3b82f6' };
        if (score >= 50)  return { level: 'VERIFIED',  score, color: '#8b5cf6' };
        if (score >= 20)  return { level: 'ACTIVE',    score, color: '#f59e0b' };
        return             { level: 'NEW',        score, color: '#6b7280' };
      },
  
      getLeaderboard(_args) {
        const rep = getState('reputation') || {};
        return Object.entries(rep)
          .map(([address, score]) => ({ address, score }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 20);
      },
  
      getHistory(args) {
        const history = getState('history') || [];
        if (args.user) {
          return history.filter(h => h.user === args.user);
        }
        return history;
      }
  
    }
  };