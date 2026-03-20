const fs = require('fs');
const file = '../ante-social-frontend/src/app/dashboard/markets/page.tsx';
let code = fs.readFileSync(file, 'utf8');

const oldLogic = `      const isStatusClosed = market.status === 'closed';
      const isStatusSettled = ['settled', 'resolved', 'cancelled'].includes(market.status?.toLowerCase() || "");
      const isStatusSettling = market.status === 'settling';
      
      const isExpired = isStatusClosed && 
        new Date(market.endsAt).getTime() <= Date.now() - 24 * 60 * 60 * 1000;
      
      const isPast = isStatusSettled || isExpired;`;

const newLogic = `      const isStatusClosed = market.status === 'closed';
      const isStatusSettled = ['settled', 'resolved', 'cancelled'].includes(market.status?.toLowerCase() || "");
      const isStatusSettling = market.status === 'settling';
      
      // If it's closed, settled, cancelled, resolved, or simply passed its end time
      const isPast = isStatusClosed || isStatusSettled || new Date(market.endsAt).getTime() <= Date.now();`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync(file, code);
