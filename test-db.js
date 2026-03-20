const { MongoClient } = require('mongodb');
const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/ante_social";
(async () => {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const markets = await db.collection('markets').find({}).toArray();
  const sources = markets.map(m => m.externalSource || 'undefined');
  console.log(sources.slice(0, 20));
  await client.close();
})();
