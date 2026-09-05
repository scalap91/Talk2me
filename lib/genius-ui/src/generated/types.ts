// GÉNÉRÉ par codegen depuis spec/ — NE PAS ÉDITER À LA MAIN.
// Genius UI spec v0.8.0. Toute évolution passe par la spec.
import type { ReactNode } from 'react';

/** Échelle d'espacement (tokens). */
export type GeniusSpacing = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
/** Rôles de couleur (tokens). */
export type GeniusColor = 'bg' | 'surface' | 'surfaceMuted' | 'ink' | 'inkMuted' | 'primary' | 'onPrimary' | 'danger' | 'onDanger' | 'line' | 'focus';
/** Paliers responsive Web (base = mobile). */
export type GeniusBreakpoint = 'base' | 'md' | 'lg' | 'xl';
/** Valeur unique OU par palier (props responsive Web). */
export type Responsive<T> = T | Partial<Record<GeniusBreakpoint, T>>;

/** Racine d'un écran : fond, gestion du défilement et zone de contenu principale. (Web: <main>) */
export interface GeniusScaffoldProps {
  /** Rôle de couleur du fond de l'écran. */
  background?: GeniusColor;
  /** Si vrai, le corps défile verticalement quand il dépasse la hauteur. */
  scrollable?: boolean;
  /** Marge intérieure autour du corps. */
  padding?: GeniusSpacing;
  /** Contenu principal de l'écran. */
  children?: ReactNode;
}

export type GeniusColumnAlign = 'start' | 'center' | 'end' | 'stretch';
export type GeniusColumnJustify = 'start' | 'center' | 'end' | 'between' | 'around';
/** Empile ses enfants verticalement, avec un espacement cohérent issu des tokens. (Web: <div> (flex column)) */
export interface GeniusColumnProps {
  /** Espace entre enfants. */
  gap?: GeniusSpacing;
  /** Alignement sur l'axe horizontal (transversal). */
  align?: GeniusColumnAlign;
  /** Répartition sur l'axe vertical (principal). */
  justify?: GeniusColumnJustify;
  /** Enfants empilés du haut vers le bas. */
  children?: ReactNode;
}

export type GeniusRowAlign = 'start' | 'center' | 'end' | 'stretch';
export type GeniusRowJustify = 'start' | 'center' | 'end' | 'between' | 'around';
/** Aligne ses enfants horizontalement, avec un espacement cohérent issu des tokens. (Web: <div> (flex row)) */
export interface GeniusRowProps {
  /** Espace entre enfants. */
  gap?: GeniusSpacing;
  /** Alignement sur l'axe vertical (transversal). */
  align?: GeniusRowAlign;
  /** Répartition sur l'axe horizontal (principal). */
  justify?: GeniusRowJustify;
  /** WEB uniquement : passe en COLONNE sous ce palier (mobile-first). Ex. 'md' = colonne sur mobile, ligne dès la tablette. Flutter garde une Row (mobile natif). @web */
  stackBelow?: GeniusBreakpoint;
  /** Enfants alignés de gauche à droite. */
  children?: ReactNode;
}

export type GeniusStackAlign = 'topStart' | 'top' | 'topEnd' | 'start' | 'center' | 'end' | 'bottomStart' | 'bottom' | 'bottomEnd';
/** Superpose ses enfants dans la même zone, alignés selon une ancre commune. (Web: <div> (grid, cellule unique)) */
export interface GeniusStackProps {
  /** Ancre commune des enfants superposés. */
  align?: GeniusStackAlign;
  /** Enfants superposés, le dernier au-dessus. */
  children?: ReactNode;
}

export type GeniusTextVariant = 'display' | 'title' | 'body' | 'caption' | 'label';
export type GeniusTextWeight = 'regular' | 'medium' | 'bold';
export type GeniusTextAlign = 'start' | 'center' | 'end';
/** Affiche du texte selon une échelle typographique et des rôles de couleur issus des tokens. (Web: <h1..h3>/<p>/<span> selon variant) */
export interface GeniusTextProps {
  /** Rôle typographique (taille, interligne, graisse de base). */
  variant?: GeniusTextVariant;
  /** Graisse. Si absente, hérite de la graisse de base du variant. */
  weight?: GeniusTextWeight;
  /** Rôle de couleur du texte. */
  color?: GeniusColor;
  /** Alignement horizontal du texte. */
  align?: GeniusTextAlign;
  /** Le texte affiché. */
  children?: ReactNode;
}

