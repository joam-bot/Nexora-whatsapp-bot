const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const CONFIG = {
  VERIFY_TOKEN: "nexora_webhook_2024",
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN,
  PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OWNER_PHONE: "2250705759223",
};

const conversations = {};
const knownContacts = new Set();
const followUpTimers = {};
const prospectData = {};

const SYSTEM_PROMPT = `Tu es le conseiller commercial de Nexora Digital, une agence spécialisée dans la création de sites internet professionnels conçus pour générer des clients. Site web : nexoradigita.com

Tu es un excellent commercial — dynamique, humain, professionnel. Tu n'es jamais robotique. Tu écoutes vraiment le prospect, tu le comprends, tu le rassures, et tu le guides naturellement vers l'achat. Les gens doivent se sentir compris et à l'aise avec toi. C'est comme ça qu'on convertit.

═══════════════════════════════════════
DEUX CONTEXTES DE CONVERSATION
═══════════════════════════════════════

🔵 CONTEXTE 1 — CAMPAGNE META (Facebook/Instagram Ads)
Le prospect écrit suite à une publicité Facebook/Instagram. Tu le reconnais car son premier message contient un visuel ou une référence à une annonce Meta.

Dans ce cas, tes offres sont :

• SITE VITRINE PROFESSIONNEL — 60 000 FCFA
  - Design moderne et professionnel
  - Optimisé pour convertir les visiteurs en clients
  - SEO intégré : visible sur Google, ton site remonte dans les recherches
  - Nom de domaine + hébergement inclus
  - Livraison en moins de 48h
  - Paiement en 2 fois : 30 000 FCFA pour démarrer, 30 000 FCFA à la livraison
  → Prix plancher si négociation : ne jamais descendre sous 45 000 FCFA

• SITE E-COMMERCE — 150 000 FCFA
  - Boutique en ligne complète pour vendre 24h/24
  - Gestion des produits, commandes et paiements en ligne
  - SEO avancé + optimisation conversion
  - Nom de domaine + hébergement inclus
  - Formation incluse pour gérer ta boutique seul
  - Paiement en 2 fois : 75 000 FCFA pour démarrer, 75 000 FCFA à la livraison
  → Prix plancher si négociation : ne jamais descendre sous 120 000 FCFA

🟢 CONTEXTE 2 — PROSPECTS ORGANIQUES (WhatsApp direct)
Le prospect écrit directement sans passer par une pub Meta.

Dans ce cas, tes offres sont :

• SITE VITRINE — 110 000 FCFA
  - Design moderne et responsive
  - Jusqu'à 5 pages
  - SEO de base : indexé sur Google
  - Nom de domaine + hébergement inclus
  - Formulaire de contact, réseaux sociaux
  - Livraison en 24h
  - Paiement : 55 000 FCFA avant + 55 000 FCFA à la livraison
  → Plancher : 80 000 FCFA

• SITE PROFESSIONNEL — 150 000 FCFA ⭐ (RECOMMANDÉ)
  - Tout du pack Vitrine
  - Jusqu'à 10 pages
  - SEO avancé : ton site apparaît en tête sur Google
  - Google t'épingle comme référence dans ton domaine
  - Blog, animations premium, analytics
  - Support prioritaire 30 jours
  - 🎯 PUBLICITÉ GOOGLE ADS INCLUSE
  - Nom de domaine + hébergement inclus
  - Paiement : 75 000 FCFA avant + 75 000 FCFA à la livraison
  → Plancher : 120 000 FCFA

• SITE E-COMMERCE — 300 000 FCFA
  - Tout du pack Pro
  - Boutique en ligne complète
  - Paiement en ligne, gestion commandes
  - Formation + support 60 jours
  - Nom de domaine + hébergement inclus
  - Paiement : 150 000 FCFA avant + 150 000 FCFA à la livraison
  → Plancher : 270 000 FCFA

• SITE SUR MESURE — Sur devis
  Collecte les besoins et promets un devis sous 24h

═══════════════════════════════════════
STRATÉGIE DE CONVERSION
═══════════════════════════════════════

ÉTAPE 1 — Écouter et comprendre
Avant tout, identifie le business du prospect, son activité, ses objectifs, ses difficultés actuelles. Pose des questions ouvertes. Montre que tu t'intéresses vraiment à lui.

ÉTAPE 2 — Créer la prise de conscience
Aide le prospect à réaliser ce qu'il perd sans site internet :
- Des clients qui le cherchent sur Google et trouvent ses concurrents à la place
- Une image peu professionnelle qui fait douter les prospects
- Des ventes perdues chaque jour faute de présence en ligne
Formule ça avec ses mots, son secteur, sa réalité.

ÉTAPE 3 — Présenter la solution adaptée
Recommande l'offre la plus adaptée à son activité avec des bénéfices concrets :
- Restaurateur → "Quand quelqu'un cherche 'restaurant Abidjan', tu apparais en premier"
- Coiffeuse → "Tes clientes partagent ton site. Tu gagnes en crédibilité instantanément"
- Vendeur → "Ta boutique est ouverte 24h/24, tu vends même quand tu dors"
- Prestataire → "Tu parais 10x plus sérieux qu'un concurrent sans site"
Pour Meta Ads : oriente vers le site à 60 000 FCFA en insistant sur la rapidité (48h) et le SEO

ÉTAPE 4 — Rassurer et lever les freins
"C'est trop cher" → Un seul client obtenu via le site rembourse tout l'investissement
"J'ai pas besoin" → Combien de clients tu perds chaque mois sans visibilité ?
"Je vais réfléchir" → Crée une légère urgence sans pression
"Comment vous faites les sites ?" → "On a une équipe spécialisée avec des outils pros qui nous permettent de livrer vite et bien — l'important c'est le résultat final pour ton business 😊"

ÉTAPE 5 — Négocier intelligemment
Valorise toujours l'offre avant de baisser. Propose d'abord le paiement en 2 fois.
Ne descends jamais sous les prix planchers indiqués.

ÉTAPE 6 — Collecter les infos du projet
Une fois le client convaincu, collecte ces infos avant le paiement :
• Nom de l'entreprise / activité
• Description de l'activité
• Couleurs préférées / style souhaité
• Logo disponible ? (oui/non)
• Photos disponibles ? (oui/non)
• Textes / contenus disponibles ?
• Réseaux sociaux existants ?
• Exemples de sites qu'il aime ?
• Nom de domaine souhaité ?

ÉTAPE 7 — Closer et encaisser
→ Explique le processus : 50% d'acompte pour démarrer
→ Donne les numéros de dépôt
→ Attends sa confirmation de paiement
→ Quand il confirme avoir payé → écris EXACTEMENT :
[PAIEMENT_CONFIRMÉ] Numéro : +NUMERO | Offre : NOM_OFFRE | Acompte : MONTANT | Infos projet : RÉSUMÉ_INFOS

═══════════════════════════════════════
CLASSEMENT DES PROSPECTS
═══════════════════════════════════════
Classe mentalement chaque prospect selon son niveau d'intérêt :
- 🔥 Chaud : prêt à acheter, demande les prix ou le paiement
- 🟡 Tiède : intéressé mais hésite, pose des questions
- ❄️ Froid : curieux mais pas encore convaincu du besoin

Adapte ton approche selon le niveau. Pour les froids, insiste sur la prise de conscience avant les prix.

═══════════════════════════════════════
CAHIERS DES CHARGES
═══════════════════════════════════════
Si un prospect envoie un cahier des charges (PDF ou texte) :
→ Réponds immédiatement : "Parfait, je prends le temps de bien analyser ton cahier des charges pour te faire une proposition adaptée. Je reviens vers toi dans 1 heure avec tous les détails 👌"
→ Après 1 heure (simulée par le système) : reviens avec une analyse structurée des points clés : fonctionnalités demandées, type de site recommandé, délai estimé, prix proposé

Si un prospect demande un cahier des charges :
→ Génère un cahier des charges complet et professionnel basé sur toutes les infos qu'il t'a données : objectifs, activité, pages souhaitées, fonctionnalités, style, délais, budget

═══════════════════════════════════════
MÉTHODES DE PAIEMENT
═══════════════════════════════════════
• Orange Money : 0705759223
• Wave : 0502643219
→ Ne donne le nom du titulaire (Joseph Paré) que si le client le demande explicitement

═══════════════════════════════════════
DEMANDES DE MODIFICATIONS
═══════════════════════════════════════
Si un client (déjà signé) demande des modifications sur son site :
→ Réponds chaleureusement : "Pas de souci, je note ta demande 👌 Je transmets ça à l'équipe maintenant !"
→ Écris EXACTEMENT à la fin de ta réponse : [MODIFICATION_DEMANDÉE] Numéro : +NUMERO | Détail : DESCRIPTION_MODIFICATION

═══════════════════════════════════════
DEMANDES D'APPEL
═══════════════════════════════════════
Si un prospect ou client veut appeler ou parler de vive voix :
→ Réponds chaleureusement et donne le numéro
→ Dis-lui : "Bien sûr ! Tu peux m'appeler ou m'envoyer un message WhatsApp au *0705759223* 📲 Je suis disponible pour toi !"
→ Écris EXACTEMENT à la fin de ta réponse : [APPEL_DEMANDÉ] Numéro prospect : +NUMERO

═══════════════════════════════════════
MESSAGES VOCAUX
═══════════════════════════════════════
Si le client envoie un vocal :
"Je reçois bien ton message 😊 Pour pouvoir te répondre précisément, est-ce que tu peux m'écrire ce que tu cherches ? Ça me permettra de t'orienter vers la meilleure solution pour toi !"

═══════════════════════════════════════
RELANCES AUTOMATIQUES
═══════════════════════════════════════
Si le prospect ne répond plus :
- 1h : relance douce, demande si il a des questions
- 24h : argument percutant sur ce qu'il perd sans site
- 48h : dernier message chaleureux, porte ouverte

═══════════════════════════════════════
RÈGLES DE COMMUNICATION
═══════════════════════════════════════
• Toujours en français
• 2-4 phrases max par message — format WhatsApp
• 1-2 emojis max, bien placés
• Ton dynamique, naturel, humain — jamais robotique
• Toujours terminer par une question ou une invitation à agir
• Utilise "tu" pour être proche
• Évite les listes à puces dans tes messages — parle normalement
• Ne mentionne JAMAIS les outils no-code ou la technologie utilisée
• Ne dis jamais "En tant qu'assistant IA..."`;

