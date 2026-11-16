export type ViewModeId =
  | 'overview'
  | 'layers'
  | 'cross_section'
  | 'neurovascular'
  | 'microanatomy';

export type CameraPresetId =
  | 'iso'
  | 'front'
  | 'side'
  | 'top'
  | 'bottom';

export type AnatomyCategoryId =
  | 'surface'
  | 'epidermis'
  | 'dermis'
  | 'hypodermis'
  | 'hair_apparatus'
  | 'sweat_glands'
  | 'vascular'
  | 'innervation';

export type AnatomyStructureId =
  | 'skin_surface'
  | 'vellus_hairs'
  | 'stratum_corneum'
  | 'stratum_granulosum'
  | 'stratum_spinosum'
  | 'stratum_basale'
  | 'papillary_dermis'
  | 'reticular_dermis'
  | 'collagen_elastin'
  | 'adipose_lobules'
  | 'fibrous_septa'
  | 'hair_shaft'
  | 'follicle_sheaths'
  | 'hair_bulb'
  | 'hair_papilla'
  | 'sebaceous_gland'
  | 'arrector_pili'
  | 'sweat_secretory'
  | 'sweat_duct'
  | 'arteries'
  | 'veins'
  | 'capillary_loops'
  | 'nerve_trunks'
  | 'meissner_corpuscle'
  | 'pacinian_corpuscle'
  | 'merkel_complex'
  | 'free_nerve_endings'
  | 'follicular_nerves';

export interface AnatomyCategoryInfo {
  id: AnatomyCategoryId;
  name: string;
  latinName: string;
  color: string;
}

export interface AnatomyStructureInfo {
  id: AnatomyStructureId;
  categoryId: AnatomyCategoryId;
  name: string;
  latinName: string;
  color: string;
  summary: string;
  /** Order in progressive top-down layer peeling (0 = outermost, 8 = deepest; -1 = internal organ kept visible during matrix peel) */
  peelRank: number;
  /** Vertical displacement multiplier in exploded view */
  explodeOffsetY: number;
  /** Default 3D focus point [x, y, z] */
  focusTarget: [number, number, number];
  /** Camera offset relative to focusTarget when zooming to object */
  focusCameraOffset: [number, number, number];
  /** Optional 3D pin coordinate for callout labels */
  pinPosition?: [number, number, number];
}

export interface ViewModeInfo {
  id: ViewModeId;
  label: string;
  shortLabel: string;
}

export interface MicroTourPreset {
  id: string;
  title: string;
  subtitle: string;
  structureId: AnatomyStructureId;
  target: [number, number, number];
  cameraPos: [number, number, number];
  sliceConfig?: {
    xEnabled: boolean;
    xPos: number;
    yEnabled: boolean;
    yPos: number;
    zEnabled: boolean;
    zPos: number;
  };
  exploded?: number;
  dimMatrix?: boolean;
}

export const VIEW_MODES: ViewModeInfo[] = [
  {
    id: 'overview',
    label: 'Общий вид',
    shortLabel: 'Общий вид',
  },
  {
    id: 'layers',
    label: 'Слои кожи',
    shortLabel: 'Слои',
  },
  {
    id: 'cross_section',
    label: 'Анатомический разрез',
    shortLabel: 'Разрез',
  },
  {
    id: 'neurovascular',
    label: 'Сосуды и нервы',
    shortLabel: 'Сосуды и нервы',
  },
  {
    id: 'microanatomy',
    label: 'Микроанатомия',
    shortLabel: 'Микроанатомия',
  }
];

export const ANATOMY_CATEGORIES: AnatomyCategoryInfo[] = [
  {
    id: 'surface',
    name: 'Поверхность кожи',
    latinName: 'Superficies cutis',
    color: '#e5a985',
  },
  {
    id: 'epidermis',
    name: 'Эпидермис',
    latinName: 'Epidermis',
    color: '#d98876',
  },
  {
    id: 'dermis',
    name: 'Дерма (собственно кожа)',
    latinName: 'Dermis / Corium',
    color: '#e2767b',
  },
  {
    id: 'hypodermis',
    name: 'Гиподерма (подкожная клетчатка)',
    latinName: 'Tela subcutanea / Hypodermis',
    color: '#eab842',
  },
  {
    id: 'hair_apparatus',
    name: 'Волосяной (пилосебацейный) аппарат',
    latinName: 'Apparatus pilosebaceus',
    color: '#785038',
  },
  {
    id: 'sweat_glands',
    name: 'Потовые железы',
    latinName: 'Glandulae sudoriferae eccrinae',
    color: '#57a89a',
  },
  {
    id: 'vascular',
    name: 'Сосудистая система',
    latinName: 'Systema vasculare cutis',
    color: '#d63344',
  },
  {
    id: 'innervation',
    name: 'Иннервация и рецепторы',
    latinName: 'Innervatio et corpuscula sensoria',
    color: '#e6c245',
  }
];

