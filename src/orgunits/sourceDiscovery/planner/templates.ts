/**
 * WW E-SD - THE REVIEWED QUERY-TEMPLATE TABLE (directive A2).
 *
 * One template per (language, slug). Every language carries the same twenty
 * slugs, so each language covers every segment, organisation kind and
 * distribution signal (asserted by the unit test) - but the TEXT is phrased
 * the way people search in that language, not translated word by word:
 * "taalcafé", "Sprachtandem", "aperitivo linguistico", "言語交換 交流会",
 * "café des langues", "intercâmbio de idiomas".
 *
 * `{place}` is replaced by the geography's CLDR display name in the query's
 * language (placeNames.ts). That is query localisation and nothing else.
 *
 * SOURCE (cited). Authored for this package on 2026-10-27 from the directive
 * A2 dimension list and the phrasing of the reviewed v1 brief
 * (brief.ts, NWF_DISCOVERY_BRIEF_V1). Native-speaker review of the non-English
 * rows is OPEN (ADR 0028 s7). Changing one character is a new
 * QUERY_TEMPLATE_TABLE_VERSION and a new digest for every affected plan.
 *
 * PURE. No socket, no database, no filesystem, no environment, no clock.
 */
import type { DiscoveryOrgKind, DiscoverySegment, DiscoverySignal } from './vocabulary.js';

export const QUERY_TEMPLATE_TABLE_VERSION = 'nwf-discovery-query-templates-v1';

/** The languages that have templates. A geography's other languages fall back to English. */
export const QUERY_TEMPLATE_LANGUAGES = ['en', 'fr', 'es', 'nl', 'ja', 'de', 'it', 'pt'] as const;
export type QueryTemplateLanguage = (typeof QUERY_TEMPLATE_LANGUAGES)[number];

export interface TemplateSlot {
  readonly slug: string;
  readonly segment: DiscoverySegment;
  readonly orgKind: DiscoveryOrgKind;
  readonly signal: DiscoverySignal;
}

/**
 * The twenty slots, in the order a plan visits them. The order interleaves
 * segments, kinds and signals so the first page of any plan is already mixed;
 * it is a visiting order, never a preference.
 */
