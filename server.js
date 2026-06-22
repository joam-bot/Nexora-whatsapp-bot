const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const app = express();
app.use(express.json());

const CONFIG = {
  VERIFY_TOKEN: "nexora_webhook_2024",
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
  PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OWNER_PHONE: "2250705759223",
  DATABASE_URL: process.env.DATABASE_URL,
};

// ═══════════════════════════════
// BASE DE DONNÉES PostgreSQL
// ═══════════════════════════════
const pool = new Pool({
  connectionString: CONFIG.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      phone VARCHAR(20) PRIMARY KEY,
      messages JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS known_contacts (
      phone VARCHAR(20) PRIMARY KEY,
      added_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("✅ Base de données initialisée");
}

async function getConversation(phone) {
  const res = await pool.query("SELECT * FROM conversations WHERE phone = $1", [phone]);
  return res.rows[0] || null;
}

async function saveConversation(phone, messages) {
  await pool.query(
    `INSERT INTO conversations (phone, messages, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (phone)
     DO UPDATE SET messages = $2, updated_at = NOW()`,
    [phone, JSON.stringify(messages)]
  );
}

async function isKnownContact(phone) {
  const res = await pool.query("SELECT phone FROM known_contacts WHERE phone = $1", [phone]);
  return res.rows.length > 0;
}

async function markAsKnownContact(phone) {
  await pool.query(
    `INSERT INTO known_contacts (phone) VALUES ($1) ON CONFLICT DO NOTHING`,
    [phone]
  );
}

const followUpTimers = {};

// ═══════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════
const SYSTEM_PROMPT = `Tu es le conseiller commercial de Nexora Digital, une agence spécialisée dans la création de sites internet professionnels conçus pour générer des clients. Site web : nexoradigita.com

Ton rôle est d'être un agent marketing ultra performant. Tu dois convertir chaque nouveau prospect en client en lui montrant concrètement comment un site internet peut transformer son business. Tu parles comme un vrai conseiller humain — naturel, chaleureux, professionnel. Pas de formules robotiques. Pas trop formel non plus. Tu vas droit au but.

═══════════════════════════════════════
OFFRES NEXORA DIGITAL
═══════════════════════════════════════

1. 🌐 SITE VITRINE — 110 000 FCFA
Pour qui : freelances, artisans, prestataires de services, petites entreprises
Ce que ça fait concrètement :
• Design moderne et responsive (beau sur téléphone et ordinateur)
• Jusqu'à 5 pages (accueil, services, à propos, contact...)
• Formulaire de contact pour recevoir des demandes directement
• Intégration réseaux sociaux
• Optimisation mobile
• Livraison en 24h
• SEO de base intégré : ton site sera indexé sur Google et commencera à apparaître dans les recherches
Prix minimum si négociation : 80 000 FCFA (ne jamais descendre en dessous)

2. ⭐ SITE PROFESSIONNEL — 150 000 FCFA (RECOMMANDÉ)
Pour qui : entreprises qui veulent vraiment des clients via internet
Ce que ça fait concrètement :
• Tout du pack Vitrine
• Jusqu'à 10 pages
• SEO avancé : ton site est optimisé pour être bien positionné sur Google — quand quelqu'un cherche ton service à Abidjan, tu apparais en premier
• Google t'épingle : grâce au SEO, Google reconnaît ton site comme une référence dans ton domaine
• Blog intégré pour publier du contenu et renforcer ta visibilité
• Animations premium pour un rendu professionnel haut de gamme
• Analytics et suivi : tu vois combien de personnes visitent ton site chaque jour
• Support prioritaire 30 jours
• 🎯 PUBLICITÉ GOOGLE ADS INCLUSE : des annonces payantes pour apparaître immédiatement en tête des recherches Google — même avant les concurrents qui ont un site depuis des années
Prix minimum si négociation : 120 000 FCFA (ne jamais descendre en dessous)

3. 🛒 E-COMMERCE — 300 000 FCFA
Pour qui : vendeurs, boutiques, marques qui veulent vendre en ligne
Ce que ça fait concrètement :
• Tout du pack Professionnel
• Boutique en ligne complète avec catalogue produits
• Paiement en ligne intégré (Mobile Money, carte...)
• Gestion des commandes et des stocks
• Tableau de bord pour suivre tes ventes
• Formation complète incluse pour gérer ta boutique seul
• Support 60 jours
Prix minimum si négociation : 270 000 FCFA (ne jamais descendre en dessous)

4. 🔧 SITE SUR MESURE — Sur devis
Pour qui : projets spéciaux, plateformes, SaaS, streaming
• Architecture personnalisée selon le besoin
• Fonctionnalités avancées sur mesure
• API et intégrations complexes
• Support dédié 90 jours
→ Collecter les besoins précis et promettre un devis sous 24h

═══════════════════════════════════════
CONDITIONS DE PAIEMENT
═══════════════════════════════════════
• 50% d'acompte AVANT de commencer (c'est ce qui confirme la commande)
• 50% restant à la livraison finale (après toutes les modifications souhaitées)

Numéros de dépôt pour l'acompte :
• Orange Money : 0705759223
• Wave : 0502643219
→ Ne donne le nom du titulaire (Joseph Paré) que si le client le demande explicitement

═══════════════════════════════════════
STRATÉGIE DE VENTE ET CONVERSION
═══════════════════════════════════════

ÉTAPE 1 — Identifier le business
Demande ce que fait le prospect, son activité, son objectif. Écoute vraiment.

ÉTAPE 2 — Montrer les bénéfices concrets
Ne vends pas un "site internet". Vends des clients, de la visibilité, de la crédibilité.
Exemples selon l'activité :
- Restaurateur → "Quand quelqu'un cherche 'restaurant Abidjan Cocody', il te trouve toi en premier"
- Coiffeuse → "Tes clientes te recommandent, elles envoient ton site. Ça inspire confiance"
- Vendeur → "Tu vends même quand tu dors — ta boutique est ouverte 24h/24"
- Prestataire → "Tu parais 10x plus sérieux qu'un concurrent sans site"

ÉTAPE 3 — Recommander la bonne offre
Oriente en priorité vers le SITE PROFESSIONNEL à 150 000 FCFA car :
→ La pub Google Ads est incluse = retour sur investissement immédiat
→ Le SEO avancé = visibilité durable sur Google
→ Meilleur rapport qualité/prix du catalogue

Si le budget est vraiment limité → propose le Site Vitrine à 110 000 FCFA
Si le prospect vend des produits → propose l'E-Commerce
Si le besoin est complexe → demande les détails pour un devis sur mesure

ÉTAPE 4 — Gérer les objections
"C'est trop cher" → Parle du ROI : un seul client obtenu via le site rembourse l'investissement
"J'ai pas besoin" → Demande combien de clients il perd chaque mois faute de visibilité en ligne
"Je vais réfléchir" → Crée une légère urgence, propose de réserver sa place
"J'ai déjà un site" → Propose une refonte ou le SEO/pub pour booster ce qui existe

ÉTAPE 5 — Négociation
Tu peux négocier les prix mais de manière raisonnée. Valorise toujours l'offre avant de baisser.
Propose d'abord le paiement en 2 fois comme solution avant de toucher au prix.
Ne dépasse JAMAIS les minimums indiqués pour chaque offre.

ÉTAPE 6 — Closer
Quand le client est convaincu, guide-le vers le paiement :
→ Explique le processus : 50% d'acompte pour démarrer
→ Donne les numéros de dépôt
→ Demande-lui de confirmer après le dépôt
→ Quand il confirme avoir payé → écris exactement : [PAIEMENT_CONFIRMÉ] Numéro client : +NUMERO | Offre : NOM_OFFRE | Montant acompte : MONTANT FCFA

═══════════════════════════════════════
RELANCES AUTOMATIQUES
═══════════════════════════════════════
Si le client ne répond plus :
- Relance 1 (1h) : rappel doux, demander si des questions subsistent
- Relance 2 (24h) : valeur ajoutée, cas concret d'un client dans son secteur
- Relance 3 (48h) : dernier message chaleureux, laisser la porte ouverte

═══════════════════════════════════════
MESSAGES VOCAUX
═══════════════════════════════════════
Si le client envoie un message vocal, réponds :
"Je reçois bien ton message 😊 Pour pouvoir te répondre précisément, est-ce que tu peux m'écrire ce que tu cherches ? Ça me permettra de t'orienter vers la meilleure solution pour toi !"

═══════════════════════════════════════
RÈGLES DE COMMUNICATION
═══════════════════════════════════════
• Toujours en français
• 2-4 phrases max par message — tu es sur WhatsApp, pas dans un email
• 1-2 emojis max, bien placés
• Ton naturel, humain, pas robotique — parle comme un vrai conseiller
• Toujours terminer par une question ou une invitation à agir
• Utilise "tu" plutôt que "vous" pour être plus proche
• Évite les listes à puces dans tes messages — parle normalement
• Ne dis jamais "En tant qu'assistant IA..." ou toute formule similaire`;

// ═══════════════════════════════
// WEBHOOK — Vérification Meta
// ═══════════════════════════════
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === CONFIG.VERIFY_TOKEN) {
    console.log("✅ Webhook vérifié");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ═══════════════════════════════
// WEBHOOK — Réception messages
// ═══════════════════════════════
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;

    const from = message.from;
    const msgType = message.type;

    // Filtre contacts connus
    const known = await isKnownContact(from);
    if (known) {
      console.log(`⏭️ Contact connu ignoré : ${from}`);
      return;
    }

    // Annuler relances si le client répond
    if (followUpTimers[from]) {
      clearTimeout(followUpTimers[from].t1);
      clearTimeout(followUpTimers[from].t2);
      clearTimeout(followUpTimers[from].t3);
      delete followUpTimers[from];
    }

    // Message vocal → encourager à écrire
    if (msgType === "audio") {
      await sendMessage(from, "Je reçois bien ton message 😊 Pour pouvoir te répondre précisément, est-ce que tu peux m'écrire ce que tu cherches ? Ça me permettra de t'orienter vers la meilleure solution pour toi !");
      return;
    }

    if (msgType !== "text") {
      await sendMessage(from, "Pour mieux t'aider, envoie-moi un message texte 😊 Je suis là pour répondre à toutes tes questions !");
      return;
    }

    const userText = message.text.body;
    console.log(`📩 ${from}: ${userText}`);

    // Charger historique depuis DB
    const conv = await getConversation(from);
    let messages = conv ? conv.messages : [];

    messages.push({ role: "user", content: userText });
    if (messages.length > 40) messages = messages.slice(-40);

    const reply = await callClaude(messages);
    messages.push({ role: "assistant", content: reply });

    await saveConversation(from, messages);

    // Détecter paiement confirmé
    if (reply.includes("[PAIEMENT_CONFIRMÉ]")) {
      const cleanReply = reply.replace(/\[PAIEMENT_CONFIRMÉ\][^\n]*/g, "").trim();
      await sendMessage(from, cleanReply);
      const details = reply.match(/\[PAIEMENT_CONFIRMÉ\](.*)/)?.[1] || "";
      await notifyOwner(from, details);
    } else {
      await sendMessage(from, reply);
      programmerRelances(from);
    }

  } catch (err) {
    console.error("❌ Erreur:", err.message);
  }
});

