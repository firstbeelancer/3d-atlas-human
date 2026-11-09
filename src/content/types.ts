export type SystemId =
  | 'cells'
  | 'support'
  | 'overview'
  | 'nervous'
  | 'respiratory'
  | 'circulatory'
  | 'lymphatic'
  | 'digestive'
  | 'urinary'
  | 'skin'
  | 'reproductive'
  | 'endocrine';

export type OrganIconName =
  | 'cell'
  | 'skeleton'
  | 'muscle'
  | 'organs'
  | 'brain'
  | 'eye'
  | 'ear'
  | 'tooth'
  | 'lungs'
  | 'heart'
  | 'stomach'
  | 'liver'
  | 'pancreas'
  | 'spleen'
  | 'gallbladder'
  | 'kidneys'
  | 'bladder'
  | 'intestine'
  | 'uterus'
  | 'testis'
  | 'vessels'
  | 'hair'
  | 'pregnancy'
  | 'hormones';

/** Неязыковые поля раздела — общие для всех переводов. */
export interface SectionBase {
  slug: string;
  system: SystemId;
  icon: OrganIconName;
  ready: boolean;
  adultParts?: boolean;
}

/** Тексты раздела на конкретном языке. */
export interface SectionTexts {
  title: string;
  latin: string;
  tagline: string;
}

export type SectionMeta = SectionBase & SectionTexts;

export interface Stat {
  value: string;
  label: string;
}

export interface Part {
  id: string;
  name: string;
  latin?: string;
  text: string;
  adult?: boolean;
  /** Группа частей (id из SectionContent.groups) — для больших моделей вроде скелета. */
  group?: string;
}

/** Группа частей модели: заголовок в списке «Из чего состоит», по нажатию подсвечивает всю группу. */
export interface PartGroup {
  id: string;
  name: string;
}

export interface SectionContent {
  slug: string;
  stats: Stat[];
  does: string[];
  parts: Part[];
  groups?: PartGroup[];
  kidSay: string[];
  facts: string[];
  care: string[];
  related: string[];
}

export interface SystemMeta {
  id: SystemId;
  title: string;
}