export const ANATOMY_STRUCTURES: AnatomyStructureInfo[] = [
  // 1. SURFACE
  {
    id: 'skin_surface',
    categoryId: 'surface',
    name: 'Микрорельеф поверхности, борозды и поры',
    latinName: 'Sulci cutis, cristae cutis et pori',
    color: '#e3a582',
    summary:
      'Наружная поверхность кожи образует ромбовидную и треугольную сеть мелких кожных бороздок (sulci cutis) и полей, на пересечениях которых открываются воронкообразные устья фолликулов и микроскопические поры потовых желёз.',
    peelRank: 0,
    explodeOffsetY: 3.7,
    focusTarget: [0.4, 2.85, 0.4],
    focusCameraOffset: [3.2, 2.8, 3.6],
    pinPosition: [2.6, 2.88, 2.4]
  },
  {
    id: 'vellus_hairs',
    categoryId: 'surface',
    name: 'Пушковые волосы',
    latinName: 'Pili vellus',
    color: '#b58d6d',
    summary:
      'Тонкие, короткие, слабо пигментированные волоски без мозгового вещества (медуллы), покрывающие большую часть поверхности кожи человека.',
    peelRank: 0,
    explodeOffsetY: 3.9,
    focusTarget: [-1.8, 3.05, 1.9],
    focusCameraOffset: [2.4, 1.8, 2.8]
  },

  // 2. EPIDERMIS (4 strata in thin hairy skin — NO stratum lucidum)
  {
    id: 'stratum_corneum',
    categoryId: 'epidermis',
    name: 'Роговой слой эпидермиса',
    latinName: 'Stratum corneum',
    color: '#d99573',
    summary:
      'Самый поверхностный барьерный слой эпидермиса, состоящий из 12–20 рядов плотно упакованных безъядерных роговых чешуек — корнеоцитов, погружённых в ламеллярный церамидно-липидный матрикс.',
    peelRank: 1,
    explodeOffsetY: 3.2,
    focusTarget: [0.0, 2.72, 4.6],
    focusCameraOffset: [2.8, 1.2, 3.8],
    pinPosition: [-3.9, 2.75, 4.9]
  },
  {
    id: 'stratum_granulosum',
    categoryId: 'epidermis',
    name: 'Зернистый слой эпидермиса',
    latinName: 'Stratum granulosum',
    color: '#b46273',
    summary:
      'Тонкий переходный слой из 2–3 рядов уплощённых веретенообразных кератиноцитов, в которых завершается синтез водонепроницаемого липидного барьера и начинается терминальная кератинизация.',
    peelRank: 2,
    explodeOffsetY: 2.55,
    focusTarget: [0.0, 2.56, 4.6],
    focusCameraOffset: [2.6, 1.0, 3.6]
  },
  {
    id: 'stratum_spinosum',
    categoryId: 'epidermis',
    name: 'Шиповатый слой эпидермиса',
    latinName: 'Stratum spinosum',
    color: '#d87d83',
    summary:
      'Самый объёмный живой слой эпидермиса (4–8 рядов), сложенный полигональными кератиноцитами с многочисленными цитоплазматическими отростками («шипами»), прочно скреплёнными десмосомами.',
    peelRank: 3,
    explodeOffsetY: 1.9,
    focusTarget: [0.0, 2.25, 4.6],
    focusCameraOffset: [2.8, 1.0, 3.8],
    pinPosition: [4.85, 2.25, 2.5]
  },
  {
    id: 'stratum_basale',
    categoryId: 'epidermis',
    name: 'Базальный слой и базальная мембрана',
    latinName: 'Stratum basale et membrana basalis',
    color: '#a34e68',
    summary:
      'Один ряд цилиндрических и кубических стволовых и пролиферирующих кератиноцитов, лежащих на волнистой базальной мембране вдоль границы эпидермальных гребней и дермальных сосочков.',
    peelRank: 4,
    explodeOffsetY: 1.3,
    focusTarget: [0.0, 1.88, 4.6],
    focusCameraOffset: [2.7, 0.9, 3.6]
  },

  // 3. DERMIS
  {
    id: 'papillary_dermis',
    categoryId: 'dermis',
    name: 'Сосочковый слой дермы',
    latinName: 'Stratum papillare dermis',
    color: '#eb8f90',
    summary:
      'Верхний слой рыхлой волокнистой неоформленной соединительной ткани, образующий пальцевидные выступы — дермальные сосочки (papillae dermales), вдающиеся в эпидермис между эпидермальными гребнями.',
    peelRank: 5,
    explodeOffsetY: 0.65,
    focusTarget: [1.2, 1.45, 4.5],
    focusCameraOffset: [3.2, 1.2, 4.2],
    pinPosition: [-4.85, 1.52, -1.2]
  },
  {
    id: 'reticular_dermis',
    categoryId: 'dermis',
    name: 'Сетчатый слой дермы',
    latinName: 'Stratum reticulare dermis',
    color: '#d96b70',
    summary:
      'Основной опорный слой кожи из плотной волокнистой неоформленной соединительной ткани, в котором залегают корни волос, сальные и потовые железы, сосудистые сплетения и нервные ветви.',
    peelRank: 6,
    explodeOffsetY: 0.0,
    focusTarget: [0.0, -0.7, 4.5],
    focusCameraOffset: [4.5, 1.6, 5.2],
    pinPosition: [4.85, -0.65, -1.8]
  },
  {
    id: 'collagen_elastin',
    categoryId: 'dermis',
    name: 'Сеть коллагеновых и эластических волокон',
    latinName: 'Fibrae collagenosae et elasticae',
    color: '#f0a69c',
    summary:
      'Трёхмерная переплетённая биомеханическая архитектура волнистых пучков коллагена I/III типов и ветвящихся золотистых эластических волокон, огибающих фолликулы, железы и сосуды.',
    peelRank: 6,
    explodeOffsetY: 0.05,
    focusTarget: [1.5, -0.5, 1.8],
    focusCameraOffset: [3.2, 1.4, 3.6]
  },

  // 4. HYPODERMIS
  {
    id: 'adipose_lobules',
    categoryId: 'hypodermis',
    name: 'Жировые дольки и адипоциты',
    latinName: 'Lobuli adiposi et adipocyti',
    color: '#eab842',
    summary:
      'Белая подкожная жировая ткань, организованная в объёмные дольки из плотно упакованных полиэдрически-округлых адипоцитов разного диаметра, оплетённых густой капиллярной сетью.',
    peelRank: 7,
    explodeOffsetY: -1.35,
    focusTarget: [0.0, -4.5, 3.5],
    focusCameraOffset: [4.5, 1.4, 5.2],
    pinPosition: [-4.7, -4.6, 2.8]
  },
  {
    id: 'fibrous_septa',
    categoryId: 'hypodermis',
    name: 'Соединительнотканные перегородки гиподермы',
    latinName: 'Retinacula cutis (septa interlobularia)',
    color: '#dfd0c3',
    summary:
      'Прочные коллагеново-эластические перегородки, разделяющие подкожную жировую клетчатку на отдельные дольки и связывающие сетчатый слой дермы с подлежащей поверхностной фасцией.',
    peelRank: 7,
    explodeOffsetY: -1.35,
    focusTarget: [-1.2, -4.6, 1.5],
    focusCameraOffset: [3.8, 1.2, 4.4]
  },

  // 5. HAIR APPARATUS
  {
    id: 'hair_shaft',
    categoryId: 'hair_apparatus',
    name: 'Волосяной стержень и корень волоса',
    latinName: 'Scapus et radix pili',
    color: '#4a3122',
    summary:
      'Ороговевшая нитевидная структура из твёрдого альфа-кератина: внутрикожная часть (корень волоса) залегает наклонно в фолликуле, а свободный стержень выходит через воронку устья над поверхностью кожи.',
    peelRank: -1,
    explodeOffsetY: 0.35,
    focusTarget: [-0.8, 1.9, -0.3],
    focusCameraOffset: [3.6, 2.4, 4.0],
    pinPosition: [-0.45, 4.35, 0.1]
  },
  {
    id: 'follicle_sheaths',
    categoryId: 'hair_apparatus',
    name: 'Влагалища волосяного фолликула',
    latinName: 'Vaginabuli epitheliales et dermalis radicis pili',
    color: '#d79e95',
    summary:
      'Концентрические эпителиальные (внутреннее и наружное корневые влагалища) и соединительнотканная сумка фолликула, формирующие направляющий канал и нишу стволовых клеток волоса.',
    peelRank: -1,
    explodeOffsetY: 0.15,
    focusTarget: [-0.95, -0.4, -0.45],
    focusCameraOffset: [2.8, 1.0, 3.2]
  },
  {
    id: 'hair_bulb',
    categoryId: 'hair_apparatus',
    name: 'Волосяная луковица (матрикс волоса)',
    latinName: 'Bulbus pili',
    color: '#9c5652',
    summary:
      'Грушевидное утолщение основания фолликула, клетки матрикса которого обладают одной из самых высоких скоростей митотического деления в организме человека.',
    peelRank: -1,
    explodeOffsetY: 0.0,
    focusTarget: [-1.22, -3.15, -0.72],
    focusCameraOffset: [2.5, 0.7, 2.9],
    pinPosition: [-1.25, -3.2, -0.72]
  },
  {
    id: 'hair_papilla',
    categoryId: 'hair_apparatus',
    name: 'Дермальный сосочек волоса',
    latinName: 'Papilla dermis pili',
    color: '#db5864',
    summary:
      'Специализированный васкуляризированный выступ рыхлой соединительной ткани, вдающийся снизу в дно волосяной луковицы и управляющий циклом жизни волоса.',
    peelRank: -1,
    explodeOffsetY: -0.05,
    focusTarget: [-1.25, -3.42, -0.75],
    focusCameraOffset: [2.0, 0.4, 2.3]
  },
  {
    id: 'sebaceous_gland',
    categoryId: 'hair_apparatus',
    name: 'Сальная железа',
    latinName: 'Glandula sebacea',
    color: '#ebd09e',
    summary:
      'Простая альвеолярная разветвлённая железа с многодольчатым гроздевидным строением и голокриновым типом секреции, короткий проток которой открывается в воронку волосяного фолликула.',
    peelRank: -1,
    explodeOffsetY: 0.2,
    focusTarget: [-0.35, 0.55, -0.15],
    focusCameraOffset: [2.4, 0.9, 2.7],
    pinPosition: [-0.25, 0.62, -0.1]
  },
  {
    id: 'arrector_pili',
    categoryId: 'hair_apparatus',
    name: 'Мышца, поднимающая волос',
    latinName: 'Musculus arrector pili',
    color: '#c95358',
    summary:
      'Косо идущий пучок гладких мышечных волокон, соединяющий область выступа (bulge) волосяного фолликула ниже сальной железы с сосочковым слоем дермы со стороны наклона волоса.',
    peelRank: -1,
    explodeOffsetY: 0.2,
    focusTarget: [0.15, 0.65, 0.15],
    focusCameraOffset: [2.6, 1.0, 2.9],
    pinPosition: [0.35, 0.85, 0.25]
  },

  // 6. SWEAT GLANDS
  {
    id: 'sweat_secretory',
    categoryId: 'sweat_glands',
    name: 'Извитой секреторный отдел эккринной потовой железы',
    latinName: 'Portio terminalis (glomerulus) glandulae sudoriferae',
    color: '#57a89a',
    summary:
      'Плотно свёрнутый в трёхмерный клубочек трубчатый концевой отдел мерокриновой (эккринной) потовой железы, залегающий на границе глубокой сетчатой дермы и гиподермы.',
    peelRank: -1,
    explodeOffsetY: -0.25,
    focusTarget: [2.55, -2.55, 2.15],
    focusCameraOffset: [2.6, 0.9, 2.9],
    pinPosition: [2.65, -2.55, 2.2]
  },
  {
    id: 'sweat_duct',
    categoryId: 'sweat_glands',
    name: 'Выводной проток и спиральный акросирингиум',
    latinName: 'Ductus sudoriferus et acrosyringium',
    color: '#6fc2b4',
    summary:
      'Тонкий двухслойный выводной проток поднимается сквозь дерму почти вертикально, а при входе в эпидермис переходит в характерный штопорообразный спиральный канал (акросирингиум), открывающийся порой на поверхности.',
    peelRank: -1,
    explodeOffsetY: 0.25,
    focusTarget: [2.55, 1.35, 2.15],
    focusCameraOffset: [2.4, 1.0, 2.8]
  },

  // 7. VASCULAR SYSTEM
  {
    id: 'arteries',
    categoryId: 'vascular',
    name: 'Артерии и артериолы кожных сплетений',
    latinName: 'Rete arteriosum profundum et subpapillare',
    color: '#dc2638',
    summary:
      'Двухъярусная артериальная система кожи: глубокое кожное сплетение на границе гиподермы и дермы и поверхностное подсосочковое сплетение под сосочковым слоем, соединённые восходящими артериолами.',
    peelRank: -1,
    explodeOffsetY: -0.1,
    focusTarget: [0.2, -2.5, 1.2],
    focusCameraOffset: [4.2, 1.6, 4.6],
    pinPosition: [2.1, -2.85, 3.8]
  },
  {
    id: 'veins',
    categoryId: 'vascular',
    name: 'Вены и венулы кожных сплетений',
    latinName: 'Plexus venosus subpapillaris et profundus',
    color: '#325bc7',
    summary:
      'Разветвлённая система посткапиллярных и собирательных венул подсосочкового яруса и более крупных отводящих вен глубокого сплетения, сопровождающих артериальные ветви.',
    peelRank: -1,
    explodeOffsetY: -0.1,
    focusTarget: [-0.4, -2.6, 1.4],
    focusCameraOffset: [4.2, 1.6, 4.6]
  },
  {
    id: 'capillary_loops',
    categoryId: 'vascular',
    name: 'Капиллярные петли дермальных сосочков',
    latinName: 'Ansae capillares papillares',
    color: '#e84a5f',
    summary:
      'Изящные шпилькообразные сосудистые петли, поднимающиеся от подсосочкового сплетения в каждый дермальный сосочек с переходом артериального колена в венозное на вершине сосочка.',
    peelRank: -1,
    explodeOffsetY: 0.65,
    focusTarget: [1.1, 1.58, 2.2],
    focusCameraOffset: [2.2, 0.8, 2.5]
  },

  // 8. INNERVATION & SENSORY RECEPTORS
  {
    id: 'nerve_trunks',
    categoryId: 'innervation',
    name: 'Кожные нервные стволы и сплетения',
    latinName: 'Nervi cutanei et plexus nervosus dermis',
    color: '#e8c448',
    summary:
      'Смешанные пучки миелиновых (Aβ, Aδ) и безмиелиновых (C) нервных волокон, вступающих в кожу через перегородки гиподермы и формирующих глубокое и подсосочковое нервные сплетения.',
    peelRank: -1,
    explodeOffsetY: -0.15,
    focusTarget: [-2.1, -2.8, 1.5],
    focusCameraOffset: [4.2, 1.5, 4.6]
  },
  {
    id: 'meissner_corpuscle',
    categoryId: 'innervation',
    name: 'Тактильные тельца Мейснера',
    latinName: 'Corpuscula tactus (Meissneri)',
    color: '#f2d36b',
    summary:
      'Быстро адаптирующиеся инкапсулированные механорецепторы эллипсоидной («шишковидной») формы, расположенные вертикально внутри дермальных сосочков непосредственно под базальной мембраной эпидермиса.',
    peelRank: -1,
    explodeOffsetY: 0.65,
    focusTarget: [-1.55, 1.56, 2.35],
    focusCameraOffset: [1.8, 0.6, 2.1],
    pinPosition: [-1.55, 1.62, 2.35]
  },
  {
    id: 'pacinian_corpuscle',
    categoryId: 'innervation',
    name: 'Пластинчатые тельца Пачини (Фатера — Пачини)',
    latinName: 'Corpuscula lamellosa (Vateri-Pacini)',
    color: '#d4e4ed',
    summary:
      'Крупные овоидные механорецепторы глубокого давления и высокочастотной вибрации, построенные из десятков вложенных друг в друга концентрических пластинок («луковица в разрезе») вокруг центрального осевого цилиндра.',
    peelRank: -1,
    explodeOffsetY: -1.1,
    focusTarget: [2.1, -3.85, -1.6],
    focusCameraOffset: [2.5, 0.8, 2.7],
    pinPosition: [2.1, -3.85, -1.6]
  },
  {
    id: 'merkel_complex',
    categoryId: 'innervation',
    name: 'Комплексы клеток и тактильных дисков Меркеля',
    latinName: 'Epitheliocyti tactiles et menisci tactus (Merkeli)',
    color: '#7cd4e8',
    summary:
      'Медленно адаптирующиеся механорецепторные комплексы I типа на дне эпидермальных гребней: специализированная овальная клетка Меркеля в базальном слое образует синапсоподобный контакт с чашевидным нервным диском.',
    peelRank: -1,
    explodeOffsetY: 1.25,
    focusTarget: [0.45, 1.75, 2.75],
    focusCameraOffset: [1.8, 0.5, 2.0]
  },
  {
    id: 'free_nerve_endings',
    categoryId: 'innervation',
    name: 'Свободные нервные окончания',
    latinName: 'Terminationes nervorum liberae',
    color: '#f5dc7a',
    summary:
      'Тонкие древовидно ветвящиеся безмиелиновые терминальные веточки Aδ- и C-волокон, поднимающиеся в сосочковый слой дермы и проникающие между живыми кератиноцитами вплоть до зернистого слоя эпидермиса.',
    peelRank: -1,
    explodeOffsetY: 1.0,
    focusTarget: [2.2, 1.95, 0.6],
    focusCameraOffset: [2.1, 0.7, 2.3]
  },
  {
    id: 'follicular_nerves',
    categoryId: 'innervation',
    name: 'Нервные окончания вокруг волосяных фолликулов',
    latinName: 'Plexus nervosus perifollicularis (lanceolatus)',
    color: '#f7ca44',
    summary:
      'Корзинчатое сплетение циркулярных и частоколообразных (ланцетовидных) чувствительных нервных окончаний, плотно охватывающих шейку волосяного фолликула чуть ниже устья сальной железы.',
    peelRank: -1,
    explodeOffsetY: 0.18,
    focusTarget: [-0.88, 0.05, -0.38],
    focusCameraOffset: [2.1, 0.6, 2.4]
  }
];