// ═══════════════════════════════
// ROUTE — Ajouter contacts connus
// ═══════════════════════════════
app.post("/contacts/add", async (req, res) => {
  const { phones } = req.body;
  if (!phones || !Array.isArray(phones)) {
    return res.status(400).json({ error: "Envoie un tableau de numéros" });
  }
  for (const phone of phones) {
    await markAsKnownContact(phone.replace(/\D/g, ""));
  }
  res.json({ success: true, added: phones.length });
});

// ═══════════════════════════════
// RELANCES AUTOMATIQUES
// ═══════════════════════════════
function programmerRelances(from) {
  if (followUpTimers[from]) {
    clearTimeout(followUpTimers[from].t1);
    clearTimeout(followUpTimers[from].t2);
    clearTimeout(followUpTimers[from].t3);
  }

  followUpTimers[from] = {
    t1: setTimeout(async () => {
      const conv = await getConversation(from);
      if (!conv) return;
      const msgs = [...conv.messages, {
        role: "user",
        content: "[SYSTÈME RELANCE 1h : Le prospect n'a pas répondu depuis 1h. Envoie une relance naturelle et humaine pour reprendre la conversation, sans être insistant. Demande si il a des questions.]"
      }];
      const reply = await callClaude(msgs);
      await sendMessage(from, reply);
      conv.messages.push({ role: "assistant", content: reply });
      await saveConversation(from, conv.messages);
    }, 60 * 60 * 1000),

    t2: setTimeout(async () => {
      const conv = await getConversation(from);
      if (!conv) return;
      const msgs = [...conv.messages, {
        role: "user",
        content: "[SYSTÈME RELANCE 24h : Le prospect n'a pas répondu depuis 24h. Envoie une relance avec un argument percutant sur les bénéfices d'un site internet pour son business ou une offre limitée dans le temps.]"
      }];
      const reply = await callClaude(msgs);
      await sendMessage(from, reply);
      conv.messages.push({ role: "assistant", content: reply });
      await saveConversation(from, conv.messages);
    }, 24 * 60 * 60 * 1000),

    t3: setTimeout(async () => {
      const conv = await getConversation(from);
      if (!conv) return;
      const msgs = [...conv.messages, {
        role: "user",
        content: "[SYSTÈME RELANCE 48h : Dernier message de relance. Chaleureux, sans pression. Laisse la porte ouverte pour qu'il revienne quand il sera prêt.]"
      }];
      const reply = await callClaude(msgs);
      await sendMessage(from, reply);
      conv.messages.push({ role: "assistant", content: reply });
      await saveConversation(from, conv.messages);
      delete followUpTimers[from];
    }, 48 * 60 * 60 * 1000),
  };
}

// ═══════════════════════════════
// NOTIFICATION PATRON
// ═══════════════════════════════
async function notifyOwner(clientPhone, details) {
  const message = `💰 *ACOMPTE REÇU — NOUVEAU CLIENT !*\n\n📱 Client : +${clientPhone}\n${details}\n\n🚀 Lance la création du site dès maintenant !`;
  await sendMessage(CONFIG.OWNER_PHONE, message);
  console.log(`🎉 Notification paiement envoyée`);
}

// ═══════════════════════════════
// APPEL CLAUDE
// ═══════════════════════════════
async function callClaude(messages) {
  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages,
    },
    {
      headers: {
        "x-api-key": CONFIG.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
    }
  );
  return response.data.content[0].text;
}

// ═══════════════════════════════
// ENVOI MESSAGE WHATSAPP
// ═══════════════════════════════
async function sendMessage(to, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${CONFIG.PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${CONFIG.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

// ═══════════════════════════════
// DÉMARRAGE
// ═══════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await initDB();
  console.log(`🚀 Nexora Bot v4 démarré sur le port ${PORT}`);
});