export type GeniusCardRadius = 'sm' | 'md' | 'lg';
export type GeniusCardElevation = 'none' | 'low' | 'medium';
/** Conteneur de surface avec coins arrondis, marge intérieure et élévation optionnelle. (Web: <section> (surface)) */
export interface GeniusCardProps {
  /** Marge intérieure. */
  padding?: GeniusSpacing;
  /** Rayon des coins. */
  radius?: GeniusCardRadius;
  /** Ombre portée / séparation visuelle. */
  elevation?: GeniusCardElevation;
  /** Contenu de la carte. */
  children?: ReactNode;
}

export type GeniusButtonVariant = 'primary' | 'ghost' | 'danger';
export type GeniusButtonSize = 'sm' | 'md' | 'lg';
/** Action principale : déclenche une intention au clic ou au tap. (Web: <button>) */
export interface GeniusButtonProps {
  /** Intention visuelle. */
  variant?: GeniusButtonVariant;
  /** Taille. */
  size?: GeniusButtonSize;
  /** Désactive l'action et le focus. */
  disabled?: boolean;
  /** Affiche un indicateur ; l'action est suspendue. */
  loading?: boolean;
  /** Occupe toute la largeur disponible. */
  fullWidth?: boolean;
  /** Libellé texte (alternative au slot child). */
  label?: string;
  /** Déclenché au clic/tap. Jamais déclenché si disabled ou loading. */
  onPress?: () => void;
  /** Contenu personnalisé (prioritaire sur label). */
  children?: ReactNode;
}

export type GeniusInputType = 'text' | 'email' | 'password' | 'number';
/** Champ de saisie texte sur une seule ligne, contrôlé. (Web: <input>) */
export interface GeniusInputProps {
  /** Valeur courante (contrôlée). */
  value?: string;
  /** Texte indicatif quand vide. */
  placeholder?: string;
  /** Nature de la saisie. */
  type?: GeniusInputType;
  /** Désactive la saisie. */
  disabled?: boolean;
  /** Marque le champ comme en erreur. */
  invalid?: boolean;
  /** Déclenché à chaque modification, avec la nouvelle valeur. */
  onChange?: (value: string) => void;
}

/** Bascule binaire on/off. Brique interactive de référence du PoC (état + événement + accessibilité). (Web: <button role=switch>) */
export interface GeniusSwitchProps {
  /** État courant (contrôlé) : activé ou non. */
  value?: boolean;
  /** Désactive la bascule et le focus. */
  disabled?: boolean;
  /** Déclenché quand l'utilisateur bascule, avec le nouvel état. Jamais déclenché si disabled. */
  onChange?: (value: boolean) => void;
}

export type GeniusBoxRadius = 'none' | 'sm' | 'md' | 'lg' | 'full';
/** Conteneur générique : dimensions, marge intérieure, fond, arrondi, bordure. Normalise Container / SizedBox / Padding / ColoredBox / DecoratedBox / ClipRRect. (Web: <div>) */
export interface GeniusBoxProps {
  /** Largeur fixe (px logiques). Absente = auto. */
  width?: number;
  /** Hauteur fixe. Absente = auto. */
  height?: number;
  /** Marge intérieure. */
  padding?: GeniusSpacing;
  /** Rôle de couleur de fond. Absent = transparent. */
  background?: GeniusColor;
  /** Arrondi des coins (clippe le contenu si > none). */
  radius?: GeniusBoxRadius;
  /** Bordure 1px couleur line. */
  border?: boolean;
  /** Contenu du conteneur. */
  children?: ReactNode;
}

export type GeniusIconSize = 'sm' | 'md' | 'lg';
/** Icône d'un registre de noms partagé entre plateformes. Le nom est le contrat ; chaque plateforme le rend avec son propre jeu (SVG côté Web, IconData côté Flutter). (Web: <svg>) */
export interface GeniusIconProps {
  /** Nom du registre (ex. check, close, search, menu, heart, star, user, home, plus, chevronRight). */
  name: string;
  /** Taille (sm 16 / md 20 / lg 24). */
  size?: GeniusIconSize;
  /** Rôle de couleur. */
  color?: GeniusColor;
}

