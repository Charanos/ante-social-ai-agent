const axios = require('axios');

async function findUnsettled() {
  try {
    const response = await axios.get('http://localhost:3003/markets?status=closed&limit=100');
    const closedMarkets = response.data.data;
    
    const unsettled = closedMarkets.filter(m => !m.winningOptionId);
    
    console.log(`Found ${unsettled.length} unsettled markets:`);
    unsettled.forEach(m => {
      console.log(`- ID: ${m._id}, Title: ${m.title}, EndsAt: ${m.endsAt}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

findUnsettled();