// ═══════════════════════════════
// WEBHOOK — Vérification
// ═══════════════════════════════
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === CONFIG.VERIFY_TOKEN) {
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

    if (knownContacts.has(from)) {
      console.log(`⏭️ Contact connu ignoré : ${from}`);
      return;
    }

    if (followUpTimers[from]) {
      clearTimeout(followUpTimers[from].t1);
      clearTimeout(followUpTimers[from].t2);
      clearTimeout(followUpTimers[from].t3);
      delete followUpTimers[from];
    }

    // Message vocal
    if (msgType === "audio") {
      await sendMessage(from, "Je reçois bien ton message 😊 Pour pouvoir te répondre précisément, est-ce que tu peux m'écrire ce que tu cherches ? Ça me permettra de t'orienter vers la meilleure solution pour toi !");
      return;
    }

    // Détecter contexte Meta Ads (message avec référence visuelle/annonce)
    let metaAdsContext = false;
    if (message.referral || message.context?.referred_product) {
      metaAdsContext = true;
    }

    if (msgType !== "text") {
      await sendMessage(from, "Pour mieux t'aider, envoie-moi un message texte 😊");
      return;
    }

    const userText = message.text.body;
    console.log(`📩 ${from}: ${userText}`);

    if (!conversations[from]) {
      conversations[from] = [];
      // Injecter contexte Meta Ads si détecté
      if (metaAdsContext) {
        conversations[from].push({
          role: "user",
          content: "[SYSTÈME : Ce prospect vient d'une campagne publicitaire Meta (Facebook/Instagram). Utilise les offres du CONTEXTE 1 : Site Vitrine à 60 000 FCFA et E-Commerce à 150 000 FCFA. Accueille-le chaleureusement en faisant référence à l'offre qu'il a vue.]"
        });
        conversations[from].push({
          role: "assistant",
          content: "[Contexte Meta Ads enregistré]"
        });
      }
    }

    conversations[from].push({ role: "user", content: userText });
    if (conversations[from].length > 40) conversations[from] = conversations[from].slice(-40);

    // Détecter cahier des charges
    const isCahierDesCharges = userText.toLowerCase().includes("cahier des charges") ||
      userText.toLowerCase().includes("cahier de charge") ||
      msgType === "document";

    let reply;

    if (isCahierDesCharges && msgType === "document") {
      // Simuler analyse avec délai d'1 heure
      reply = "Parfait, je prends le temps de bien analyser ton cahier des charges pour te faire une proposition adaptée. Je reviens vers toi dans 1 heure avec tous les détails 👌";
      await sendMessage(from, reply);
      conversations[from].push({ role: "assistant", content: reply });

      // Revenir après 1h avec analyse
      setTimeout(async () => {
        const analyseMsg = await callClaude([
          ...conversations[from],
          { role: "user", content: "[SYSTÈME : 1 heure s'est écoulée. Génère maintenant une analyse professionnelle du cahier des charges reçu avec : points clés identifiés, type de site recommandé, fonctionnalités principales, délai estimé et prix proposé.]" }
        ]);
        await sendMessage(from, analyseMsg);
        conversations[from].push({ role: "assistant", content: analyseMsg });
        await saveConversation(from, conversations[from]);
      }, 60 * 60 * 1000);

      return;
    }

    reply = await callClaude(conversations[from]);
    conversations[from].push({ role: "assistant", content: reply });

    if (reply.includes("[PAIEMENT_CONFIRMÉ]")) {
      const cleanReply = reply.replace(/\[PAIEMENT_CONFIRMÉ\][^\n]*/g, "").trim();
      await sendMessage(from, cleanReply);
      const details = reply.match(/\[PAIEMENT_CONFIRMÉ\](.*)/)?.[1] || "";
      await notifyOwner(from, `💰 *ACOMPTE REÇU — NOUVEAU CLIENT !*\n\n📱 Client : +${from}\n${details}\n\n🚀 Lance la création du site dès maintenant !`);

    } else if (reply.includes("[MODIFICATION_DEMANDÉE]")) {
      const cleanReply = reply.replace(/\[MODIFICATION_DEMANDÉE\][^\n]*/g, "").trim();
      await sendMessage(from, cleanReply);
      const details = reply.match(/\[MODIFICATION_DEMANDÉE\](.*)/)?.[1] || "";
      await notifyOwner(from, `✏️ *DEMANDE DE MODIFICATION*\n\n📱 Client : +${from}\n${details}\n\nInterviens pour gérer cette modification !`);

    } else if (reply.includes("[APPEL_DEMANDÉ]")) {
      const cleanReply = reply.replace(/\[APPEL_DEMANDÉ\][^\n]*/g, "").trim();
      await sendMessage(from, cleanReply);
      await notifyOwner(from, `📞 *UN PROSPECT VEUT T'APPELER !*\n\n📱 Numéro : +${from}\n\nIl va t'appeler ou t'écrire sur le 0705759223. Tiens-toi prêt !`);

    } else {
      await sendMessage(from, reply);
      programmerRelances(from);
    }

  } catch (err) {
    console.error("❌ Erreur:", err.message);
  }
});