export type GeniusExpandedFit = 'tight' | 'loose';
/** Enfant flexible d'une Row/Column : occupe l'espace restant selon un facteur. Normalise Expanded (tight) et Flexible (loose). (Web: <div> (flex item)) */
export interface GeniusExpandedProps {
  /** Facteur de partage de l'espace. */
  flex?: number;
  /** tight = remplit tout l'espace (Expanded) ; loose = jusqu'à sa taille naturelle (Flexible). */
  fit?: GeniusExpandedFit;
  /** Contenu flexible. */
  children?: ReactNode;
}

export type GeniusCenterAlign = 'topStart' | 'top' | 'topEnd' | 'start' | 'center' | 'end' | 'bottomStart' | 'bottom' | 'bottomEnd';
/** Aligne un enfant unique selon une ancre. Normalise Center (ancre center) et Align. (Web: <div> (grid, place-items)) */
export interface GeniusCenterProps {
  /** Ancre de l'enfant. */
  align?: GeniusCenterAlign;
  /** Contenu à aligner. */
  children?: ReactNode;
}

/** Espace flexible qui pousse les éléments voisins dans une Row/Column. (Web: <div> (flex:auto)) */
export interface GeniusSpacerProps {
  /** Facteur de partage de l'espace vide. */
  flex?: number;
}

/** Ligne de séparation, horizontale ou verticale. (Web: <hr> / <div>) */
export interface GeniusDividerProps {
  /** Orientation verticale (sinon horizontale). */
  vertical?: boolean;
  /** Rôle de couleur du trait. */
  color?: GeniusColor;
}

export type GeniusAvatarSize = 'sm' | 'md' | 'lg' | 'xl';
/** Vignette ronde d'identité : photo si disponible, sinon initiales. Normalise CircleAvatar / T2mAvatar. (Web: <span> rond (img ou initiales)) */
export interface GeniusAvatarProps {
  /** URL de l'image. Absente = repli initiales. */
  src?: string;
  /** Initiales affichées à défaut d'image (1-2 lettres). */
  initials?: string;
  /** Diamètre (sm 28 / md 40 / lg 56 / xl 80). */
  size?: GeniusAvatarSize;
}

export type GeniusImageFit = 'cover' | 'contain' | 'fill';
export type GeniusImageRadius = 'none' | 'sm' | 'md' | 'lg' | 'full';
/** Image distante avec cadrage, arrondi et dimensions. Normalise Image.network / NetworkImage. (Web: <img>) */
export interface GeniusImageProps {
  /** URL de l'image. */
  src: string;
  /** Texte alternatif (accessibilité/SEO, Web). */
  alt?: string;
  /** Mode de cadrage. */
  fit?: GeniusImageFit;
  /** Arrondi des coins. */
  radius?: GeniusImageRadius;
  /** Largeur fixe. */
  width?: number;
  /** Hauteur fixe. */
  height?: number;
}

/** Rangée standard d'une liste : icône optionnelle, titre, sous-titre, icône de fin, tap optionnel. (Web: <button>/<div> en ligne) */
export interface GeniusListTileProps {
  /** Libellé principal. */
  title: string;
  /** Libellé secondaire. */
  subtitle?: string;
  /** Nom d'icône en tête (registre GeniusIcon). */
  leadingIcon?: string;
  /** Nom d'icône en fin (ex. chevronRight). */
  trailingIcon?: string;
  /** Désactive le tap et le focus. */
  disabled?: boolean;
  /** Déclenché au tap si présent. Jamais si disabled. Rend la rangée focusable/cliquable. */
  onTap?: () => void;
}

export type GeniusWrapAlign = 'start' | 'center' | 'end';
/** Dispose les enfants en ligne et passe à la ligne suivante quand l'espace manque (chips, tags…). (Web: <div> (flex wrap)) */
export interface GeniusWrapProps {
  /** Espace horizontal entre enfants. */
  gap?: GeniusSpacing;
  /** Espace vertical entre lignes. */
  runGap?: GeniusSpacing;
  /** Alignement horizontal des enfants. */
  align?: GeniusWrapAlign;
  /** Éléments disposés puis repliés. */
  children?: ReactNode;
}

