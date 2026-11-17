/**
 * EdouarGroup Trade — Application Web & Intégration PayGate Global
 * Lomé, Togo
 */

const CONFIG = {
  PAYGATE_TOKEN: "ce80f23d-3dc8-4565-99e2-2d8506e29198",
  AMOUNT: 1000,
  WA_1: "22891037336",
  WA_2: "22897755964",
  TMONEY_NUMBER: "+228 91 03 73 36",
  FLOOZ_NUMBER: "+228 97 75 59 64",
  STORAGE_KEY: "egt_demandes",
  LAST_KEY: "egt_derniere_demande"
};

let currentPhotoBase64 = null;
let currentDemande = null;

// Utilitaires DOM
const $ = (id) => document.getElementById(id);

function toast(message, duration = 3000) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add("hidden"), duration);
}

function genererReference() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `EGT-${code}`;
}

function formaterNumeroTogo(tel) {
  let clean = tel.replace(/[^0-9]/g, "");
  if (clean.startsWith("228") && clean.length > 8) {
    clean = clean.slice(3);
  }
  return clean;
}

// Compression photo via canvas
function compresserImage(file, maxWidth = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Initialisation
document.addEventListener("DOMContentLoaded", () => {
  const form = $("form-demande");
  const inputPhoto = $("photo");
  const btnSupprPhoto = $("btn-suppr-photo");

  // Gestion upload photo
  if (inputPhoto) {
    inputPhoto.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        currentPhotoBase64 = await compresserImage(file);
        $("photo-preview-thumb").src = currentPhotoBase64;
        $("photo-preview-name").textContent = file.name;
        $("photo-preview-wrap").classList.add("active");
      } catch (err) {
        console.error("Erreur compression image :", err);
        toast("Impossible de charger la photo.");
      }
    });
  }

  if (btnSupprPhoto) {
    btnSupprPhoto.addEventListener("click", () => {
      currentPhotoBase64 = null;
      inputPhoto.value = "";
      $("photo-preview-wrap").classList.remove("active");
    });
  }

  // Soumission du formulaire
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await soumettreDemande();
    });
  }

  // Vérifier si un lien de retour ou une demande récente existe dans l'URL
  const params = new URLSearchParams(window.location.search);
  const refParam = params.get("ref");
  if (refParam) {
    chargerDemandeParRef(refParam);
  }
});

async function soumettreDemande() {
  const telInput = $("telephone");
  const msgInput = $("message");
  const emailInput = $("email");
  const reseauInput = $("reseau");
  const btnSubmit = $("btn-submit");

  const telRaw = telInput.value.trim();
  const telClean = formaterNumeroTogo(telRaw);
  const message = msgInput.value.trim();
  const email = emailInput ? emailInput.value.trim() : "";
  const reseau = reseauInput.value;

  if (telClean.length !== 8) {
    const err = $("erreur-telephone");
    if (err) {
      err.textContent = "Veuillez entrer un numéro togolais valide (ex: 90 00 00 00 ou 70 00 00 00).";
      err.classList.add("active");
    }
    telInput.focus();
    return;
  } else {
    const err = $("erreur-telephone");
    if (err) err.classList.remove("active");
  }

  if (!message) {
    msgInput.focus();
    return;
  }

  const ref = genererReference();
  const dateDemande = new Date().toISOString();

  // Objet demande
  currentDemande = {
    ref,
    telephone: telRaw,
    telClean,
    message,
    email,
    reseau,
    montant: CONFIG.AMOUNT,
    statut_paiement: "en_attente",
    photo: currentPhotoBase64,
    date: dateDemande,
    date_remboursement_limite: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  };

  // Sauvegarde locale
  sauvegarderDemande(currentDemande);

  // État de chargement
  btnSubmit.disabled = true;
  const originalBtnText = btnSubmit.innerHTML;
  btnSubmit.innerHTML = `<span>⏳ Connexion à PayGate en cours...</span>`;

  let paygateResult = null;

  try {
    // Appel direct PayGate Global
    const response = await fetch("https://paygateglobal.com/api/v1/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: CONFIG.PAYGATE_TOKEN,
        phone_number: telClean,
        amount: CONFIG.AMOUNT,
        description: `Demande ${ref} EdouarGroup Trade`,
        identifier: ref,
        network: reseau
      })
    });

    paygateResult = await response.json();
    console.log("Réponse PayGate :", paygateResult);
  } catch (netErr) {
    console.warn("Échec requête PayGate ou CORS/Offline :", netErr);
    paygateResult = { status: -1, error_message: "CORS ou connexion" };
  }

  btnSubmit.disabled = false;
  btnSubmit.innerHTML = originalBtnText;

  // Affichage de la page de confirmation / statut
  afficherPageMerci(currentDemande, paygateResult);
}

