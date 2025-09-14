// trainNLP.js
const fs = require('fs/promises');
const path = require('path');
const { NlpManager } = require('node-nlp');
const { loadSiteData } = require('./../lib/siteManager.js');

const MODEL_DIR = path.join(__dirname, '../', 'models');

/**
 * Train NLP model for a site with routing intents and knowledge base
 */
const trainNLP = async (siteId, knowledgeBase = {}) => {
  const siteData = await loadSiteData(siteId);
  if (!siteData) {
    throw new Error(`Site data for siteId '${siteId}' not found.`);
  }

  console.log(`Training NLP model for siteId: ${siteId}`);

  const { routingIntents = [], siteMetadata = {} } = siteData;
  const manager = new NlpManager({ languages: ['en'], forceNER: true });

  // Base navigation utterances
  const baseUtterances = [
    'go to %page%',
    'navigate to %page%',
    'open %page% page',
    'take me to %page%',
    'show me the %page% page'
  ];

  // Param keywords
  const paramKeywordsMap = {
    memberId: ['member', 'member id', 'id'],
    policyId: ['policy', 'policy id', 'policy number'],
    claimId: ['claim', 'claim id', 'claim number'],
    authId: ['authorization', 'auth id'],
    appealId: ['appeal', 'appeal id'],
    reviewId: ['review', 'review id'],
    attachmentId: ['attachment', 'attachment id'],
    auditId: ['audit', 'audit id'],
    evidenceId: ['evidence', 'evidence id'],
    historyId: ['history', 'history id'],
    noteId: ['note', 'note id'],
    pharmacyId: ['pharmacy', 'pharmacy id'],
    orderId: ['order', 'order id'],
    itemId: ['item', 'item id'],
  };

  // Generate param-aware utterances dynamically
  const generateParamUtterances = (page, baseUtterances) => {
    const utterances = [];

    if (!page.params?.length) return [];

    // Standard "with keyword" patterns
    for (const param of page.params) {
      const keywords = paramKeywordsMap[param] || [param];
      for (const keyword of keywords) {
        for (const base of baseUtterances) {
          utterances.push(`${base.replace('%page%', page.name)} with ${keyword} :${param}`);
          utterances.push(`${base.replace('%page%', page.name)} ${keyword} :${param}`);
        }
      }
    }

    // Direct param after page patterns (like "go to members MEM001")
    const directParams = page.params.map(p => `:${p}`).join(' ');
    for (const base of baseUtterances) {
      utterances.push(`${base.replace('%page%', page.name)} ${directParams}`);
      utterances.push(`${page.name} ${directParams}`);
    }

    return utterances;
  };

  // ----------------------
  // Add routing intents
  // ----------------------
  console.log("Adding routing intents...");
  for (const intent of routingIntents) {
    for (const phrase of intent.phrases || []) {
      manager.addDocument('en', phrase, intent.name);
    }
  }

  // ----------------------
  // Add page navigations
  // ----------------------
  console.log("Adding page navigations...");

  // Sort pages by length descending so longer names are matched first
  const pagesSorted = (siteMetadata.pages || []).sort((a, b) => b.name.length - a.name.length);

  for (const page of pagesSorted) {
    // auto-fill params from URL if missing
    page.params = page.params || Array.from(page.url?.matchAll(/:([A-Za-z0-9_]+)/g) || [], m => m[1]);

    // Replace dots with spaces for entity matching
    const safePageName = page.name.replace(/\./g, ' ');
    const allNames = [page.name, ...(page.synonyms || [])].map(n => n.replace(/\./g, ' '));

    // generate param-aware utterances
    page.generatedUtterances = [
      ...baseUtterances.map(u => u.replace('%page%', safePageName)),
      ...generateParamUtterances({ ...page, name: safePageName }, baseUtterances)
    ];

    // register utterances
    page.generatedUtterances.forEach(phrase => {
      console.log(phrase);
      manager.addDocument('en', phrase, 'navigate_to_page');
    });

    // register page entity
    manager.addNamedEntityText('page', safePageName, ['en'], allNames);

    // register params as regex entities
    page.params.forEach(param => {
      manager.addRegexEntity(param, 'en', /\w+/);
    });
  }

  // ----------------------
  // Knowledge base (concepts/FAQ)
  // ----------------------
  if (knowledgeBase.concepts) {
    Object.entries(knowledgeBase.concepts).forEach(([conceptKey, concept]) => {
      const intentName = `concept.${conceptKey.replace(/\s+/g, '_').toLowerCase()}`;
      if (Array.isArray(concept.intent_examples)) {
        concept.intent_examples.forEach(example => {
          manager.addDocument('en', example, intentName);
        });
      }
      if (Array.isArray(concept.faq)) {
        concept.faq.forEach(faqItem => {
          manager.addAnswer('en', intentName, faqItem.answer);
        });
      } else if (concept.description) {
        manager.addAnswer('en', intentName, concept.description);
      }
    });
  }

  // ----------------------
  // Train and save model
  // ----------------------
  console.log("Training model...");
  await manager.train();
  await fs.mkdir(MODEL_DIR, { recursive: true });
  await manager.save(path.join(MODEL_DIR, `${siteId}.nlp.json`));

  console.log(`[NLP] Training complete for siteId: ${siteId}`);
  return { status: 'trained', siteId };
};

module.exports = { trainNLP };