export const STRUCTURE_MAP: Record<AnatomyStructureId, AnatomyStructureInfo> =
  ANATOMY_STRUCTURES.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<AnatomyStructureId, AnatomyStructureInfo>
  );

export const MICRO_TOURS: MicroTourPreset[] = [
  {
    id: 'epidermal_strata',
    title: '4 слоя эпидермиса и гребни',
    subtitle: 'От роговых чешуек до базальной мембраны и сосочков',
    structureId: 'stratum_spinosum',
    target: [0.2, 2.15, 4.65],
    cameraPos: [2.3, 2.55, 7.65],
    exploded: 0.28,
    dimMatrix: false
  },
  {
    id: 'anagen_bulb',
    title: 'Луковица и сосочек волоса (Анаген)',
    subtitle: 'Внутреннее строение зоны роста фолликула в разрезе',
    structureId: 'hair_bulb',
    target: [-1.18, -2.95, -0.68],
    cameraPos: [1.65, -2.15, 2.15],
    sliceConfig: {
      xEnabled: true,
      xPos: -1.05,
      yEnabled: false,
      yPos: 4.5,
      zEnabled: true,
      zPos: -0.55
    },
    dimMatrix: true
  },
  {
    id: 'pilosebaceous_unit',
    title: 'Сальная железа и мышца волоса',
    subtitle: 'Трёхмерная связь фолликула, ацинусов и m. arrector pili',
    structureId: 'sebaceous_gland',
    target: [-0.25, 0.55, -0.1],
    cameraPos: [2.25, 1.45, 2.75],
    dimMatrix: true
  },
  {
    id: 'sweat_apparatus',
    title: 'Эккринная железа и спиральная пора',
    subtitle: 'Извитой клубочек, проток и штопорообразный акросирингиум',
    structureId: 'sweat_secretory',
    target: [2.55, -0.6, 2.15],
    cameraPos: [5.4, 0.35, 5.2],
    dimMatrix: true
  },
  {
    id: 'papilla_meissner',
    title: 'Дермальный сосочек: тельце Мейснера и петля',
    subtitle: 'Тактильный рецептор, капиллярная шпилька и диски Меркеля',
    structureId: 'meissner_corpuscle',
    target: [-1.2, 1.62, 2.45],
    cameraPos: [0.65, 2.25, 4.45],
    dimMatrix: true
  },
  {
    id: 'pacinian_section',
    title: 'Тельце Пачини в разрезе',
    subtitle: 'Концентрические пластинки и центральное нервное волокно',
    structureId: 'pacinian_corpuscle',
    target: [2.1, -3.85, -1.6],
    cameraPos: [4.35, -2.85, 0.85],
    sliceConfig: {
      xEnabled: false,
      xPos: 5.0,
      yEnabled: true,
      yPos: -3.82,
      zEnabled: false,
      zPos: 5.0
    },
    dimMatrix: true
  }
];
