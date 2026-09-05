// @genius-ui/web — point d'entrée public. Les composants + les types générés depuis la spec.
// Le CSS s'importe séparément (dans cet ordre) :
//   import '@genius-ui/web/src/generated/tokens.css';     // variables de tokens + layers
//   import '@genius-ui/web/src/generated/responsive.css';  // politique responsive (breakpoints)
//   import '@genius-ui/web/src/genius-ui.css';             // états interactifs (hover/focus/variants)
export { GeniusScaffold } from './components/Scaffold';
export { GeniusColumn } from './components/Column';
export { GeniusRow } from './components/Row';
export { GeniusStack } from './components/Stack';
export { GeniusText } from './components/Text';
export { GeniusCard } from './components/Card';
export { GeniusButton } from './components/Button';
export { GeniusInput } from './components/Input';
export { GeniusSwitch } from './components/Switch';
export { GeniusBox } from './components/Box';
export { GeniusIcon } from './components/Icon';
export { GeniusExpanded } from './components/Expanded';
export { GeniusCenter } from './components/Center';
export { GeniusSpacer } from './components/Spacer';
export { GeniusDivider } from './components/Divider';
export { GeniusAvatar } from './components/Avatar';
export { GeniusImage } from './components/Image';
export { GeniusListTile } from './components/ListTile';
export { GeniusWrap } from './components/Wrap';
export { GeniusAspectRatio } from './components/AspectRatio';
export { GeniusIconButton } from './components/IconButton';
export { GeniusPressable } from './components/Pressable';
export { GeniusFab } from './components/Fab';
export { GeniusList } from './components/List';
export { GeniusGrid } from './components/Grid';
export { GeniusScroll } from './components/Scroll';
export { GeniusSpinner } from './components/Spinner';
export { GeniusProgress } from './components/Progress';
export { GeniusSnackbar } from './components/Snackbar';
export { GeniusDialog } from './components/Dialog';
export { GeniusBottomSheet } from './components/BottomSheet';
export { GeniusAppBar } from './components/AppBar';
export { GeniusBottomNavigation } from './components/BottomNavigation';
export { GeniusNavItem } from './components/NavItem';
export type * from './generated/types';
