// crowdpulse/contracts/RewardManager.js
//
// Tracks civic reward points (not SAYM tokens directly — those are handled by chain transfer).
// Points can later be redeemed or shown as badges.
//
// Methods:
//   award({ user, points, reason })
//   redeem({ user, points })
//   getPoints({ user })
//   getBadges({ user })

const BADGE_THRESHOLDS = [
    { name: 'First Report',     points: 10,   icon: '🏅' },
    { name: 'Active Citizen',   points: 50,   icon: '🌟' },
    { name: 'Trusted Reporter', points: 150,  icon: '💎' },
    { name: 'Civic Hero',       points: 500,  icon: '🦸' },
    { name: 'City Guardian',    points: 1000, icon: '🛡️' }
  ];
  
  const contract = {
    methods: {
  
      award(args) {
        const { user, points, reason } = args;
  
        require(user,     'User address required');
        require(points > 0, 'Points must be positive');
  
        const balances = getState('points') || {};
        balances[user] = (balances[user] || 0) + points;
        setState('points', balances);
  
        const total = (getState('totalAwarded') || 0) + points;
        setState('totalAwarded', total);
  
        emit('POINTS_AWARDED', {
          user, points,
          totalPoints: balances[user],
          reason: reason || '',
          by: msg.sender
        });
  
        return balances[user];
      },
  
      redeem(args) {
        const { user, points } = args;
  
        require(user,      'User address required');
        require(points > 0, 'Points must be positive');
  
        const balances = getState('points') || {};
        require((balances[user] || 0) >= points, 'Insufficient points');
  
        balances[user] -= points;
        setState('points', balances);
  
        emit('POINTS_REDEEMED', { user, points, remaining: balances[user] });
        return balances[user];
      },
  
      getPoints(args) {
        const balances = getState('points') || {};
        return balances[args.user] || 0;
      },
  
      getBadges(args) {
        const balances = getState('points') || {};
        const total    = balances[args.user] || 0;
  
        return BADGE_THRESHOLDS
          .filter(b => total >= b.points)
          .map(b => ({ ...b, earned: true }));
      },
  
      getLeaderboard(_args) {
        const balances = getState('points') || {};
        return Object.entries(balances)
          .map(([address, points]) => ({ address, points }))
          .sort((a, b) => b.points - a.points)
          .slice(0, 20);
      }
  
    }
  };