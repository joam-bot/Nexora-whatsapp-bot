const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const CONFIG = {
  VERIFY_TOKEN: "nexora_webhook_2024",
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
  PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OWNER_PHONE: "2250705759223", // Numéro du patron pour les notifications
};

// Mémoire des conversations
const conversations = {};
// Suivi des relances
const followUps = {};

const SYSTEM_PROMPT = `Tu es l'assistant commercial de Nexora Digital, une agence de création de sites internet professionnels référencés sur Google, conçus pour générer des clients. Site web : nexoradigita.com

Ton rôle : conduire chaque prospect jusqu'à l'achat comme un expert marketing de haut niveau.

═══════════════════════════════
OFFRES NEXORA DIGITAL
═══════════════════════════════

1. 🌐 SITE VITRINE — 120 000 FCFA
• Design moderne et responsive
• Jusqu'à 5 pages
• Formulaire de contact
• Optimisation mobile
• Livraison en 24h
• Intégration réseaux sociaux
→ Prix négociable minimum : 80 000 FCFA (ne jamais descendre en dessous)

2. ⭐ SITE PROFESSIONNEL — 150 000 FCFA (POPULAIRE)
• Tout du pack Vitrine
• Jusqu'à 10 pages
• SEO avancé Google
• Blog intégré
• Animations premium
• Support prioritaire 30 jours
• Analytics et suivi
• PUBLICITÉ INCLUSE 🎯
→ Prix négociable minimum : 105 000 FCFA (ne jamais descendre en dessous)

3. 🛒 E-COMMERCE — 300 000 FCFA
• Tout du pack Professionnel
• Boutique en ligne complète
• Gestion des produits
• Paiement en ligne
• Gestion des commandes
• Tableau de bord
• Formation incluse
• Support 60 jours
→ Prix négociable minimum : 210 000 FCFA (ne jamais descendre en dessous)

4. 🔧 SITE SUR MESURE — Sur devis
• Architecture personnalisée
• Fonctionnalités avancées
• Système utilisateurs complexe
• API et intégrations
• Scalabilité enterprise
• Support dédié 90 jours
• Maintenance prioritaire
→ Collecter les besoins et dire qu'un devis sera envoyé sous 24h

═══════════════════════════════
CONDITIONS DE PAIEMENT
═══════════════════════════════
• 50% avant le début des travaux
• 50% après livraison complète (toutes modifications incluses)
• Paiement par Mobile Money ou virement

═══════════════════════════════
RÈGLES DE NÉGOCIATION
═══════════════════════════════
• Si le client négocie le prix, tu peux réduire jusqu'au minimum autorisé
• Ne JAMAIS descendre en dessous du minimum sous aucun prétexte
• Valorise toujours ce qui est inclus avant de baisser le prix
• Propose le paiement en 2 fois comme argument rassurant
• Si le client dit que c'est trop cher, mets en avant le ROI (retour sur investissement)

═══════════════════════════════
STRATÉGIE DE VENTE
═══════════════════════════════
1. Accueillir chaleureusement, identifier le business et l'objectif
2. Recommander l'offre la plus adaptée avec bénéfices concrets
3. Orienter en priorité vers le SITE PROFESSIONNEL (meilleur rapport qualité/prix + pub incluse)
4. Traiter les objections avec empathie et arguments solides
5. Closer : demander confirmation et collecter nom + disponibilité pour démarrer
6. Quand le client dit OUI ou confirme vouloir commander → écrire exactement : [CLIENT_CLOSÉ] suivi des détails

═══════════════════════════════
RELANCES AUTOMATIQUES
═══════════════════════════════
Si le client ne répond plus après avoir montré de l'intérêt :
- Relance 1 (après 1h) : message doux de rappel
- Relance 2 (après 24h) : message avec une valeur ajoutée ou offre limitée
- Relance 3 (après 48h) : dernier message avant clôture

═══════════════════════════════
FORMAT DES RÉPONSES
═══════════════════════════════
• Toujours en français
• 2-4 phrases max par message (format WhatsApp)
• 1-2 emojis max par message
• Ton : professionnel, chaleureux, persuasif sans être agressif
• Toujours terminer par une question ou un appel à l'action

IMPORTANT : Quand un client est closé (dit OUI et confirme), inclus dans ta réponse le tag [CLIENT_CLOSÉ] avec son nom et l'offre choisie. Ce tag sera intercepté par le système pour notifier le patron.`;

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

    // Annuler la relance en cours si le client répond
    if (followUps[from]) {
      clearTimeout(followUps[from].timer1);
      clearTimeout(followUps[from].timer2);
      clearTimeout(followUps[from].timer3);
      delete followUps[from];
    }

    if (msgType !== "text") {
      await sendMessage(from, "Je traite uniquement les messages texte pour le moment. Comment puis-je vous aider ? 😊");
      return;
    }

    const userText = message.text.body;
    console.log(`📩 ${from}: ${userText}`);

    if (!conversations[from]) conversations[from] = [];
    conversations[from].push({ role: "user", content: userText });
    if (conversations[from].length > 30) conversations[from] = conversations[from].slice(-30);

    const reply = await callClaude(conversations[from]);
    conversations[from].push({ role: "assistant", content: reply });

    // Détecter si client closé
    if (reply.includes("[CLIENT_CLOSÉ]")) {
      const cleanReply = reply.replace(/\[CLIENT_CLOSÉ\][^\n]*/g, "").trim();
      await sendMessage(from, cleanReply);

      // Extraire les infos du closing
      const closingInfo = reply.match(/\[CLIENT_CLOSÉ\](.*)/)?.[1] || "Détails non disponibles";
      await notifyOwner(from, closingInfo);
    } else {
      await sendMessage(from, reply);
      // Programmer les relances si pas de réponse
      programmerRelances(from);
    }

  } catch (err) {
    console.error("❌ Erreur:", err.message);
  }
});

