'use client';
/**
 * Icon shim: re-exports lucide-react icon names as Phosphor "duotone" icons.
 * Lets the whole app migrate to Phosphor without touching every import site —
 * files just import the same names from '@/lib/icons' instead of 'lucide-react'.
 * Phosphor icons are imported with a `Ph` prefix to avoid name collisions with
 * the lucide-compatible names we re-export.
 */
import type React from 'react';
import {
  House as PhHouse,
  MagnifyingGlass as PhMagnifyingGlass,
  ChatCircle as PhChatCircle,
  Storefront as PhStorefront,
  TrashSimple as PhTrashSimple,
  PencilSimple as PhPencilSimple,
  CircleNotch as PhCircleNotch,
  X as PhX,
  XCircle as PhXCircle,
  CheckCircle as PhCheckCircle,
  CaretDown as PhCaretDown,
  CaretLeft as PhCaretLeft,
  CaretRight as PhCaretRight,
  CaretUp as PhCaretUp,
  DotsThree as PhDotsThree,
  Lightning as PhLightning,
  Fire as PhFire,
  Sparkle as PhSparkle,
  MagicWand as PhMagicWand,
  GridFour as PhGridFour,
  Stack as PhStack,
  Cube as PhCube,
  Code as PhCode,
  CodeBlock as PhCodeBlock,
  Image as PhImage,
  ImageBroken as PhImageBroken,
  ImageSquare as PhImageSquare,
  TextT as PhTextT,
  ForkKnife as PhForkKnife,
  Car as PhCar,
  Bicycle as PhBicycle,
  Truck as PhTruck,
  NavigationArrow as PhNavigationArrow,
  MapPin as PhMapPin,
  SpeakerHigh as PhSpeakerHigh,
  SpeakerSlash as PhSpeakerSlash,
  Microphone as PhMicrophone,
  MicrophoneSlash as PhMicrophoneSlash,
  Phone as PhPhone,
  PhoneSlash as PhPhoneSlash,
  VideoCamera as PhVideoCamera,
  VideoCameraSlash as PhVideoCameraSlash,
  Disc as PhDisc,
  Playlist as PhPlaylist,
  MusicNote as PhMusicNote,
  MusicNotes as PhMusicNotes,
  Wallet as PhWallet,
  Coins as PhCoins,
  Money as PhMoney,
  CreditCard as PhCreditCard,
  Crown as PhCrown,
  Trophy as PhTrophy,
  Gift as PhGift,
  Ticket as PhTicket,
  Tag as PhTag,
  Rocket as PhRocket,
  Brain as PhBrain,
  Robot as PhRobot,
  AddressBook as PhAddressBook,
  Users as PhUsers,
  UserPlus as PhUserPlus,
  UserCheck as PhUserCheck,
  User as PhUser,
  Shield as PhShield,
  ShieldCheck as PhShieldCheck,
  ShieldWarning as PhShieldWarning,
  Lock as PhLock,
  LockOpen as PhLockOpen,
  SignOut as PhSignOut,
  Envelope as PhEnvelope,
  Flag as PhFlag,
  Info as PhInfo,
  Question as PhQuestion,
  Warning as PhWarning,
  Clock as PhClock,
  ClockCounterClockwise as PhClockCounterClockwise,
  CalendarCheck as PhCalendarCheck,
  ArrowsClockwise as PhArrowsClockwise,
  ArrowCounterClockwise as PhArrowCounterClockwise,
  DownloadSimple as PhDownloadSimple,
  UploadSimple as PhUploadSimple,
  ArrowSquareOut as PhArrowSquareOut,
  LinkSimple as PhLinkSimple,
  ShareNetwork as PhShareNetwork,
  PaperPlaneTilt as PhPaperPlaneTilt,
  Copy as PhCopy,
  Scissors as PhScissors,
  Scales as PhScales,
  Palette as PhPalette,
  Couch as PhCouch,
  Cookie as PhCookie,
  Package as PhPackage,
  DeviceMobile as PhDeviceMobile,
  Monitor as PhMonitor,
  Plug as PhPlug,
  Camera as PhCamera,
  CameraRotate as PhCameraRotate,
  FilmSlate as PhFilmSlate,
  ClosedCaptioning as PhClosedCaptioning,
  Play as PhPlay,
  Pause as PhPause,
  Eye as PhEye,
  Star as PhStar,
  Heart as PhHeart,
  BookmarkSimple as PhBookmarkSimple,
  BookOpen as PhBookOpen,
  GraduationCap as PhGraduationCap,
  FileText as PhFileText,
  ClipboardText as PhClipboardText,
  Megaphone as PhMegaphone,
  TrendUp as PhTrendUp,
  Circle as PhCircle,
  Square as PhSquare,
  Rectangle as PhRectangle,
  DotsSixVertical as PhDotsSixVertical,
  Minus as PhMinus,
  Plus as PhPlus,
  Check as PhCheck,
  Checks as PhChecks,
  Prohibit as PhProhibit,
  GlobeHemisphereWest as PhGlobeHemisphereWest,
  TShirt as PhTShirt,
  ArrowDownLeft as PhArrowDownLeft,
  ArrowLeft as PhArrowLeft,
  ArrowsLeftRight as PhArrowsLeftRight,
  ArrowUpRight as PhArrowUpRight,
  ShoppingBag as PhShoppingBag,
  ShoppingCart as PhShoppingCart,
  // Extra lucide names in use across the app (beyond the initial 134 list).
  WarningCircle as PhWarningCircle,
  Archive as PhArchive,
  File as PhFile,
  GameController as PhGameController,
  Link as PhLink,
  ArrowUUpRight as PhArrowUUpRight,
  ArrowUUpLeft as PhArrowUUpLeft,
  ArrowBendUpLeft as PhArrowBendUpLeft,
  PaperPlaneRight as PhPaperPlaneRight,
  Trash as PhTrash,
  WifiSlash as PhWifiSlash,
  Wrench as PhWrench,
  Briefcase as PhBriefcase,
} from '@phosphor-icons/react';