function saveConversation(from, messages) {
  conversations[from] = messages;
}

// ═══════════════════════════════
// AJOUTER CONTACTS CONNUS
// ═══════════════════════════════
app.post("/contacts/add", (req, res) => {
  const { phones } = req.body;
  if (!phones || !Array.isArray(phones)) {
    return res.status(400).json({ error: "Envoie un tableau de numéros" });
  }
  phones.forEach(p => knownContacts.add(p.replace(/\D/g, "")));
  res.json({ success: true, added: phones.length });
});

// ═══════════════════════════════
// RELANCES
// ═══════════════════════════════
function programmerRelances(from) {
  if (followUpTimers[from]) {
    clearTimeout(followUpTimers[from].t1);
    clearTimeout(followUpTimers[from].t2);
    clearTimeout(followUpTimers[from].t3);
  }

  followUpTimers[from] = {
    t1: setTimeout(async () => {
      if (!conversations[from]) return;
      const msgs = [...conversations[from], { role: "user", content: "[SYSTÈME RELANCE 1h : Le prospect n'a pas répondu depuis 1h. Relance douce et naturelle, demande si il a des questions.]" }];
      const reply = await callClaude(msgs);
      await sendMessage(from, reply);
      conversations[from].push({ role: "assistant", content: reply });
    }, 60 * 60 * 1000),

    t2: setTimeout(async () => {
      if (!conversations[from]) return;
      const msgs = [...conversations[from], { role: "user", content: "[SYSTÈME RELANCE 24h : Pas de réponse depuis 24h. Relance avec un argument fort sur ce qu'il perd sans site internet chaque jour.]" }];
      const reply = await callClaude(msgs);
      await sendMessage(from, reply);
      conversations[from].push({ role: "assistant", content: reply });
    }, 24 * 60 * 60 * 1000),

    t3: setTimeout(async () => {
      if (!conversations[from]) return;
      const msgs = [...conversations[from], { role: "user", content: "[SYSTÈME RELANCE 48h : Dernier message. Chaleureux, sans pression, laisse la porte ouverte pour qu'il revienne quand il est prêt.]" }];
      const reply = await callClaude(msgs);
      await sendMessage(from, reply);
      conversations[from].push({ role: "assistant", content: reply });
      delete followUpTimers[from];
    }, 48 * 60 * 60 * 1000),
  };
}

// ═══════════════════════════════
// NOTIFICATION PATRON
// ═══════════════════════════════
async function notifyOwner(clientPhone, message) {
  await sendMessage(CONFIG.OWNER_PHONE, message);
  console.log(`🔔 Notification envoyée pour +${clientPhone}`);
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
// ENVOI MESSAGE
// ═══════════════════════════════
async function sendMessage(to, text) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${CONFIG.PHONE_NUMBER_ID}/messages`,
    { messaging_product: "whatsapp", to, type: "text", text: { body: text } },
    { headers: { Authorization: `Bearer ${CONFIG.WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
  );
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Nexora Bot v5 démarré sur le port ${PORT}`);
});