export const TEMPLATE_SLOTS: readonly TemplateSlot[] = Object.freeze([
  {
    slug: 'exchange-welcome',
    segment: 'EXCHANGE_STUDENTS',
    orgKind: 'EXCHANGE_STUDENT_ASSOCIATION',
    signal: 'EVENTS_WELCOME_WEEK',
  },
  {
    slug: 'language-exchange',
    segment: 'LOCAL_LANGUAGE_LEARNERS',
    orgKind: 'LANGUAGE_SOCIETY',
    signal: 'EVENTS_WELCOME_WEEK',
  },
  {
    slug: 'student-assoc-directory',
    segment: 'STUDENT_ASSOCIATION_DIRECTORIES',
    orgKind: 'NETWORK_DIRECTORY',
    signal: 'DIRECTORY_LISTING',
  },
  {
    slug: 'intl-student-assoc',
    segment: 'INTERNATIONAL_STUDENTS',
    orgKind: 'INTERNATIONAL_STUDENT_ASSOCIATION',
    signal: 'MEMBER_GROUP',
  },
  {
    slug: 'community-classes',
    segment: 'LOCAL_LANGUAGE_LEARNERS',
    orgKind: 'COMMUNITY_LANGUAGE_ORGANISATION',
    signal: 'RESOURCE_PAGE',
  },
  {
    slug: 'language-cafe',
    segment: 'SMALL_LOCAL_GROUPS',
    orgKind: 'LANGUAGE_SOCIETY',
    signal: 'EVENTS_WELCOME_WEEK',
  },
  {
    slug: 'intl-student-guide',
    segment: 'INTERNATIONAL_STUDENT_GUIDES',
    orgKind: 'INTERNATIONAL_OFFICE',
    signal: 'RESOURCE_PAGE',
  },
  {
    slug: 'buddy-programme',
    segment: 'BUDDY_NETWORKS',
    orgKind: 'BUDDY_PROGRAMME',
    signal: 'MEMBER_GROUP',
  },
  {
    slug: 'cultural-association',
    segment: 'LANGUAGE_CULTURAL_GROUPS',
    orgKind: 'CULTURAL_ASSOCIATION',
    signal: 'EVENTS_WELCOME_WEEK',
  },
  {
    slug: 'volunteer-tutoring',
    segment: 'INDEPENDENT_COMMUNITY_NETWORKS',
    orgKind: 'COMMUNITY_LANGUAGE_ORGANISATION',
    signal: 'MEMBER_GROUP',
  },
  {
    slug: 'learner-club-newsletter',
    segment: 'TARGET_LEARNER_COMMUNITIES',
    orgKind: 'LANGUAGE_SOCIETY',
    signal: 'NEWSLETTER',
  },
  {
    slug: 'community-group-directory',
    segment: 'INDEPENDENT_COMMUNITY_NETWORKS',
    orgKind: 'NETWORK_DIRECTORY',
    signal: 'DIRECTORY_LISTING',
  },
  {
    slug: 'exchange-student-guide',
    segment: 'EXCHANGE_STUDENTS',
    orgKind: 'INTERNATIONAL_OFFICE',
    signal: 'RESOURCE_PAGE',
  },
  {
    slug: 'conversation-circle',
    segment: 'SMALL_LOCAL_GROUPS',
    orgKind: 'CULTURAL_ASSOCIATION',
    signal: 'MEMBER_GROUP',
  },
  {
    slug: 'language-centre-resources',
    segment: 'TARGET_LEARNER_COMMUNITIES',
    orgKind: 'LANGUAGE_CENTRE',
    signal: 'RESOURCE_PAGE',
  },
  {
    slug: 'intl-office-newsletter',
    segment: 'INTERNATIONAL_STUDENTS',
    orgKind: 'INTERNATIONAL_OFFICE',
    signal: 'NEWSLETTER',
  },
  {
    slug: 'language-centre-events',
    segment: 'LOCAL_LANGUAGE_LEARNERS',
    orgKind: 'LANGUAGE_CENTRE',
    signal: 'EVENTS_WELCOME_WEEK',
  },
  {
    slug: 'newcomer-network-newsletter',
    segment: 'TARGET_LEARNER_COMMUNITIES',
    orgKind: 'COMMUNITY_LANGUAGE_ORGANISATION',
    signal: 'NEWSLETTER',
  },
  {
    slug: 'culture-society-newsletter',
    segment: 'LANGUAGE_CULTURAL_GROUPS',
    orgKind: 'CULTURAL_ASSOCIATION',
    signal: 'NEWSLETTER',
  },
  {
    slug: 'student-guide-directory',
    segment: 'INTERNATIONAL_STUDENT_GUIDES',
    orgKind: 'NETWORK_DIRECTORY',
    signal: 'DIRECTORY_LISTING',
  },
] as const satisfies readonly TemplateSlot[]);

type Texts = Readonly<Record<string, string>>;