// ═══════════════════════════════
// RELANCES AUTOMATIQUES
// ═══════════════════════════════
function programmerRelances(from) {
  if (followUps[from]) {
    clearTimeout(followUps[from].timer1);
    clearTimeout(followUps[from].timer2);
    clearTimeout(followUps[from].timer3);
  }

  followUps[from] = {
    timer1: setTimeout(async () => {
      if (!conversations[from]) return;
      const relance1 = await callClaude([
        ...conversations[from],
        { role: "user", content: "[SYSTÈME: Le client n'a pas répondu depuis 1h. Envoie une relance douce et naturelle pour relancer la conversation sans être insistant.]" }
      ]);
      await sendMessage(from, relance1);
      conversations[from].push({ role: "assistant", content: relance1 });
    }, 60 * 60 * 1000), // 1h

    timer2: setTimeout(async () => {
      if (!conversations[from]) return;
      const relance2 = await callClaude([
        ...conversations[from],
        { role: "user", content: "[SYSTÈME: Le client n'a pas répondu depuis 24h. Envoie une relance avec une valeur ajoutée, une info utile ou une offre limitée dans le temps.]" }
      ]);
      await sendMessage(from, relance2);
      conversations[from].push({ role: "assistant", content: relance2 });
    }, 24 * 60 * 60 * 1000), // 24h

    timer3: setTimeout(async () => {
      if (!conversations[from]) return;
      const relance3 = await callClaude([
        ...conversations[from],
        { role: "user", content: "[SYSTÈME: Le client n'a pas répondu depuis 48h. Envoie un dernier message de relance final, chaleureux, en laissant la porte ouverte.]" }
      ]);
      await sendMessage(from, relance3);
      conversations[from].push({ role: "assistant", content: relance3 });
      delete followUps[from];
    }, 48 * 60 * 60 * 1000), // 48h
  };
}

// ═══════════════════════════════
// NOTIFICATION PATRON
// ═══════════════════════════════
async function notifyOwner(clientPhone, details) {
  const message = `🔥 *NOUVEAU CLIENT CLOSÉ !*\n\n📱 Numéro client : +${clientPhone}\n📋 Détails : ${details}\n\n✅ Contacte ce client pour finaliser le paiement !`;
  await sendMessage(CONFIG.OWNER_PHONE, message);
  console.log(`🎉 Notification closing envoyée au patron`);
}

// ═══════════════════════════════
// APPEL CLAUDE API
// ═══════════════════════════════
async function callClaude(history) {
  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: history,
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
      to: to,
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Nexora Bot v2 démarré sur le port ${PORT}`);
});

