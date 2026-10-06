import type { Translations } from "./en";

export const fr: Translations = {
  "common.cancel": "Annuler",
  "common.close": "Fermer",
  "common.delete": "Supprimer",
  "common.remove": "Retirer",
  "common.done": "Terminé",
  "common.ok": "OK",
  "common.error": "Erreur",
  "common.success": "Succès",
  "common.share": "Partager",
  "common.pin": "Épingler",
  "common.unpin": "Désépingler",
  "common.copy": "Copier",
  "common.expand": "Agrandir",
  "common.regenerate": "Régénérer",
  "common.listen": "Écouter",
  "common.stop": "Arrêter",
  "common.details": "Détails",
  "common.openInApp": "Ouvrir dans l'application",
  "common.info": "Info",
  "common.clear": "Effacer",

  "onboarding.next": "Continuer",
  "onboarding.back": "Retour",
  "onboarding.intro.personal": "Ton assistant IA, vraiment personnel.",
  "onboarding.intro.choice": "Conçu pour toi.",
  "onboarding.intro.freedom": "Découvre la vraie liberté d'échanger.",
  "onboarding.intro.pocket": "Des modèles puissants, dans ta poche.",
  "onboarding.intro.control": "Tes données, tes règles.",
  "onboarding.intro.cloud": "Créé pour ton quotidien.",
  "onboarding.intro.noTracking": "Aucune publicité. Aucun traqueur.",
  "onboarding.intro.privacy": "Pensé pour respecter ta vie privée.",
  "onboarding.intro.noAccount": "Sans compte obligatoire. Prêt à l'emploi.",
  "onboarding.intro.openSource": "Open source, transparent et indépendant.",
  "onboarding.welcome.cta": "Commencer",
  "onboarding.name.placeholder": "Entre ton nom",
  "onboarding.profile.title": "Comment Maestro doit-il t'appeler ?",
  "onboarding.profile.subtitle":
    "Maestro l'utilisera pour te saluer. Tu pourras le modifier à tout moment dans les paramètres.",
  "profileCard.placeholder": "Ton nom",
  "onboarding.voice.title": "Donne une voix à Maestro",
  "onboarding.permissions.title": "À quoi Maestro peut-il accéder ?",
  "onboarding.permissions.subtitle":
    "Seulement à ce que tu autorises. Tu pourras changer d'avis à tout moment dans les",
  "onboarding.permissions.settingsLink": "paramètres de l'appareil ↗",
  "onboarding.permissions.subtitleWeb":
    "Seulement à ce que tu autorises. Tu pourras changer d'avis à tout moment dans les paramètres du système.",
  "onboarding.ready.title": "Tout est prêt.",
  "onboarding.ready.titleNamed": "Tout est prêt,\n{name}.",
  "onboarding.ready.subtitle":
    "Maestro t'attend. Pose-lui tes questions, à l'écrit comme à l'oral.",
  "onboarding.ready.cta": "Commencer avec Maestro",

  "permissions.title": "Autorisations",
  "permissions.allow": "Autoriser",
  "permissions.allowed": "Autorisé",
  "permissions.denied": "Refusé",
  "permissions.microphone.label": "Microphone",
  "permissions.camera.label": "Caméra",
  "permissions.photos.label": "Photos",
  "permissions.contacts.label": "Contacts",
  "permissions.calendar.label": "Calendrier",
  "permissions.location.label": "Localisation",

  "theme.system": "Auto",
  "theme.light": "Clair",
  "theme.dark": "Sombre",

  "reflection.none": "Rapide",
  "reflection.low": "Faible",
  "reflection.high": "Élevée",

  "topbar.discussions": "Discussions",
  "topbar.new": "Nouveau",

  "attachment.camera": "Caméra",
  "attachment.file": "Fichier",
  "attachment.photos": "Photos",

  "conversations.title": "Discussions",
  "conversations.new": "Nouvelle discussion",
  "conversations.empty": "Aucune conversation",
  "conversations.pins": "ÉPINGLÉES",
  "conversations.group.last": "DERNIÈRE DISCUSSION",
  "conversations.group.daysAgo": "Il y a {count} jours",
  "conversations.search.action": "Rechercher",
  "conversations.search.title": "Rechercher",
  "conversations.search.placeholder": "Rechercher des conversations",
  "conversations.search.results": "RÉSULTATS",
  "conversations.search.empty": "Aucun résultat",
  "conversations.delete.title": "Supprimer la conversation",
  "conversations.delete.message":
    "Veux-tu vraiment supprimer cette conversation ? Cette action est irréversible.",

  "cloudSync.setupIncomplete": "Configuration non terminée",
  "cloudSync.lastSynced": "Dernière synchro",
  "cloudSync.ready": "Prêt à synchroniser",
  "cloudSync.enterPin": "Saisir le code PIN",
  "cloudSync.createPin": "Créer un code PIN",
  "cloudSync.disconnect": "Déconnecter",
  "cloudSync.syncing": "Synchronisation...",
  "cloudSync.syncNow": "Synchroniser",
  "cloudSync.backupSize": "Taille de sauvegarde",

  "modelSelector.loading": "Chargement...",
  "modelSelector.noModels": "Aucun modèle trouvé",
  "modelSelector.unreachable":
    "Impossible de récupérer les modèles : serveur injoignable",
  "modelSelector.downloading": "Téléchargement...",
  "modelSelector.download.title": "Télécharger Gemma4",
  "modelSelector.download.message":
    "Veux-tu télécharger le modèle Gemma4 sur ton serveur Ollama ? Ce modèle pèse plusieurs Go.",
  "modelSelector.download.confirm": "Télécharger",
  "modelSelector.tokenWindow": "Fenêtre de token",
  "modelSelector.placeholder": "Modèle",
  "modelSelector.noProvider":
    "Aucun service activé, active-en un dans Réglages → Service",

  "selector.placeholder": "Sélectionner...",

  "download.starting": "Démarrage...",
  "download.eta": "{seconds}s restantes",

  "widget.html.empty": "Aucun contenu à afficher",

  "markdown.thinking": "Réflexion...",

  "nextcloud.connect": "Connecter",
  "nextcloud.waiting": "En attente de ta validation dans le navigateur...",
  "nextcloud.failed":
    "Échec ou expiration de la connexion. Vérifie l'adresse et réessaie.",
  "nextcloud.help":
    "Saisis l'adresse de ton serveur, puis valide la connexion dans la fenêtre du navigateur qui s'ouvre.",
  "nextcloud.cors":
    "Bloqué par CORS : un navigateur refuse d'appeler un autre domaine si celui-ci ne l'autorise pas. Il faut ajouter des en-têtes CORS sur le reverse proxy de ton Nextcloud, sinon utilise l'application desktop ou mobile.",

  "codePreview.name": "Nom",
  "codePreview.language": "Langage",
  "codePreview.lines": "Lignes",
  "codePreview.characters": "Caractères",
  "imagePreview.name": "Nom",
  "imagePreview.format": "Format",
  "imagePreview.dimensions": "Dimensions",
  "imagePreview.size": "Taille",
  "messageDetails.model": "Modèle",
  "messageDetails.time": "Durée",
  "messageDetails.tokens": "Tokens",
  "messageDetails.speed": "Tokens/s",
  "messageDetails.prompt": "Prompt système",
  "messageDetails.thinking": "Réflexion",
  "messageDetails.tools": "Outils",
  "messageDetails.reasoning": "Raisonnement",
  "messageDetails.error": "Erreur",

  "bugReport.title": "Signaler un bug",
  "bugReport.crashTitle": "Opera s'est fermé de manière inattendue",
  "bugReport.crashHelp":
    "L'erreur a été enregistrée. Dis-nous ce que tu faisais, ça nous aidera à comprendre ce qui s'est passé.",
  "bugReport.placeholder": "Décris le problème",
  "bugReport.crashPlaceholder": "Que faisais-tu ?",
  "bugReport.attachLogs": "Joindre les dernières lignes de log",
  "bugReport.attachScreenshot": "Joindre une capture d'écran",
  "bugReport.consent":
    "Publié publiquement sur GitHub : ta description, ces logs, ton appareil et la version de l'app, et ton nom d'utilisateur GitHub.",
  "bugReport.consentScreenshot":
    "La capture prise quand tu as secoué le téléphone va dans ton presse-papiers, colle-la dans le ticket si cela aide.",
  "bugReport.send": "Envoyer mon problème",
  "bugReport.empty.title": "Rien à envoyer",
  "bugReport.empty.message": "Décris d'abord le problème.",
  "bugReport.githubFailed.title": "Impossible d'ouvrir GitHub",
  "bugReport.githubFailed.message": "Réessaie.",

  "home.greeting.morning": "Bonjour",
  "home.greeting.afternoon": "Bon après-midi",
  "home.greeting.evening": "Bonsoir",
  "home.settings": "Réglages",
  "home.incognito.enable": "Activer le mode incognito",
  "home.incognito.disable": "Désactiver le mode incognito",
  "home.dbFailed.title": "Une erreur est survenue",
  "home.dbFailed.message":
    "Opera n'a pas pu ouvrir sa base de données locale. Redémarre l'application. Si le problème persiste, réinstalle-la.",
  "home.dataWarning.title": "Incohérence possible des données",
  "home.dataWarning.message":
    "Après cette mise à jour, certaines données enregistrées peuvent être incohérentes. En cas de problème, va dans Réglages → Confidentialité pour exporter tes données ou supprimer toutes les conversations.",
  "home.dataWarning.goToSettings": "Ouvrir les réglages",
  "home.dataWarning.later": "Plus tard",

  "chat.noModel":
    "Sélectionne un modèle dans le menu du haut avant d'envoyer un message.",

  "share.modal.title": "Partager la conversation",
  "share.modal.openTitle": "Conversation partagée",
  "share.modal.creating": "Chiffrement et envoi de la conversation...",
  "share.modal.opening":
    "Téléchargement et déchiffrement de la conversation...",
  "share.createLink": "Créer le lien",
  "share.copyLink": "Copier le lien",
  "share.consent.body":
    "Opera chiffre cette conversation sur ton appareil, puis envoie la copie chiffrée vers {host}. La clé de déchiffrement reste dans le lien et n'est jamais envoyée à un serveur.\n\nToute personne disposant du lien peut lire l'intégralité de la conversation, images jointes comprises. {retention}\n\nTu peux pointer Opera vers une autre instance PrivateBin, y compris la tienne, dans Réglages > Confidentialité.",
  "share.consent.retentionDefault":
    "Le lien expire au bout de 3 jours et ne peut pas être révoqué avant.",
  "share.consent.retentionCustom":
    "Le lien expire selon la politique de rétention propre à cette instance, et ne peut pas être révoqué avant.",
  "share.error.empty":
    "Cette conversation est vide, il n'y a rien à partager pour l'instant.",
  "share.error.create": "Le lien de partage n'a pas pu être créé.",
  "share.error.open": "Cette conversation partagée n'a pas pu être ouverte.",
  "share.preview.warning":
    "Cette conversation a été partagée par quelqu'un d'autre. Ne l'ajoute que si tu fais confiance à l'expéditeur — elle peut contenir du contenu trompeur, y compris des tentatives de manipulation de l'assistant.",
  "share.preview.add": "Ajouter aux conversations",

  "chat.copied": "Copié dans le presse-papiers",
  "chat.copiedMarkdown": "Markdown copié dans le presse-papiers",

  "chatbar.placeholder": "Demander à Maestro",
  "chatbar.transcribing": "Transcription...",
  "chatbar.settings": "Réglages",
  "chatbar.install": "Installer",
  "chatbar.fileCount.one": "{count} fichier",
  "chatbar.fileCount.other": "{count} fichiers",
  "chatbar.unreadableDocument": "Document illisible",
  "chatbar.unsupportedFormat": "Format non pris en charge",
  "chatbar.unsupportedAudio":
    "L'audio doit être en WAV ou MP3. Les documents doivent être en PDF, Word ou texte brut.",
  "chatbar.unsupportedFile":
    "Seuls les images, l'audio WAV/MP3 et les documents PDF, Word ou texte brut sont pris en charge.",
  "chatbar.unsupportedByModel": "Non pris en charge par le modèle",
  "chatbar.modelNoImages":
    "Ce modèle ne peut pas lire les images. Choisis un modèle avec la vision pour en joindre une.",
  "chatbar.modelNoAudio":
    "Ce modèle ne peut pas lire l'audio. Choisis un modèle avec l'audio pour en joindre un.",
  "chatbar.modelNoVideo":
    "Ce modèle ne peut pas lire la vidéo. Choisis un modèle avec la vidéo pour en joindre une.",
  "chatbar.permissionDenied": "Autorisation refusée",
  "chatbar.cameraDenied":
    "Tu as refusé l'accès de cette application à ta caméra.",
  "chatbar.photosDenied":
    "Tu as refusé l'accès de cette application à tes photos.",
  "chatbar.micPermission.title": "Autorisation du microphone",
  "chatbar.micPermission.message":
    "L'accès au microphone est nécessaire pour la saisie vocale. Active-le dans les réglages de ton appareil.",

  "whisper.notConfigured.title": "Whisper non configuré",
  "whisper.notConfigured.message":
    "Tu as désactivé la transcription sur l'appareil. Sélectionne un modèle Whisper dans les réglages pour l'activer.",
  "whisper.notInstalled.title": "Whisper non installé",
  "whisper.notInstalled.messageInstall":
    "Le modèle Whisper {model} est nécessaire pour la transcription sur l'appareil. Veux-tu l'installer ?",
  "whisper.notInstalled.messageMainApp":
    "Le modèle Whisper {model} est nécessaire pour la transcription sur l'appareil. Installe-le depuis les réglages de l'application principale.",
  "whisper.initError.title": "Erreur d'initialisation",
  "whisper.initError.message": "Échec du chargement du modèle Whisper {model}.",
  "whisper.initError.messageReinstall":
    "Échec du chargement du modèle Whisper {model}. Il est peut-être corrompu ou incompatible. Essaie de le réinstaller depuis les réglages.",

  "overlay.welcome.title": "Bienvenue dans l'Assistant Overlay",
  "overlay.welcome.message":
    "Voici ton Assistant Overlay. Tu peux entourer pour demander n'importe quel contenu à l'écran. Il est là pour t'aider tout au long de ton usage.",

  "settings.title": "Réglages",
  "settings.notice.assistant": "Ajouter Opera comme assistant",
  "settings.notice.update": "Opera {version} est disponible",

  "settings.nav.profile.title": "Profil",
  "settings.nav.profile.subtitle": "Nom",
  "settings.nav.cloud.title": "Cloud",
  "settings.nav.cloud.subtitle": "Stockage cloud, sauvegarde",
  "settings.nav.general.title": "Général",
  "settings.nav.general.subtitle": "Langue, thème",
  "settings.nav.maestro.title": "Maestro",
  "settings.nav.maestro.subtitle": "Voix, préférences",
  "settings.nav.maestro.subtitleDesktop": "Instructions",
  "settings.maestro.voice": "Voix",
  "settings.nav.overlay.title": "Assistant Overlay",
  "settings.nav.overlay.subtitle": "Voix, contexte de l'écran",
  "settings.nav.maestroPreferences.title": "Préférences",
  "settings.nav.maestroPreferences.subtitle": "Instructions, lecture automatique",
  "settings.nav.service.title": "Service",
  "settings.nav.service.subtitle": "Service IA, serveur Ollama",
  "settings.nav.tools.title": "Outils",
  "settings.nav.tools.subtitle":
    "Outils de l'assistant, widgets, actions mobiles",
  "settings.nav.tools.subtitleDesktop": "Outils de l'assistant, widgets",
  "settings.nav.advanced.title": "Avancé",
  "settings.nav.advanced.subtitle": "Flux rapide, transcription, partage",
  "settings.nav.privacy.title": "Confidentialité",
  "settings.nav.privacy.subtitle":
    "Confidentialité des données, permissions",
  "settings.nav.support.title": "Support",
  "settings.nav.support.subtitle": "Signaler un problème, contacter le support",
  "settings.nav.info.title": "Informations",
  "settings.nav.info.subtitle": "Version de l'app, Github, Instagram, TikTok",

  "settings.info.version": "Version",
  "settings.info.links": "Liens",
  "settings.info.linksHelp":
    "Retrouve Opera en ligne, suis nos actualités et contribue au projet.",
  "settings.info.website": "Site web",

  "settings.profile.personalize": "Personnaliser mon profil",
  "settings.profile.exportCard": "Exporter ma carte de profil",
  "settings.profile.name": "Nom",
  "settings.profile.instructions": "Écris tes instructions pour l'IA",
  "settings.profile.instructionsPlaceholder": "écrire",

  "settings.general.language": "Langue",
  "settings.general.selectLanguage": "Choisir la langue",
  "settings.general.theme": "Thème de l'app",
  "settings.general.technicalDetails": "Afficher les détails techniques",
  "settings.general.technicalDetailsHelp":
    "Ajoute un bouton d'info sous les réponses pour inspecter les données techniques de l'IA.",
  "settings.general.detectionBoxes": "Afficher les boxes de détection",
  "settings.general.detectionBoxesHelp":
    "Entoure les éléments de l'écran sur lesquels la sélection de l'overlay s'aimante.",
  "settings.general.autoRead": "Lecture automatique des réponses",
  "settings.general.autoReadHelp":
    "Lit la réponse à voix haute quand tu demandes à la voix.",
  "settings.general.advancedMode": "Mode avancé",
  "settings.general.advancedModeHelp":
    "Ajoute une section Avancé au menu avec les réglages les plus techniques.",

  "settings.quickFlow.label": "Flux rapide",
  "settings.quickFlow.help":
    "Le modèle qui alimente les petites touches automatiques : titres de conversation, suggestions de réponse et certains outils. Un modèle petit et rapide est recommandé.",
  "settings.quickFlow.select": "Choisir le modèle du flux rapide",
  "settings.quickFlow.sameAsMain": "Identique au modèle principal",

  "settings.transcribeLocally.label": "Toujours transcrire localement",
  "settings.transcribeLocally.help":
    "Utilise la reconnaissance vocale intégrée à ton appareil plutôt que le modèle sélectionné.",
  "settings.transcribeLocally.helpWeb":
    "Traite les transcriptions audio localement sur ton appareil plutôt qu'avec le modèle sélectionné.",

  "settings.sharing.label": "Partage de conversation",
  "settings.sharing.help":
    "Les conversations partagées sont chiffrées sur ton appareil avant d'être envoyées, et la clé de déchiffrement ne voyage que dans le lien, jamais vers le serveur.",
  "settings.sharing.instanceHelp":
    "Elles sont stockées sur une instance PrivateBin. Laisse ce champ vide pour utiliser privatebin.net, ou saisis l'adresse d'une autre instance, y compris la tienne. L'adresse est portée par les liens que tu crées, de sorte que tes destinataires atteignent le bon serveur d'eux-mêmes.",

  "settings.overlay.default": "Assistant par défaut",
  "settings.overlay.defaultHelp":
    "Obtiens l'aide d'Opera partout sur ton appareil, depuis n'importe quelle app.",
  "settings.overlay.isDefault":
    "Opera est défini comme ton assistant par défaut.",
  "settings.overlay.isNotDefault":
    "Opera n'est pas défini comme ton assistant par défaut.",
  "settings.overlay.setDefault": "Définir comme assistant par défaut",
  "settings.overlay.autoMic": "Démarrage automatique du micro",
  "settings.overlay.autoMicHelp":
    "Active automatiquement le microphone dès l'ouverture de l'assistant.",
  "settings.overlay.appContext": "Utiliser le contexte de l'app",
  "settings.overlay.appContextHelp":
    "Envoie à Maestro l'app au premier plan et le texte affiché à l'écran lors de l'utilisation de l'Assistant Overlay",

  "settings.cloud.storage": "Stockage cloud",
  "settings.cloud.selectStorage": "Choisir le stockage cloud",
  "settings.cloud.none": "Aucun",
  "settings.cloud.connectionError": "Erreur de connexion",
  "settings.cloud.connectFailed":
    "Impossible de se connecter à {provider}. Vérifie tes réglages et réessaie.",
  "settings.cloud.disconnect.title": "Déconnecter {name} ?",
  "settings.cloud.disconnect.message":
    "Ton compte sera délié et les sauvegardes automatiques s'arrêteront. Ta sauvegarde cloud existante ne sera pas supprimée.",
  "settings.cloud.syncSuccess": "Données synchronisées avec succès.",
  "settings.cloud.syncError": "Erreur de synchronisation",
  "settings.cloud.unknownError": "Une erreur inconnue est survenue.",
  "settings.cloud.progress.connecting": "Connexion à ton compte...",
  "settings.cloud.progress.checking":
    "Recherche d'une sauvegarde existante...",
  "settings.cloud.progress.unlocking":
    "Téléchargement et déchiffrement de ta sauvegarde...",
  "settings.cloud.progress.resetting":
    "Suppression de l'ancienne sauvegarde...",

  "settings.pin.create.title": "Créer un code PIN de synchronisation",
  "settings.pin.create.message":
    "Aucune sauvegarde cloud trouvée. Crée un code PIN de 4 à 6 chiffres. Si tu l'oublies, tu perdras l'accès à tes sauvegardes cloud.",
  "settings.pin.create.confirm": "Créer",
  "settings.pin.unlock.title": "Déverrouiller la sauvegarde cloud",
  "settings.pin.unlock.message":
    "Une sauvegarde cloud a été trouvée. Saisis ton code PIN pour la déverrouiller et reprendre la synchronisation.",
  "settings.pin.unlock.confirm": "Déverrouiller",
  "settings.pin.incorrect":
    "Code PIN incorrect. Impossible de déchiffrer la sauvegarde.",
  "settings.pin.invalid": "Le code PIN doit contenir 4 à 6 chiffres.",
  "settings.pin.placeholder": "Saisis 4 à 6 chiffres",
  "settings.pin.forgot": "Code oublié",
  "settings.pin.tryAgain": "Réessayer",
  "settings.pin.reset.title": "Réinitialiser la sauvegarde ?",
  "settings.pin.reset.message":
    "Cela supprimera définitivement ta sauvegarde cloud existante afin de créer un nouveau code PIN. Veux-tu continuer ?",
  "settings.pin.reset.confirm": "Supprimer et réinitialiser",

  "settings.service.beta": "Serveur Opera Beta",
  "settings.service.betaHelp":
    "Un serveur de test que nous hébergeons pour essayer Opera sans en installer un.",
  "settings.beta.intro":
    "Un serveur de test que nous hébergeons pour essayer Opera sans en installer un. Tout ce qui sert à répondre passe par lui : tes messages, tes pièces jointes, ce qu'un outil lit pour toi (contacts, agenda, texte de l'écran) et ton adresse IP.",
  "settings.beta.privacy":
    "Nous n'en lisons rien, nous n'en gardons rien et nous ne l'utiliserons jamais pour quoi que ce soit. Le serveur sera arrêté et effacé à la fin de la bêta Play Store.",
  "settings.beta.testing":
    "Il sert uniquement aux tests. Pour un usage quotidien, installe ton propre serveur Ollama et rien ne quittera ton réseau.",
  "settings.service.ollama": "Ollama",
  "settings.service.ollamaHelp":
    "Utilise tes serveurs Ollama pour exécuter de puissants modèles d'IA chez toi.",
  "settings.service.cloudapi": "API Cloud",
  "settings.service.cloudapiHelp":
    "Connecte Mistral, LM Studio ou tout serveur qui parle l'API OpenAI.",
  "settings.service.local": "Intégré",
  "settings.service.localHelp":
    "Utilise le modèle d'IA fourni avec ton appareil. Rien à télécharger.",
  "settings.local.help":
    "Ton appareil embarque son propre modèle d'IA. Il est toujours disponible et ne demande aucune installation.",
  "settings.local.browserModel": "Modèle du navigateur",
  "settings.local.sheet.family": "Famille",
  "settings.local.sheet.runtime": "Moteur",
  "settings.local.sheet.browser": "Navigateur",
  "settings.local.sheet.version": "Version",
  "settings.local.sheet.context": "Contexte",
  "settings.local.sheet.thinking": "Réflexion",
  "settings.local.sheet.tokens": "{count} tokens",
  "settings.local.sheet.yes": "Oui",
  "settings.local.sheet.no": "Non",
  "settings.local.status.available": "Prêt",
  "settings.local.status.downloadable": "À télécharger",
  "settings.local.status.downloading": "Téléchargement",
  "settings.local.status.unavailable": "Indisponible",
  "settings.local.download": "Télécharger le modèle",
  "settings.local.downloading": "Téléchargement du modèle du navigateur",
  "settings.local.notDownloaded": "Le modèle du navigateur n'est pas encore téléchargé. Télécharge-le depuis Réglages > Sur l'appareil.",

  "settings.model.capTools": "Outils",
  "settings.model.capVision": "Vision",
  "settings.model.capThinking": "Réflexion",
  "settings.model.capAudio": "Audio",
  "settings.model.capVideo": "Vidéo",

  "settings.service.litert": "Sur l'appareil",
  "settings.service.litertHelp":
    "Télécharge des modèles ouverts depuis Hugging Face et exécute-les sur cet appareil.",
  "settings.litert.title": "Sur l'appareil",
  "settings.litert.modelTitle": "Modèle d'IA",
  "settings.litert.help":
    "Ajoute et gère tes modèles d'IA depuis Hugging Face.",
  "settings.litert.addModel": "Ajouter un modèle d'IA",
  "settings.litert.addModelPlaceholder": "rechercher un modèle",
  "settings.litert.installed": "Installé",
  "settings.litert.loading": "Chargement...",
  "settings.litert.familyOther": "Autres",
  "settings.litert.unavailable": "Ce modèle ne tient pas sur cet appareil ou n'a pas pu être chargé.",
  "settings.litert.description": "Description",
  "settings.litert.noDescription": "Aucune description disponible sur Hugging Face.",
  "settings.litert.otherModels": "Autres modèles",
  "settings.litert.sameFamily": "Même famille",
  "settings.litert.loadFailed":
    "La liste des modèles n'a pas pu être chargée. Vérifie ta connexion.",
  "settings.litert.downloadingModel": "Téléchargement de {name}",
  "settings.litert.cancelDownload": "Annuler le téléchargement",
  "settings.litert.downloadingPercent": "Téléchargement {percent}%",
  "settings.litert.downloaded": "Téléchargé",
  "settings.litert.speed": "Vitesse",
  "settings.litert.timeLeft": "Temps restant",
  "settings.litert.noResults": "Aucun modèle compatible ne correspond à cette recherche.",
  "settings.litert.downloadTitle": "Télécharger {name} ?",
  "settings.litert.downloadMessage":
    "{name} pèse {size} et sera téléchargé via ta connexion actuelle.",
  "settings.litert.downloadAction": "Télécharger",
  "settings.litert.deleteModel": "Supprimer le modèle",
  "settings.litert.deleteTitle": "Supprimer {name} ?",
  "settings.litert.deleteMessage":
    "Le modèle est retiré de cet appareil. Tu pourras le télécharger de nouveau plus tard.",
  "settings.litert.contextTitle": "Longueur de contexte",
  "settings.litert.contextHelp":
    "Budget du cache KV — des valeurs basses consomment moins de mémoire.",
  "settings.litert.forceLoad": "Forcer le chargement",
  "settings.litert.forceLoadHelp":
    "Ignore la vérification de mémoire préalable. Peut planter si l'appareil manque de mémoire.",
  "generation.error.contextLength":
    "Cette conversation est trop longue pour le modèle. Lance une nouvelle discussion, ou augmente la longueur de contexte dans les réglages.",
  "generation.error.memory":
    "Pas assez de mémoire libre pour charger ce modèle. Ferme quelques applications, ou choisis-en un plus petit.",
  "generation.error.unreachable":
    "Le serveur est injoignable. Vérifie son adresse et ta connexion.",
  "generation.error.refused":
    "Le serveur a refusé la connexion. Vérifie la clé d'API.",
  "generation.error.missingModel": "Ce modèle n'est pas disponible sur le serveur.",
  "generation.error.onDevice":
    "Le modèle sur l'appareil n'a pas pu s'exécuter. Réessaie, ou change de modèle dans les réglages.",
  "generation.error.unknown":
    "La génération a échoué pour une raison inconnue.",
  "generation.error.generic":
    "La génération a échoué. Réessaie, ou change de modèle dans les réglages.",
  "settings.service.serverLink": "lien du serveur",
  "settings.service.failover": "Bascule automatique",
  "settings.service.failoverHelp":
    "Quand le serveur actif est injoignable, conserve le même modèle en le relançant sur un autre serveur qui le propose.",

  "settings.whisper.label": "Modèle Whisper",
  "settings.whisper.help":
    "Plus la taille est grande, plus le traitement sera long.",
  "settings.whisper.select": "Choisir le modèle Whisper",
  "settings.whisper.none": "Aucun",
  "settings.whisper.tiny": "Tiny",
  "settings.whisper.base": "Base",
  "settings.whisper.small": "Small",
  "settings.whisper.downloading": "Téléchargement de Whisper {model}...",
  "settings.whisper.downloadSuccess":
    "Modèle Whisper {model} téléchargé avec succès.",
  "settings.whisper.downloadFailed":
    "Échec du téléchargement du modèle Whisper.",
  "settings.whisper.loadFailed":
    "Échec du chargement du modèle Whisper {model}. Il est peut-être corrompu.",
  "settings.whisper.delete.title": "Supprimer le modèle Whisper",
  "settings.whisper.delete.message":
    "Veux-tu vraiment supprimer le modèle Whisper {model} ?",
  "settings.whisper.download.title": "Télécharger le modèle Whisper",
  "settings.whisper.download.message":
    "Veux-tu vraiment télécharger le modèle Whisper {model} ({size}) ?",
  "settings.whisper.download.confirm": "Télécharger",

  "settings.tts.label": "Moteur de voix",
  "settings.tts.help":
    "Des voix naturelles qui fonctionnent hors ligne. Les langues non prises en charge utilisent la voix du système.",
  "settings.tts.select": "Choisir le moteur de voix",
  "settings.tts.system": "Système",
  "settings.tts.kokoro": "Kokoro",
  "settings.tts.supertonic": "Supertonic",
  "settings.tts.voiceLabel": "Voix",
  "settings.tts.selectVoice": "Choisir la voix",
  "settings.tts.speed": "Vitesse de lecture",
  "settings.tts.downloading": "Téléchargement de {engine}...",
  "settings.tts.downloadSuccess": "Voix {engine} téléchargée avec succès.",
  "settings.tts.downloadFailed": "Échec du téléchargement de la voix {engine}.",
  "settings.tts.delete.title": "Supprimer la voix {engine}",
  "settings.tts.delete.message":
    "Veux-tu vraiment supprimer la voix {engine} ? Maestro utilisera la voix du système.",
  "settings.tts.download.title": "Télécharger la voix {engine}",
  "settings.tts.download.message":
    "Veux-tu vraiment télécharger la voix {engine} ({size}) ?",
  "settings.tts.download.confirm": "Télécharger",

  "settings.privacy.data": "Confidentialité des données",
  "settings.privacy.intro":
    "Par défaut, tout reste sur ton téléphone : tes conversations, réglages et modèles locaux fonctionnent hors ligne, sans passer par internet.",
  "settings.privacy.externalServices":
    "Des données ne sortent que si tu le choisis : pour synchroniser un cloud (Google Drive, Nextcloud), utiliser un modèle en ligne ou faire une recherche web.",
  "settings.privacy.noTracking":
    "Aucune publicité, aucun traqueur caché et aucune revente de données. Tu gardes le contrôle total.",
  "settings.privacy.policy": "Politique de confidentialité",
  "settings.privacy.permissionsWeb":
    "Opera a besoin de quelques autorisations pour fonctionner au mieux. Tu peux les gérer dans les paramètres de site de ton navigateur.",
  "settings.privacy.permissionsNative":
    "Opera a besoin de quelques autorisations pour fonctionner au mieux. Tu peux les modifier dans les réglages de ton appareil.",

  "settings.data.management": "Gestion des données",
  "settings.data.managementHelp":
    "Gère localement les données de tes conversations et de tes réglages.",
  "settings.data.export": "Exporter",
  "settings.data.exportAction": "Exporter les données",
  "settings.data.exportScope": "Sélectionne ce que tu souhaites exporter.",
  "settings.data.exportSuccess": "Données exportées avec succès.",
  "settings.data.exportFailed": "Échec de l'export des données.",
  "settings.data.conversations": "Conversations",
  "settings.data.import": "Importer",
  "settings.data.importAction": "Importer des données",
  "settings.data.importSuccess": "Données importées avec succès.",
  "settings.data.importFailed": "Échec de l'import des données.",
  "settings.data.deleteAllAction": "Supprimer toutes les conversations",
  "settings.data.deleteAll.title": "Supprimer toutes les conversations",
  "settings.data.deleteAll.message":
    "Cela supprimera définitivement toutes les conversations. Cette action est irréversible.",
  "settings.data.deleteAll.confirm": "Tout supprimer",
  "settings.data.deleteAll.success":
    "Toutes les conversations ont été supprimées.",
  "settings.data.deleteAll.failed":
    "Échec de la suppression des conversations.",

  "settings.support.report": "Signalement",
  "settings.support.reportHelp": "Décris le problème rencontré.",
  "settings.support.more": "Besoin de plus d'aide",
  "settings.support.moreHelp":
    "Contacte notre équipe de support pour obtenir de l'aide et des ressources supplémentaires.",
  "settings.support.contact": "Contacter le support",

  "settings.tools.widgets.title": "Widgets",
  "settings.tools.widgets.help":
    "Résultats structurés que l'assistant peut afficher : {list}.",
  "settings.tools.mcp.title": "Serveurs MCP",
  "settings.tools.mcp.help":
    "Connecte Opera à des serveurs MCP externes pour que l'assistant puisse utiliser leurs outils.",
  "settings.tools.mobile.title": "Actions mobiles",
  "settings.tools.mobile.help":
    "Autorise l'assistant à s'intégrer aux applications installées : {list}.",

  "tools.consent.allow": "Autoriser",
  "tools.consent.decline": "Refuser",

  "settings.mcp.connecting": "Connexion...",
  "settings.mcp.noTools": "Aucun outil",
  "settings.mcp.oneTool": "1 outil",
  "settings.mcp.toolCount": "{count} outils",
  "settings.mcp.toolsEnabled": "{enabled} sur {total} outils",
  "settings.mcp.signInRequired": "Connexion requise",
  "settings.mcp.signIn": "Se connecter",
  "settings.mcp.unreachable": "Injoignable",
  "settings.mcp.notConnected": "Non connecté",
  "settings.mcp.reconnect": "Reconnecter",
  "settings.mcp.tools": "Outils ({count})",
  "settings.server.settings": "Réglages",
  "settings.mcp.headerLabel": "En-tête",
  "settings.mcp.headerHelp":
    "Un en-tête envoyé avec chaque requête, pour les serveurs qui acceptent un jeton d'accès plutôt qu'une connexion. Pour GitHub, utilise Authorization et Bearer suivi de ton jeton.",
  "settings.mcp.headerName": "nom de l'en-tête",
  "settings.mcp.headerValue": "valeur de l'en-tête",
  "settings.mcp.clientIdLabel": "Identifiant client",
  "settings.mcp.clientIdHelp":
    "Nécessaire uniquement quand un serveur propose une connexion mais n'enregistre pas Opera automatiquement. Sinon, laisse ce champ vide.",
  "settings.mcp.clientId": "identifiant client oauth",
  "settings.mcp.remove.action": "Retirer le serveur",
  "settings.mcp.remove.title": "Retirer le serveur",
  "settings.mcp.remove.message":
    "Retirer {name} ? Ses outils et sa connexion enregistrée seront supprimés.",
  "settings.server.link": "Lien",
  "settings.server.add": "Ajouter un serveur",
  "settings.server.name": "Nom",
  "settings.server.nameHelp":
    "Facultatif. Le nom du serveur lui-même est utilisé si tu le laisses vide.",
  "settings.server.namePlaceholder": "nom du serveur",
  "settings.server.checking": "Vérification...",
  "settings.server.addFailed": "Impossible d'ajouter le serveur",
  "settings.server.duplicate": "Ce serveur est déjà dans la liste.",
  "settings.ollama.title": "Serveurs Ollama",
  "settings.ollama.help":
    "Ajoute les liens de tes serveurs Ollama pour y connecter Opera.",
  "settings.ollama.newServer": "Nouveau serveur",
  "settings.ollama.noLink": "Aucun lien",
  "settings.ollama.checking": "Vérification...",
  "settings.ollama.connected": "Connecté",
  "settings.ollama.unreachable": "Injoignable",
  "settings.ollama.connecting": "Connexion...",
  "settings.ollama.reconnect": "Reconnecter",
  "settings.ollama.models": "Modèles",
  "settings.ollama.modelsCount": "Modèles ({count})",
  "settings.ollama.modelsLoading": "Recherche des modèles...",
  "settings.ollama.noModels": "Aucun modèle sur ce serveur pour l'instant.",
  "settings.ollama.searchModels": "rechercher un modèle",
  "settings.ollama.enableAll": "Tout activer",
  "settings.ollama.disableAll": "Tout désactiver",
  "settings.ollama.noMatch": "Aucun modèle ne correspond à cette recherche.",
  "settings.ollama.showMore": "Afficher plus ({count})",
  "settings.ollama.capabilities": "Capacités",
  "settings.ollama.contextLength": "Longueur de contexte",
  "settings.ollama.contextHelp":
    "Nombre maximal de tokens que le modèle peut utiliser.",
  "settings.ollama.keepAlive": "Maintien du modèle en mémoire",
  "settings.ollama.keepAliveHelp":
    "Combien de temps le modèle reste chargé en mémoire après une requête.",
  "settings.ollama.keepAliveHelpAdvanced":
    "Combien de temps le modèle reste chargé en mémoire après une requête, en secondes. Utilise -1 pour le garder chargé indéfiniment.",
  "settings.ollama.unreachableTitle": "Serveur injoignable",
  "settings.ollama.unreachableInfo":
    "Ce serveur n'a pas pu être joint.\n\n- Vérifie que le serveur est démarré.\n- Vérifie la connexion réseau du serveur.\n- Assure-toi que l'URL et le port sont corrects.",
  "settings.ollama.remove.action": "Retirer le serveur",
  "settings.cloudapi.title": "Serveurs compatibles OpenAI",
  "settings.cloudapi.help":
    "Ajoute le lien API de ton service ou serveur, par exemple https://api.mistral.ai/v1 pour Mistral ou http://localhost:1234/v1 pour LM Studio.",
  "settings.cloudapi.apiKey": "Clé API",
  "settings.cloudapi.apiKeyHelp":
    "Nécessaire pour les services cloud comme Mistral. Laisse vide pour un serveur local comme LM Studio.",
  "settings.cloudapi.apiKeyPlaceholder": "clé api",
  "settings.cloudapi.unreachableInfo":
    "Ce serveur n'a pas pu être joint.\n\n- Vérifie que le serveur est démarré.\n- Assure-toi que le lien est le lien API, qui finit souvent par /v1.\n- Vérifie la clé API si le service en demande une.",
  "settings.ollama.remove.title": "Retirer le serveur",
  "settings.ollama.remove.message":
    "Retirer {name} ? Opera ne proposera plus ses modèles.",

  "permissions.undefined": "Non défini",

  "settings.mcp.signInInfo":
    "Opera a besoin que tu te connectes à ce serveur avant de pouvoir utiliser ses outils.\n\nCertains serveurs, dont GitHub, ne proposent pas de connexion aux applications comme Opera. Pour ceux-là, ajoute plutôt un jeton d'accès sous Réglages.",
};