/** Text per slug, per language. `{place}` appears exactly once in every text. */
export const QUERY_TEMPLATES: Readonly<Record<QueryTemplateLanguage, Texts>> = Object.freeze({
  en: {
    'exchange-welcome': 'exchange student association welcome week {place}',
    'language-exchange': 'language exchange meetup {place}',
    'student-assoc-directory': 'list of student associations and societies {place}',
    'intl-student-assoc': 'international student association {place} become a member',
    'community-classes': 'community language classes for adults {place}',
    'language-cafe': 'language café conversation evening {place}',
    'intl-student-guide': 'practical guide for international students {place}',
    'buddy-programme': 'buddy programme for international students {place}',
    'cultural-association': 'cultural association language courses and events {place}',
    'volunteer-tutoring': 'volunteer language tutors network {place}',
    'learner-club-newsletter': 'language learners club newsletter {place}',
    'community-group-directory': 'directory of language and culture groups {place}',
    'exchange-student-guide': 'guide for incoming exchange students {place}',
    'conversation-circle': 'small conversation circle for language learners {place}',
    'language-centre-resources': 'language centre self-study resources {place}',
    'intl-office-newsletter': 'international office newsletter for incoming students {place}',
    'language-centre-events': 'language centre open day and events {place}',
    'newcomer-network-newsletter': 'newcomers network newsletter language learning {place}',
    'culture-society-newsletter': 'language and culture society newsletter {place}',
    'student-guide-directory': 'directory of guides for international students {place}',
  },
  fr: {
    'exchange-welcome': "association étudiants Erasmus semaine d'accueil {place}",
    'language-exchange': 'tandem linguistique rencontres {place}',
    'student-assoc-directory': 'annuaire des associations étudiantes {place}',
    'intl-student-assoc': 'association des étudiants internationaux {place} adhésion',
    'community-classes': 'cours de langues associatifs pour adultes {place}',
    'language-cafe': 'café des langues soirée conversation {place}',
    'intl-student-guide': 'guide pratique étudiants internationaux {place}',
    'buddy-programme': 'programme de parrainage étudiants internationaux {place}',
    'cultural-association': 'association culturelle cours de langue et événements {place}',
    'volunteer-tutoring': 'réseau de bénévoles soutien linguistique {place}',
    'learner-club-newsletter': "lettre d'information club de langues {place}",
    'community-group-directory': 'annuaire des associations langue et culture {place}',
    'exchange-student-guide': "guide d'accueil étudiants en échange {place}",
    'conversation-circle': 'petit groupe de conversation en langues étrangères {place}',
    'language-centre-resources': 'centre de langues ressources en autoformation {place}',
    'intl-office-newsletter': 'newsletter relations internationales étudiants entrants {place}',
    'language-centre-events': 'centre de langues journée portes ouvertes {place}',
    'newcomer-network-newsletter':
      "réseau d'accueil des nouveaux arrivants lettre d'information {place}",
    'culture-society-newsletter': 'bulletin association culturelle langues {place}',
    'student-guide-directory': 'répertoire des guides pour étudiants étrangers {place}',
  },
  es: {
    'exchange-welcome': 'asociación de estudiantes Erasmus semana de bienvenida {place}',
    'language-exchange': 'intercambio de idiomas encuentros {place}',
    'student-assoc-directory': 'directorio de asociaciones estudiantiles {place}',
    'intl-student-assoc': 'asociación de estudiantes internacionales {place} hazte socio',
    'community-classes': 'clases de idiomas comunitarias para adultos {place}',
    'language-cafe': 'café de idiomas noche de conversación {place}',
    'intl-student-guide': 'guía práctica para estudiantes internacionales {place}',
    'buddy-programme': 'programa de mentores para estudiantes internacionales {place}',
    'cultural-association': 'asociación cultural cursos de idiomas y actividades {place}',
    'volunteer-tutoring': 'red de voluntarios para enseñar idiomas {place}',
    'learner-club-newsletter': 'boletín club de idiomas {place}',
    'community-group-directory': 'directorio de grupos de idiomas y cultura {place}',
    'exchange-student-guide': 'guía para estudiantes de intercambio {place}',
    'conversation-circle': 'grupo pequeño de conversación en idiomas {place}',
    'language-centre-resources': 'centro de idiomas recursos de autoaprendizaje {place}',
    'intl-office-newsletter': 'boletín oficina de relaciones internacionales estudiantes {place}',
    'language-centre-events': 'centro de idiomas jornada de puertas abiertas {place}',
    'newcomer-network-newsletter': 'red de recién llegados boletín aprender idiomas {place}',
    'culture-society-newsletter': 'boletín asociación de lengua y cultura {place}',
    'student-guide-directory': 'directorio de guías para estudiantes extranjeros {place}',
  },
  nl: {
    'exchange-welcome': 'vereniging uitwisselingsstudenten introductieweek {place}',
    'language-exchange': 'taaluitwisseling meetup {place}',
    'student-assoc-directory': 'overzicht studentenverenigingen {place}',
    'intl-student-assoc': 'internationale studentenvereniging {place} lid worden',
    'community-classes': 'taallessen in de buurt voor volwassenen {place}',
    'language-cafe': 'taalcafé gespreksavond {place}',
    'intl-student-guide': 'praktische gids voor internationale studenten {place}',
    'buddy-programme': 'buddyprogramma internationale studenten {place}',
    'cultural-association': 'culturele vereniging taalcursus en activiteiten {place}',
    'volunteer-tutoring': 'taalmaatjes vrijwilligers netwerk {place}',
    'learner-club-newsletter': 'nieuwsbrief taalclub {place}',
    'community-group-directory': 'overzicht taal- en cultuurgroepen {place}',
    'exchange-student-guide': 'wegwijzer voor uitwisselingsstudenten {place}',
    'conversation-circle': 'kleine conversatiegroep taal oefenen {place}',
    'language-centre-resources': 'talencentrum zelfstudie materiaal {place}',
    'intl-office-newsletter': 'nieuwsbrief international office inkomende studenten {place}',
    'language-centre-events': 'talencentrum open dag activiteiten {place}',
    'newcomer-network-newsletter': 'nieuwsbrief netwerk nieuwkomers taal leren {place}',
    'culture-society-newsletter': 'nieuwsbrief taal- en cultuurvereniging {place}',
    'student-guide-directory': 'overzicht gidsen voor internationale studenten {place}',
  },
  ja: {
    'exchange-welcome': '交換留学生 歓迎会 学生団体 {place}',
    'language-exchange': '言語交換 交流会 {place}',
    'student-assoc-directory': '学生団体 一覧 {place}',
    'intl-student-assoc': '留学生会 学生団体 {place} 会員募集',
    'community-classes': '地域 語学教室 社会人 {place}',
    'language-cafe': '語学カフェ 交流イベント {place}',
    'intl-student-guide': '留学生 生活ガイド {place}',
    'buddy-programme': '留学生 チューター バディ制度 {place}',
    'cultural-association': '国際交流協会 語学講座 イベント {place}',
    'volunteer-tutoring': '日本語ボランティア ネットワーク {place}',
    'learner-club-newsletter': '語学サークル ニュースレター {place}',
    'community-group-directory': '多文化共生 団体 一覧 {place}',
    'exchange-student-guide': '交換留学生 受け入れ ガイド {place}',
    'conversation-circle': '少人数 外国語 会話サークル {place}',
    'language-centre-resources': '語学センター 自習 教材 {place}',
    'intl-office-newsletter': '国際交流センター ニュースレター 留学生 {place}',
    'language-centre-events': '語学センター イベント 説明会 {place}',
    'newcomer-network-newsletter': '外国人住民 ネットワーク メールマガジン {place}',
    'culture-society-newsletter': '国際文化交流 団体 会報 {place}',
    'student-guide-directory': '留学生向け ガイド 一覧 {place}',
  },
  de: {
    'exchange-welcome': 'Erasmus Studierendenverein Einführungswoche {place}',
    'language-exchange': 'Sprachtandem Treffen {place}',
    'student-assoc-directory': 'Liste der Studierendenvereine {place}',
    'intl-student-assoc': 'internationaler Studierendenverein {place} Mitglied werden',
    'community-classes': 'Sprachkurse im Stadtteil für Erwachsene {place}',
    'language-cafe': 'Sprachcafé Stammtisch {place}',
    'intl-student-guide': 'Leitfaden für internationale Studierende {place}',
    'buddy-programme': 'Buddy-Programm internationale Studierende {place}',
    'cultural-association': 'Kulturverein Sprachkurse und Veranstaltungen {place}',
    'volunteer-tutoring': 'ehrenamtliche Sprachpaten Netzwerk {place}',
    'learner-club-newsletter': 'Newsletter Sprachclub {place}',
    'community-group-directory': 'Verzeichnis Sprach- und Kulturvereine {place}',
    'exchange-student-guide': 'Infos für Austauschstudierende {place}',
    'conversation-circle': 'kleine Gesprächsrunde Fremdsprachen {place}',
    'language-centre-resources': 'Sprachenzentrum Selbstlernmaterialien {place}',
    'intl-office-newsletter': 'Newsletter International Office internationale Studierende {place}',
    'language-centre-events': 'Sprachenzentrum Veranstaltungen Infotag {place}',
    'newcomer-network-newsletter': 'Netzwerk für Neuzugewanderte Newsletter Sprache lernen {place}',
    'culture-society-newsletter': 'Newsletter Verein für Sprache und Kultur {place}',
    'student-guide-directory': 'Wegweiser für internationale Studierende Übersicht {place}',
  },
  it: {
    'exchange-welcome': 'associazione studenti Erasmus settimana di accoglienza {place}',
    'language-exchange': 'tandem linguistico incontri {place}',
    'student-assoc-directory': 'elenco associazioni studentesche {place}',
    'intl-student-assoc': 'associazione studenti internazionali {place} iscriviti',
    'community-classes': 'corsi di lingua di quartiere per adulti {place}',
    'language-cafe': 'aperitivo linguistico conversazione {place}',
    'intl-student-guide': 'guida pratica per studenti internazionali {place}',
    'buddy-programme': 'programma buddy studenti internazionali {place}',
    'cultural-association': 'associazione culturale corsi di lingua ed eventi {place}',
    'volunteer-tutoring': 'rete di volontari insegnamento lingue {place}',
    'learner-club-newsletter': 'newsletter club di lingue {place}',
    'community-group-directory': 'elenco gruppi di lingua e cultura {place}',
    'exchange-student-guide': 'guida per studenti in scambio {place}',
    'conversation-circle': 'piccolo gruppo di conversazione lingue straniere {place}',
    'language-centre-resources': 'centro linguistico materiali di autoapprendimento {place}',
    'intl-office-newsletter':
      'newsletter ufficio relazioni internazionali studenti in arrivo {place}',
    'language-centre-events': 'centro linguistico open day eventi {place}',
    'newcomer-network-newsletter': 'rete di accoglienza nuovi arrivati newsletter lingua {place}',
    'culture-society-newsletter': 'newsletter associazione di lingua e cultura {place}',
    'student-guide-directory': 'elenco guide per studenti stranieri {place}',
  },
  pt: {
    'exchange-welcome': 'associação de estudantes Erasmus semana de acolhimento {place}',
    'language-exchange': 'intercâmbio de idiomas encontros {place}',
    'student-assoc-directory': 'lista de associações de estudantes {place}',
    'intl-student-assoc': 'associação de estudantes internacionais {place} associe-se',
    'community-classes': 'aulas de idiomas comunitárias para adultos {place}',
    'language-cafe': 'café de idiomas noite de conversação {place}',
    'intl-student-guide': 'guia prático para estudantes internacionais {place}',
    'buddy-programme': 'programa de apadrinhamento estudantes internacionais {place}',
    'cultural-association': 'associação cultural cursos de línguas e eventos {place}',
    'volunteer-tutoring': 'rede de voluntários ensino de línguas {place}',
    'learner-club-newsletter': 'boletim clube de idiomas {place}',
    'community-group-directory': 'diretório de grupos de língua e cultura {place}',
    'exchange-student-guide': 'guia para estudantes de intercâmbio {place}',
    'conversation-circle': 'pequeno grupo de conversação em línguas {place}',
    'language-centre-resources': 'centro de línguas recursos de autoaprendizagem {place}',
    'intl-office-newsletter': 'boletim relações internacionais estudantes estrangeiros {place}',
    'language-centre-events': 'centro de línguas dia aberto eventos {place}',
    'newcomer-network-newsletter': 'rede de recém-chegados boletim aprender idiomas {place}',
    'culture-society-newsletter': 'boletim associação de língua e cultura {place}',
    'student-guide-directory': 'diretório de guias para estudantes estrangeiros {place}',
  },
});
