import type { SectionContent } from './types';
import c_skelet from './ru/skelet';
import c_myshcy from './ru/myshcy';
import c_serdce from './ru/serdce';
import c_krovenosnaya_sistema from './ru/krovenosnaya-sistema';
import c_selezenka from './ru/selezenka';
import c_glaz from './ru/glaz';
import c_pechen from './ru/pechen';
import c_zheludok from './ru/zheludok';
import c_zub from './ru/zub';
import c_nos from './ru/nos';
import c_mochevoj_puzyr from './ru/mochevoj-puzyr';
import c_legkie from './ru/legkie';
import c_kishechnik from './ru/kishechnik';
import c_zhelchnyj_puzyr from './ru/zhelchnyj-puzyr';
import c_mozg from './ru/mozg';
import c_nervnaya_sistema from './ru/nervnaya-sistema';
import c_uho from './ru/uho';
import c_podzheludochnaya from './ru/podzheludochnaya';
import c_pochki from './ru/pochki';
import c_zhenskaya_reproduktivnaya from './ru/zhenskaya-reproduktivnaya';
import c_volosy_i_nogti from './ru/volosy-i-nogti';

/**
 * Весь контент разделов разом — только для пререндера HTML при сборке (scripts/prerender-meta.ts),
 * в бандл сайта не попадает. Новый раздел добавляется и сюда, и в loadSection.ts (это проверяет тест).
 */
export const ALL_SECTION_CONTENT: Record<string, SectionContent> = {
  'skelet': c_skelet,
  'myshcy': c_myshcy,
  'serdce': c_serdce,
  'krovenosnaya-sistema': c_krovenosnaya_sistema,
  'selezenka': c_selezenka,
  'glaz': c_glaz,
  'pechen': c_pechen,
  'zheludok': c_zheludok,
  'zub': c_zub,
  'nos': c_nos,
  'mochevoj-puzyr': c_mochevoj_puzyr,
  'legkie': c_legkie,
  'kishechnik': c_kishechnik,
  'zhelchnyj-puzyr': c_zhelchnyj_puzyr,
  'mozg': c_mozg,
  'nervnaya-sistema': c_nervnaya_sistema,
  'uho': c_uho,
  'podzheludochnaya': c_podzheludochnaya,
  'pochki': c_pochki,
  'zhenskaya-reproduktivnaya': c_zhenskaya_reproduktivnaya,
  'volosy-i-nogti': c_volosy_i_nogti,
};
