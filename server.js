const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

// ==========================================
// CONFIGURATION — À remplir avec tes valeurs
// ==========================================
const CONFIG = {
  VERIFY_TOKEN: "nexora_webhook_2024",       // Token que tu mettras sur Meta
  WHATSAPP_TOKEN: "COLLE_TON_ACCESS_TOKEN_ICI",  // Token d'accès Meta
  PHONE_NUMBER_ID: "COLLE_TON_PHONE_NUMBER_ID_ICI", // ID numéro de téléphone Meta
  ANTHROPIC_API_KEY: "COLLE_TA_CLE_ANTHROPIC_ICI",  // Clé API Anthropic
};

// Mémoire des conversations (par numéro de téléphone)
const conversations = {};

// Prompt de l'agent commercial Nexora Digital
const SYSTEM_PROMPT = `Tu es l'assistant commercial de Nexora Digital, une agence spécialisée dans la création de sites internet professionnels et référencés sur Google, conçus pour générer des clients.

Ton rôle : conduire chaque prospect jusqu'à l'achat, comme un expert marketing fort en conversion.

Offres de Nexora Digital :
- Site vitrine professionnel (présence en ligne, design soigné)
- Site vitrine + SEO Google (visibilité sur Google, génération de leads)
- Site e-commerce (boutique en ligne pour vendre)
- Pack complet (site + SEO + maintenance)

Budget moyen : moins de 200 000 FCFA selon l'offre choisie.

Stratégie de vente :
1. Accueillir chaleureusement et identifier le besoin (quel business, quel objectif)
2. Présenter l'offre la plus adaptée avec bénéfices concrets (plus de clients, visibilité Google, crédibilité)
3. Traiter les objections sur le prix avec empathie (ROI, paiement en plusieurs fois possible)
4. Closer : proposer un appel, un devis gratuit ou un rendez-vous
5. Ne jamais laisser la conversation mourir — toujours finir par une question ou une action

Ton ton : professionnel, chaleureux, rassurant, persuasif mais pas agressif.

Important :
- Réponds en français uniquement
- Réponds en 2-4 phrases maximum par message (format WhatsApp)
- Utilise des emojis modérément (1-2 par message max)
- Tu es un assistant, pas un humain — si on te demande directement, sois honnête`;

// ==========================================
// WEBHOOK — Vérification Meta
// ==========================================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === CONFIG.VERIFY_TOKEN) {
    console.log("✅ Webhook vérifié par Meta");
    res.status(200).send(challenge);
  } else {
    console.log("❌ Échec vérification webhook");
    res.sendStatus(403);
  }
});

// ==========================================
// WEBHOOK — Réception des messages
// ==========================================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Répondre immédiatement à Meta

  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) return;

    const message = messages[0];
    const from = message.from; // Numéro du client
    const msgType = message.type;

    // On traite uniquement les messages texte
    if (msgType !== "text") {
      await sendWhatsAppMessage(from, "Bonjour 👋 Je peux uniquement traiter les messages texte pour le moment. Comment puis-je vous aider ?");
      return;
    }

    const userText = message.text.body;
    console.log(`📩 Message de ${from}: ${userText}`);

    // Initialiser l'historique si nouveau contact
    if (!conversations[from]) {
      conversations[from] = [];
    }

    // Ajouter le message du client à l'historique
    conversations[from].push({ role: "user", content: userText });

    // Limiter l'historique à 20 messages pour éviter les coûts excessifs
    if (conversations[from].length > 20) {
      conversations[from] = conversations[from].slice(-20);
    }

    // Appeler Claude
    const reply = await callClaude(conversations[from]);

    // Ajouter la réponse à l'historique
    conversations[from].push({ role: "assistant", content: reply });

    // Envoyer la réponse sur WhatsApp
    await sendWhatsAppMessage(from, reply);
    console.log(`✅ Réponse envoyée à ${from}`);

  } catch (error) {
    console.error("❌ Erreur webhook:", error.message);
  }
});

// ==========================================
// FONCTION — Appel à Claude (Anthropic)
// ==========================================
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

// ==========================================
// FONCTION — Envoi message WhatsApp
// ==========================================
async function sendWhatsAppMessage(to, text) {
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

// ==========================================
// DÉMARRAGE SERVEUR
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Nexora Bot démarré sur le port ${PORT}`);
  console.log(`📡 Webhook disponible sur /webhook`);
});
