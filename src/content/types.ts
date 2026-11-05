export type SystemId =
  | 'cells'
  | 'support'
  | 'overview'
  | 'nervous'
  | 'respiratory'
  | 'circulatory'
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
}

export interface SectionContent {
  slug: string;
  stats: Stat[];
  does: string[];
  parts: Part[];
  kidSay: string[];
  facts: string[];
  care: string[];
  related: string[];
}

export interface SystemMeta {
  id: SystemId;
  title: string;
}
