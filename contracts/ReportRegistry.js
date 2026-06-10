// crowdpulse/contracts/ReportRegistry.js
// Deploy to SAYMAN with: node scripts/deploy.js
//
// Methods:
//   createReport({ id, category, location, severity, evidenceHash, description })
//   updateStatus({ id, status, note })
//   getReport({ id })
//   getAllReports()
//   getOpenReports()

const contract = {
    methods: {
  
      createReport(args) {
        const { id, category, location, severity, evidenceHash, description } = args;
  
        require(id,       'Report ID is required');
        require(category, 'Category is required');
  
        const reports = getState('reports') || {};
  
        require(!reports[id], `Report ${id} already exists`);
  
        reports[id] = {
          id,
          category,
          location:     location     || {},
          severity:     severity     || 'MEDIUM',
          evidenceHash: evidenceHash || null,
          description:  description  || '',
          reporter:     msg.sender,
          status:       'OPEN',
          createdAt:    blockTimestamp,
          verifiedAt:   null,
          resolvedAt:   null
        };
  
        setState('reports', reports);
  
        // Increment total count
        const count = (getState('totalReports') || 0) + 1;
        setState('totalReports', count);
  
        emit('REPORT_CREATED', {
          id,
          category,
          severity,
          reporter: msg.sender,
          location
        });
  
        return reports[id];
      },
  
      updateStatus(args) {
        const { id, status, note } = args;
  
        require(id,     'Report ID is required');
        require(status, 'Status is required');
  
        const validStatuses = ['OPEN', 'VERIFIED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'];
        require(validStatuses.includes(status), `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  
        const reports = getState('reports') || {};
        require(reports[id], `Report ${id} not found`);
  
        const prev = reports[id].status;
        reports[id].status     = status;
        reports[id].updatedBy  = msg.sender;
        reports[id].note       = note || reports[id].note;
  
        if (status === 'RESOLVED') {
          reports[id].resolvedAt = blockTimestamp;
        }
        if (status === 'VERIFIED') {
          reports[id].verifiedAt = blockTimestamp;
        }
  
        setState('reports', reports);
  
        emit('STATUS_CHANGED', {
          id,
          from:      prev,
          to:        status,
          updatedBy: msg.sender
        });
  
        return reports[id];
      },
  
      verifyReport(args) {
        const { id, confidence, aiCategory } = args;
  
        require(id, 'Report ID is required');
  
        const reports = getState('reports') || {};
        require(reports[id], `Report ${id} not found`);
  
        reports[id].verified   = true;
        reports[id].confidence = confidence || 0;
        reports[id].aiCategory = aiCategory || reports[id].category;
        reports[id].status     = 'VERIFIED';
        reports[id].verifiedAt = blockTimestamp;
  
        setState('reports', reports);
  
        emit('REPORT_VERIFIED', {
          id,
          confidence,
          aiCategory,
          verifiedBy: msg.sender
        });
  
        return reports[id];
      },
  
      getReport(args) {
        const reports = getState('reports') || {};
        return reports[args.id] || null;
      },
  
      getAllReports(_args) {
        return Object.values(getState('reports') || {});
      },
  
      getOpenReports(_args) {
        const reports = Object.values(getState('reports') || {});
        return reports.filter(r => r.status === 'OPEN');
      },
  
      getReportsByCategory(args) {
        const reports = Object.values(getState('reports') || {});
        return reports.filter(r => r.category === args.category);
      },
  
      getTotalReports(_args) {
        return getState('totalReports') || 0;
      }
  
    }
  };