/** Force un ratio largeur/hauteur à son enfant (vignettes, médias). (Web: <div> (aspect-ratio)) */
export interface GeniusAspectRatioProps {
  /** Rapport largeur/hauteur (ex. 1.777 pour 16:9). */
  ratio?: number;
  /** Contenu contraint au ratio. */
  children?: ReactNode;
}

export type GeniusIconButtonVariant = 'plain' | 'tonal' | 'filled';
export type GeniusIconButtonSize = 'sm' | 'md' | 'lg';
/** Bouton composé d'une seule icône. Exige un libellé d'accessibilité. (Web: <button aria-label>) */
export interface GeniusIconButtonProps {
  /** Nom d'icône (registre GeniusIcon). */
  icon: string;
  /** Libellé d'accessibilité OBLIGATOIRE (aria-label Web / tooltip Flutter). Un bouton-icône sans texte doit être nommé. */
  label: string;
  /** plain = transparent, tonal = fond doux, filled = fond primaire. */
  variant?: GeniusIconButtonVariant;
  /** Taille. */
  size?: GeniusIconButtonSize;
  /** Désactive l'action et le focus. */
  disabled?: boolean;
  /** Déclenché au clic/tap. Jamais si disabled. */
  onPress?: () => void;
}

/** Rend une zone/contenu quelconque cliquable, proprement et accessible. Normalise GestureDetector / InkWell. (Web: <div role=button tabindex>) */
export interface GeniusPressableProps {
  /** Libellé d'accessibilité si le contenu n'est pas explicite (aria-label). */
  label?: string;
  /** Désactive l'action et le focus. */
  disabled?: boolean;
  /** Déclenché au clic/tap/Entrée/Espace. Jamais si disabled. */
  onPress?: () => void;
  /** Contenu rendu cliquable. */
  children?: ReactNode;
}

export type GeniusFabSize = 'md' | 'lg';
/** Bouton d'action flottant : action principale d'un écran, rond et surélevé. (Web: <button> rond surélevé) */
export interface GeniusFabProps {
  /** Nom d'icône (registre GeniusIcon). */
  icon: string;
  /** Libellé d'accessibilité OBLIGATOIRE (aria-label / tooltip). */
  label: string;
  /** Taille (md 56 / lg 64). */
  size?: GeniusFabSize;
  /** Désactive l'action et le focus. */
  disabled?: boolean;
  /** Déclenché au clic/tap. Jamais si disabled. */
  onPress?: () => void;
}

/** Liste verticale d'éléments, avec espacement ou séparateurs. Normalise ListView. (Web: <div role=list>) */
export interface GeniusListProps {
  /** Espace entre éléments (ignoré si divided). */
  gap?: GeniusSpacing;
  /** Insère un séparateur entre les éléments. */
  divided?: boolean;
  /** Éléments de la liste. */
  children?: ReactNode;
}

/** Grille de colonnes. Web : nombre de colonnes RESPONSIVE par palier. Flutter : nombre de colonnes mobile/tablette (pas de logique desktop). Normalise GridView. (Web: <div> (grid)) */
export interface GeniusGridProps {
  /** Nombre de colonnes de base (mobile). Flutter l'utilise tel quel. */
  cols?: number;
  /** WEB : colonnes dès la tablette (≥768). @web */
  colsMd?: number;
  /** WEB : colonnes dès le desktop (≥1024). @web */
  colsLg?: number;
  /** WEB : colonnes dès le grand écran (≥1280). @web */
  colsXl?: number;
  /** Espace entre cellules. */
  gap?: GeniusSpacing;
  /** Cellules de la grille. */
  children?: ReactNode;
}

export type GeniusScrollAxis = 'vertical' | 'horizontal';
/** Conteneur défilant explicite (vertical ou horizontal). Normalise SingleChildScrollView. (Web: <div> (overflow auto)) */
export interface GeniusScrollProps {
  /** Axe de défilement. */
  axis?: GeniusScrollAxis;
  /** Contenu défilant. */
  children?: ReactNode;
}

