const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs/promises');
const { trainNLP } = require('./nlp/trainManagerV2');
// const { trainNLP } = require('./nlp/trainManager');
const { NlpManager } = require('node-nlp');
const { saveSiteData } = require('./lib/siteManager.js');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
let kb = null;

async function loadKnowledgeBase() {
  if (!kb) {
    const data = await fs.readFile('./knowledge/application_knowledge_base.json', 'utf8');
    kb = JSON.parse(data);
  }
  return kb;
}

loadKnowledgeBase().catch(err => {
  console.error('Failed to load knowledge base:', err);
});

app.use(bodyParser.json());

// 🧠 Endpoint to train model dynamically
// POST /train
app.post('/train', async (req, res) => {
  const { siteId, routingIntents, siteMetadata } = req.body;

  try {
    // Save metadata to disk first
    await saveSiteData(siteId, routingIntents, siteMetadata);

    console.log(`Training NLP model for siteId: ${siteId}`);

    // Load knowledge base
    const kb = await loadKnowledgeBase();
    // console.log('Knowledge Base:', kb);
    // Now train from file-based data
    const result = await trainNLP(siteId, kb);
    res.json(result);
  } catch (error) {
    console.error('[Train Error]', error);
    res.status(500).json({ error: error.message });
  }
});

const MODEL_DIR = path.join(__dirname, 'models');

app.post('/process', async (req, res) => {
  const { siteId, query } = req.body;

  if (!siteId || !query) {
    return res.status(400).json({ error: 'siteId and query are required' });
  }

  try {
    const modelPath = path.join(MODEL_DIR, `${siteId}.nlp.json`);
    await fs.access(modelPath);

    const manager = new NlpManager({ languages: ['en'], forceNER: true });
    await manager.load(modelPath);

    const result = await manager.process('en', query);
    // console.log('Processing result:', result);
    const matchedConceptKey = result.intent?.startsWith('concept.') ? result.intent.split('.')[1] : null;
    console.log(result)
    const matchedConcept = matchedConceptKey
      ? kb.concepts[Object.keys(kb.concepts).find(k => k.replace(/\s+/g, '_').toLowerCase() === matchedConceptKey)]
      : null;

    return res.json({
      siteId,
      query,
      intent: result.intent,
      score: result.score,
      answer: result.answer || null,
      entities: result.entities,
      metadata: matchedConcept ? {
        description: matchedConcept.description,
        categories: matchedConcept.categories,
        related_terms: matchedConcept.related_terms,
        external_links: matchedConcept.external_links,
        priority: matchedConcept.priority,
      } : null
    });

  } catch (error) {
    console.error('[Process Error]', error);
    return res.status(500).json({ error: error.message });
  }
});


app.listen(port, () => {
  console.log(`🚀 NLP agent running at http://localhost:${port}`);
});
