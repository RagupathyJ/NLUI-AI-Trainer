const fs = require('fs/promises');
const path = require('path');
const { NlpManager } = require('node-nlp');
const { loadSiteData } = require('./../lib/siteManager.js');

const MODEL_DIR = path.join(__dirname, '../','models');

const trainNLP = async (siteId, knowledgeBase = {}) => {
  const siteData = await loadSiteData(siteId);
  if (!siteData) {
    throw new Error(`Site data for siteId '${siteId}' not found.`);
  }

  console.log(`Training NLP model for siteId: ${siteId}`);
  console.log('Routing Intents:', siteData.routingIntents);
  console.log('Site Metadata:', siteData.siteMetadata);

  const { routingIntents = [], siteMetadata = {} } = siteData;

  const manager = new NlpManager({ languages: ['en'], forceNER: true });

  // Add intents and utterances
  for (const intent of routingIntents) {
    for (const phrase of intent.phrases || []) {
      manager.addDocument('en', phrase, intent.name);
    }
  }

  // Add dynamic entity for page names
for (const page of siteMetadata.pages || []) {
  const baseUtterances = [
    'go to %page%',
    'navigate to %page%',
    'open %page% page',
    'take me to %page%',
    'show me the %page% page'
  ];

  // Register the entity for NLP
  manager.addNamedEntityText('page', page.name, ['en'], [page.name, ...(page.synonyms || [])]);

  // Add training utterances for each variation
  const phrases = [page.name, ...(page.synonyms || [])];

  for (const phrase of phrases) {
    for (const template of baseUtterances) {
      const utterance = template.replace('%page%', phrase);
      manager.addDocument('en', utterance, 'navigate_to_page');
    }
  }
}
  // Add knowledge base concepts
  if (knowledgeBase.concepts) {
    Object.entries(knowledgeBase.concepts).forEach(([conceptKey, concept]) => {
      const intentName = `concept.${conceptKey.replace(/\s+/g, '_').toLowerCase()}`;

      // Add intent examples
      if (Array.isArray(concept.intent_examples)) {
        concept.intent_examples.forEach(example => {
          manager.addDocument('en', example, intentName);
        });
      }

      // Add answers
      if (Array.isArray(concept.faq)) {
        concept.faq.forEach(faqItem => {
          manager.addAnswer('en', intentName, faqItem.answer);
        });
      } else if (concept.description) {
        manager.addAnswer('en', intentName, concept.description);
      }
    });
  }

  await manager.train();
  await fs.mkdir(MODEL_DIR, { recursive: true });
  await manager.save(path.join(MODEL_DIR, `${siteId}.nlp.json`));

  return { status: 'trained', siteId };
};

module.exports = { trainNLP };
