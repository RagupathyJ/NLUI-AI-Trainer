const fs  = require('fs/promises');
const  path = require('path');

const dataDir = path.join(__dirname, '../data/sites');

 async function saveSiteData(siteId, routingIntents, siteMetadata) {
  const filePath = path.join(dataDir, `${siteId}.json`);
  const data = { routingIntents, siteMetadata };
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

 async function loadSiteData(siteId) {
  const filePath = path.join(dataDir, `${siteId}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = { saveSiteData, loadSiteData };
