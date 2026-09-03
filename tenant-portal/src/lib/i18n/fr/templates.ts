import type { templates as en } from '../en/templates'

/** TemplatesPage — CRUD for reusable Broadcasting message bodies. */
export const templates = {
  pageTitle: 'Modèles',
  pageSubtitle: 'Corps de message réutilisables pour la page Diffusion.',
  newTemplate: 'Nouveau modèle',
  columnId: 'ID',
  columnBody: 'Corps',
  columnUpdated: 'Mis à jour',
  templateIdLabel: "ID du modèle",
  emptyState: 'Aucun modèle pour le moment — créez-en un pour le réutiliser depuis Diffusion.',
  copyId: "Copier l'ID",
  editTitle: 'Modifier le modèle',
  deleteTitle: 'Supprimer le modèle',
  deleteConfirmMessage: (name: string) => `Supprimer « ${name} » ? Cette action est irréversible.`,
  deleted: 'Modèle supprimé.',
  deleteFailed: 'Échec de la suppression du modèle.',
  bodyLabel: 'Corps',
  bodyPlaceholder: 'Bonjour {{name}}, votre commande a été expédiée !',
  formattingCaption:
    "La mise en forme n'est qu'une aide à la rédaction — le texte est enregistré brut, tel qu'il est envoyé depuis Diffusion.",
  saveTemplate: 'Enregistrer le modèle',
  bodyRequired: 'Le corps du modèle ne peut pas être vide.',
  created: 'Modèle créé.',
  updated: 'Modèle mis à jour.',
  saveFailed: "Échec de l'enregistrement du modèle.",
} satisfies typeof en