type IconP = {
  size?: number | string;
  className?: string;
  color?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
  [k: string]: unknown;
};

// Wrap a Phosphor icon so it renders in "duotone" weight and swallows the
// lucide-only `strokeWidth` prop (Phosphor uses `weight` instead).
const mk = (Ph: React.ComponentType<any>) => {
  const C = ({ strokeWidth, ...p }: IconP) => <Ph weight="duotone" {...p} />;
  C.displayName = (Ph as any).displayName || 'Icon';
  return C;
};

export const AlertTriangle = mk(PhWarning);
export const ArrowDownLeft = mk(PhArrowDownLeft);
export const ArrowLeft = mk(PhArrowLeft);
export const ArrowRightLeft = mk(PhArrowsLeftRight);
export const ArrowUpRight = mk(PhArrowUpRight);
export const Ban = mk(PhProhibit);
export const Banknote = mk(PhMoney);
export const Bike = mk(PhBicycle);
export const BookText = mk(PhBookOpen);
export const Bookmark = mk(PhBookmarkSimple);
export const Briefcase = mk(PhBriefcase);
export const Bot = mk(PhRobot);
export const Boxes = mk(PhCube);
export const Braces = mk(PhCodeBlock);
export const Brain = mk(PhBrain);
export const CalendarCheck = mk(PhCalendarCheck);
export const Camera = mk(PhCamera);
export const Captions = mk(PhClosedCaptioning);
export const Car = mk(PhCar);
export const Check = mk(PhCheck);
export const CheckCheck = mk(PhChecks);
export const CheckCircle2 = mk(PhCheckCircle);
export const ChevronDown = mk(PhCaretDown);
export const ChevronLeft = mk(PhCaretLeft);
export const ChevronRight = mk(PhCaretRight);
export const ChevronUp = mk(PhCaretUp);
export const Circle = mk(PhCircle);
export const ClipboardCheck = mk(PhClipboardText);
export const Clock = mk(PhClock);
export const Code2 = mk(PhCode);
export const Coins = mk(PhCoins);
export const Contact = mk(PhAddressBook);
export const Cookie = mk(PhCookie);
export const Copy = mk(PhCopy);
export const CreditCard = mk(PhCreditCard);
export const Crown = mk(PhCrown);
export const Delete = mk(PhTrashSimple);
export const Disc3 = mk(PhDisc);
export const Download = mk(PhDownloadSimple);
export const Edit3 = mk(PhPencilSimple);
export const ExternalLink = mk(PhArrowSquareOut);
export const Eye = mk(PhEye);
export const FileText = mk(PhFileText);
export const Film = mk(PhFilmSlate);
export const Flag = mk(PhFlag);
export const Flame = mk(PhFire);
export const Gift = mk(PhGift);
export const Globe = mk(PhGlobeHemisphereWest);
export const Shirt = mk(PhTShirt);
export const GraduationCap = mk(PhGraduationCap);
export const Grid3x3 = mk(PhGridFour);
export const GripVertical = mk(PhDotsSixVertical);
export const Heart = mk(PhHeart);
export const HelpCircle = mk(PhQuestion);
export const History = mk(PhClockCounterClockwise);
export const Home = mk(PhHouse);
export const ImageIcon = mk(PhImage);
export const ImageOff = mk(PhImageBroken);
export const ImagePlus = mk(PhImageSquare);
export const Info = mk(PhInfo);
export const Layers = mk(PhStack);
export const LayoutGrid = mk(PhGridFour);
export const Link2 = mk(PhLinkSimple);
export const ListMusic = mk(PhPlaylist);
export const Loader2 = mk(PhCircleNotch);
export const Lock = mk(PhLock);
export const LogOut = mk(PhSignOut);
export const Mail = mk(PhEnvelope);
export const MapPin = mk(PhMapPin);
export const Megaphone = mk(PhMegaphone);
export const MessageCircle = mk(PhChatCircle);
export const MessageSquare = mk(PhChatCircle);
export const Mic = mk(PhMicrophone);
export const MicOff = mk(PhMicrophoneSlash);
export const Minus = mk(PhMinus);
export const Monitor = mk(PhMonitor);
export const MoreHorizontal = mk(PhDotsThree);
export const Music = mk(PhMusicNote);
export const Music2 = mk(PhMusicNotes);
export const Navigation = mk(PhNavigationArrow);
export const Package = mk(PhPackage);
export const Palette = mk(PhPalette);
export const Pause = mk(PhPause);
export const Pencil = mk(PhPencilSimple);
export const Phone = mk(PhPhone);
export const PhoneOff = mk(PhPhoneSlash);
export const Play = mk(PhPlay);
export const Plug = mk(PhPlug);
export const Plus = mk(PhPlus);
export const RectangleHorizontal = mk(PhRectangle);
export const RefreshCcw = mk(PhArrowsClockwise);
export const RefreshCw = mk(PhArrowsClockwise);
export const Rocket = mk(PhRocket);
export const RotateCcw = mk(PhArrowCounterClockwise);
export const Scale = mk(PhScales);
export const Scissors = mk(PhScissors);
export const Search = mk(PhMagnifyingGlass);
export const Send = mk(PhPaperPlaneTilt);
export const Share = mk(PhShareNetwork);
export const Share2 = mk(PhShareNetwork);
export const Shield = mk(PhShield);
export const ShieldAlert = mk(PhShieldWarning);
export const ShieldCheck = mk(PhShieldCheck);
export const ShoppingBag = mk(PhShoppingBag);
export const ShoppingCart = mk(PhShoppingCart);
export const Smartphone = mk(PhDeviceMobile);
export const Sofa = mk(PhCouch);
export const Sparkles = mk(PhSparkle);
export const Square = mk(PhSquare);
export const Squircle = mk(PhSquare);
export const Star = mk(PhStar);
export const Store = mk(PhStorefront);
export const SwitchCamera = mk(PhCameraRotate);
export const Tag = mk(PhTag);
export const Ticket = mk(PhTicket);
export const TrendingUp = mk(PhTrendUp);
export const Trophy = mk(PhTrophy);
export const Truck = mk(PhTruck);
export const Type = mk(PhTextT);
export const Unlock = mk(PhLockOpen);
export const Upload = mk(PhUploadSimple);
export const User = mk(PhUser);
export const UserCheck = mk(PhUserCheck);
export const UserPlus = mk(PhUserPlus);
export const Users = mk(PhUsers);
export const Users2 = mk(PhUsers);
export const UtensilsCrossed = mk(PhForkKnife);
export const Video = mk(PhVideoCamera);
export const VideoOff = mk(PhVideoCameraSlash);
export const Volume2 = mk(PhSpeakerHigh);
export const VolumeX = mk(PhSpeakerSlash);
export const Wallet = mk(PhWallet);
export const Wand2 = mk(PhMagicWand);
export const Wrench = mk(PhWrench);
export const X = mk(PhX);
export const XCircle = mk(PhXCircle);
export const Zap = mk(PhLightning);

// Extra lucide names in use across the app (beyond the initial 134 list).
export const AlertCircle = mk(PhWarningCircle);
export const Archive = mk(PhArchive);
export const File = mk(PhFile);
export const Gamepad2 = mk(PhGameController);
export const Image = mk(PhImage);
export const Link = mk(PhLink);
export const Redo2 = mk(PhArrowUUpRight);
export const Reply = mk(PhArrowBendUpLeft);
export const SendHorizontal = mk(PhPaperPlaneRight);
export const StarOff = mk(PhStar);
export const Trash2 = mk(PhTrash);
export const Undo2 = mk(PhArrowUUpLeft);
export const WifiOff = mk(PhWifiSlash);