function afficherPageMerci(demande, paygateResult) {
  $("vue-formulaire").style.display = "none";
  const vueMerci = $("vue-merci");
  vueMerci.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });

  $("merci-ref").textContent = demande.ref;
  $("recap-tel").textContent = demande.telephone;
  $("recap-article").textContent = demande.message;
  $("recap-reseau").textContent = demande.reseau === "TMONEY" ? "T-Money (Togocom)" : "Flooz (Moov)";

  const statutBadge = $("statut-paiement-badge");
  const blocInstructions = $("bloc-instructions-paiement");
  const msgStatut = $("merci-msg-statut");

  // Formatage texte WhatsApp
  const waLienMsg = encodeURIComponent(
    `Bonjour EdouarGroup Trade,\n\nJe viens d'enregistrer ma demande d'article.\n` +
    `• Référence : *${demande.ref}*\n` +
    `• Téléphone : ${demande.telephone}\n` +
    `• Réseau choisi : ${demande.reseau}\n` +
    `• Article recherché : ${demande.message}\n\n` +
    `Je souhaite confirmer le paiement des 1 000 FCFA remboursables sous 7 jours.`
  );

  $("btn-wa-confirmation").href = `https://wa.me/${CONFIG.WA_1}?text=${waLienMsg}`;
  $("btn-wa-2").href = `https://wa.me/${CONFIG.WA_2}?text=${waLienMsg}`;

  // Analyse résultat PayGate
  if (paygateResult && paygateResult.status === 0) {
    // Succès PayGate USSD déclenché
    statutBadge.className = "statut-badge attente";
    statutBadge.textContent = "⏳ Invite de paiement envoyée";
    msgStatut.innerHTML = `Une invite de débit de <strong>1 000 F</strong> a été envoyée sur votre numéro <strong>${demande.telephone}</strong>.<br>Veuillez taper votre code secret sur votre téléphone pour confirmer.`;
    blocInstructions.style.display = "none";
  } else {
    // Si compte PayGate inactif ou rejet
    const raison = paygateResult && paygateResult.error_message ? paygateResult.error_message : "";
    statutBadge.className = "statut-badge attente";
    statutBadge.textContent = "Demande enregistrée";

    let messageExplication = `Votre demande est bien enregistrée sous la référence <strong>${demande.ref}</strong>.`;
    if (raison && raison.includes("inactif")) {
      messageExplication += `<br><small style="color:#B45309;">(Passerelle PayGate en cours de validation finale par l'opérateur)</small>`;
    }
    msgStatut.innerHTML = messageExplication;

    // Affichage des numéros directs de paiement
    blocInstructions.style.display = "block";
    const numDirect = demande.reseau === "TMONEY" ? CONFIG.TMONEY_NUMBER : CONFIG.FLOOZ_NUMBER;
    const operateurNom = demande.reseau === "TMONEY" ? "T-Money (Togocom)" : "Flooz (Moov)";
    $("instruction-operateur").textContent = operateurNom;
    $("instruction-numero").textContent = numDirect;
  }
}

function nouvelleDemande() {
  $("vue-merci").style.display = "none";
  $("vue-formulaire").style.display = "block";
  $("form-demande").reset();
  currentPhotoBase64 = null;
  $("photo-preview-wrap").classList.remove("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function copierReference() {
  const ref = $("merci-ref").textContent;
  if (!ref) return;
  navigator.clipboard.writeText(ref).then(() => {
    toast("Référence copiée : " + ref);
  }).catch(() => {
    toast("Référence : " + ref);
  });
}

// Persistance localStorage
function sauvegarderDemande(demande) {
  try {
    let liste = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || [];
    // On retire l'image base64 pour la liste complète afin d'économiser l'espace localStorage
    const sansPhotoLourde = { ...demande, photo: demande.photo ? "[Photo jointe]" : null };
    liste.unshift(sansPhotoLourde);
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(liste.slice(0, 100)));
    localStorage.setItem(CONFIG.LAST_KEY, JSON.stringify(demande));
  } catch (e) {
    console.warn("Stockage local saturé :", e);
  }
}

function chargerDemandeParRef(ref) {
  try {
    const liste = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || [];
    const item = liste.find((d) => d.ref === ref);
    if (item) {
      afficherPageMerci(item, null);
    }
  } catch (e) {
    console.error(e);
  }
}

// Espace Gérant (Visualisation des demandes)
function ouvrirEspaceGerant() {
  const pin = prompt("Code secret Gérant :");
  if (pin !== "1234") {
    if (pin !== null) alert("Code incorrect.");
    return;
  }

  const modal = $("modal-gerant");
  const tbody = $("table-demandes-corps");
  const liste = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || [];

  if (liste.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Aucune demande enregistrée pour le moment.</td></tr>';
  } else {
    tbody.innerHTML = liste.map((d) => `
      <tr>
        <td><strong>${d.ref}</strong></td>
        <td>${new Date(d.date).toLocaleDateString("fr-FR")}</td>
        <td><a href="tel:${d.telephone}">${d.telephone}</a></td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${d.message}</td>
        <td><span class="statut-badge ${d.statut_paiement === 'paye' ? 'paye' : 'attente'}">${d.reseau}</span></td>
        <td>
          <a class="btn-copy" href="https://wa.me/228${formaterNumeroTogo(d.telephone)}" target="_blank">WhatsApp</a>
        </td>
      </tr>
    `).join("");
  }

  modal.classList.remove("hidden");
}

function fermerEspaceGerant() {
  $("modal-gerant").classList.add("hidden");
}