export type GeniusSpinnerSize = 'sm' | 'md' | 'lg';
/** Indicateur de chargement circulaire indéterminé. Normalise CircularProgressIndicator. (Web: <span role=status>) */
export interface GeniusSpinnerProps {
  /** Diamètre (sm 16 / md 24 / lg 36). */
  size?: GeniusSpinnerSize;
  /** Rôle de couleur. */
  color?: GeniusColor;
}

/** Barre de progression linéaire. Déterminée si value fournie, sinon indéterminée. Normalise LinearProgressIndicator. (Web: <div role=progressbar>) */
export interface GeniusProgressProps {
  /** Progression 0..1. Absente = indéterminée (animation continue). */
  value?: number;
  /** Rôle de couleur de la barre. */
  color?: GeniusColor;
}

export type GeniusSnackbarVariant = 'info' | 'success' | 'error';
/** Message transitoire en bas d'écran, avec action optionnelle. Contrôlé par `open`. Normalise SnackBar. (Web: <div role=status> (layer toast)) */
export interface GeniusSnackbarProps {
  /** Texte affiché. */
  message: string;
  /** Visible ou non (contrôlé par le parent). */
  open?: boolean;
  /** Intention visuelle. */
  variant?: GeniusSnackbarVariant;
  /** Libellé d'un bouton d'action (ex. Annuler). */
  actionLabel?: string;
  /** Déclenché au clic sur l'action. */
  onAction?: () => void;
  /** Déclenché quand le message se ferme. */
  onDismiss?: () => void;
}

/** Boîte de dialogue modale, centrée. Contrôlée par `open`. Normalise AlertDialog / showDialog. (Web: <dialog> (natif, top-layer)) */
export interface GeniusDialogProps {
  /** Visible ou non (contrôlé par le parent). */
  open?: boolean;
  /** Titre du dialogue. */
  title?: string;
  /** Fermeture par Échap / clic sur le fond autorisée. */
  dismissible?: boolean;
  /** Déclenché à la fermeture (Échap, fond, ou programmatique). */
  onClose?: () => void;
  /** Contenu du dialogue. */
  children?: ReactNode;
}

/** Feuille modale qui monte du bas de l'écran. Contrôlée par `open`. Normalise showModalBottomSheet / DraggableScrollableSheet. (Web: <dialog> stylé en feuille basse) */
export interface GeniusBottomSheetProps {
  /** Visible ou non (contrôlé par le parent). */
  open?: boolean;
  /** Titre de la feuille. */
  title?: string;
  /** Fermeture par Échap / clic sur le fond autorisée. */
  dismissible?: boolean;
  /** Déclenché à la fermeture. */
  onClose?: () => void;
  /** Contenu de la feuille. */
  children?: ReactNode;
}

export type GeniusAppBarVariant = 'solid' | 'transparent';
/** Barre supérieure : titre, action de tête optionnelle, actions de fin. Normalise AppBar. (Web: <header> (sticky, layer nav)) */
export interface GeniusAppBarProps {
  /** Titre affiché. */
  title: string;
  /** solid = fond surface + séparateur ; transparent = surimpression (dégradé sombre + contenu blanc) posée sur un feed plein écran. */
  variant?: GeniusAppBarVariant;
  /** Icône de tête (ex. retour, menu) — cliquable via onLeading. */
  leadingIcon?: string;
  /** Déclenché au clic sur l'icône de tête. */
  onLeading?: () => void;
  /** Actions de fin (boutons-icônes). */
  children?: ReactNode;
}

/** Barre de navigation par onglets (contient des GeniusNavItem). Normalise BottomAppBar / BottomNavigationBar / NavigationBar. (Web: <nav> (bas, layer nav)) */
export interface GeniusBottomNavigationProps {
  /** Les onglets (GeniusNavItem). */
  children?: ReactNode;
}

/** Un onglet de GeniusBottomNavigation : icône + libellé, état actif, tap. (Web: <button aria-current>) */
export interface GeniusNavItemProps {
  /** Nom d'icône (registre GeniusIcon). */
  icon: string;
  /** Libellé de l'onglet. */
  label: string;
  /** Onglet sélectionné (coloré en primaire). */
  active?: boolean;
  /** Déclenché au tap sur l'onglet. */
  onPress?: () => void;
}

