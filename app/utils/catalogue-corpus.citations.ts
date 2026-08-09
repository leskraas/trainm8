/**
 * The **Citations** the corpus claims, one constant per source (#451).
 *
 * **A locator is populated only where the research verified it.**
 * `workouts-running.md` §14 says so in its own words: *"DOIs and page numbers
 * below were compiled from a combination of live verification and recall.
 * Helgerud 2007 …, Seiler 2013 … and the Canova/Bakken material were verified
 * in this pass; the remaining identifiers should be re-checked **before any of
 * them is surfaced in-product as a citation**."* The Catalogue surfaces
 * citations in-product, so that sentence is an instruction to this file: every
 * other source ships `locator: null` and keeps author + work + year, which is a
 * whole **Citation** under the schema's `CatalogueEntry_citation_whole` CHECK.
 *
 * A null locator here therefore means *"the identifier is not vouched for"*,
 * not *"this source has none"* — and re-verifying them is outstanding work, not
 * a gap in this corpus.
 */
import { type Citation } from './catalogue.ts'

// ——— Verified locators ————————————————————————————————————————————————

export const HELGERUD_2007: Citation = {
	author: 'Helgerud J, Høydal K, Wang E, Karlsen T, Berg P, Bjerkaas M, et al.',
	work: 'Aerobic high-intensity intervals improve V̇O2max more than moderate training. Med Sci Sports Exerc 39(4):665–671',
	year: 2007,
	locator: 'doi:10.1249/mss.0b013e3180304570',
}

export const SEILER_2013: Citation = {
	author: 'Seiler S, Jøranson K, Olesen BV, Hetlelid KJ',
	work: 'Adaptations to aerobic interval training: interactive effects of exercise intensity and total work duration. Scand J Med Sci Sports 23(1):74–83',
	year: 2013,
	locator: 'doi:10.1111/j.1600-0838.2011.01351.x',
}

export const BAKKEN: Citation = {
	author: 'Bakken M',
	work: 'The Norwegian Model',
	year: null,
	locator: 'https://www.mariusbakken.com/the-norwegian-model.html',
}

export const CANOVA_RECONSTRUCTION: Citation = {
	author: 'Bell J',
	work: 'A comprehensive overview of Canova-style "full-spectrum" percentage-based training for runners (Running Writings)',
	year: 2023,
	locator: 'https://runningwritings.com/2023/12/percentage-based-training.html',
}

// ——— Unverified locators, withheld ————————————————————————————————————

export const DANIELS: Citation = {
	author: 'Daniels J',
	work: "Daniels' Running Formula, 4th ed. Human Kinetics",
	year: 2021,
	locator: null,
}

export const PFITZINGER: Citation = {
	author: 'Pfitzinger P, Douglas S',
	work: 'Advanced Marathoning, 3rd ed. Human Kinetics',
	year: 2019,
	locator: null,
}

export const HANSONS: Citation = {
	author: 'Humphrey L, Hanson K, Hanson K',
	work: 'Hansons Marathon Method, 2nd ed. VeloPress',
	year: 2016,
	locator: null,
}

export const HUDSON: Citation = {
	author: 'Hudson B, Fitzgerald M',
	work: 'Run Faster from the 5K to the Marathon. Broadway Books',
	year: 2008,
	locator: null,
}

export const CANOVA: Citation = {
	author: 'Canova R, Arcelli E',
	work: 'Marathon Training: A Scientific Approach. IAAF',
	year: 1999,
	locator: null,
}

export const LYDIARD: Citation = {
	author: 'Lydiard A, Gilmour G',
	work: 'Running to the Top. Meyer & Meyer Sport',
	year: 1997,
	locator: null,
}

export const MAGNESS: Citation = {
	author: 'Magness S',
	work: 'The Science of Running. Origin Press',
	year: 2014,
	locator: null,
}

export const BILLAT_2000: Citation = {
	author: 'Billat VL, Slawinski J, Bocquet V, Demarle A, Lafitte L, et al.',
	work: 'Intermittent runs at the velocity associated with maximal oxygen uptake enable subjects to remain at maximal oxygen uptake for a longer time. Eur J Appl Physiol 81(3):188–196',
	year: 2000,
	locator: null,
}

export const TONNESSEN_2024: Citation = {
	author: 'Tønnessen E, Sandbakk Ø, Sandbakk SB, Seiler S, Haugen T',
	work: 'Training session models in endurance sports: a Norwegian perspective on best practice recommendations. Sports Med 54(11):2935–2953',
	year: 2024,
	locator: null,
}

export const HAUGEN_2021: Citation = {
	author: 'Haugen T, Sandbakk Ø, Enoksen E, Seiler S, Tønnessen E',
	work: 'Crossing the golden training divide: the science and practice of training world-class 800- and 1500-m runners. Sports Med 51(9):1835–1854',
	year: 2021,
	locator: null,
}

export const VERNILLO_2017: Citation = {
	author: 'Vernillo G, Giandolini M, Edwards WB, Morin J-B, Samozino P, et al.',
	work: 'Biomechanics and physiology of uphill and downhill running. Sports Med 47(4):615–629',
	year: 2017,
	locator: null,
}

export const GIOVANELLI_2016: Citation = {
	author: 'Giovanelli N, Ortiz ALR, Henninger K, Kram R',
	work: 'Energetics of vertical kilometer foot races; is steeper cheaper? J Appl Physiol 120(3):370–375',
	year: 2016,
	locator: null,
}

// ——— Cycling ——————————————————————————————————————————————————————————

export const ALLEN_COGGAN: Citation = {
	author: 'Allen H, Coggan A',
	work: 'Training and Racing with a Power Meter. VeloPress',
	year: 2006,
	locator: null,
}

export const ALMQUIST_SPRINTS: Citation = {
	author: 'Almquist NW, Wilhelmsen M, Ellefsen S, Sandbakk Ø, Rønnestad BR',
	work: 'Effects of including sprints in LIT sessions during a 14-day camp. Med Sci Sports Exerc',
	year: 2021,
	locator: null,
}

export const MAUNDER_DURABILITY: Citation = {
	author: 'Maunder E, Seiler S, Mildenhall MJ, Kilding AE, Plews DJ',
	work: 'The importance of "durability" in the physiological profiling of endurance athletes. Sports Med',
	year: 2021,
	locator: null,
}

export const MOLMEN_MIT: Citation = {
	author: 'Mølmen KS, et al.',
	work: 'A moderate-intensity interval training block improves endurance performance in well-trained cyclists. Med Sci Sports Exerc',
	year: 2025,
	locator: null,
}

export const RONNESTAD_SHORT_INTERVALS: Citation = {
	author: 'Rønnestad BR, Hansen J, Vegge G, Tønnessen E, Slettaløkken G',
	work: 'Short intervals induce superior training adaptations compared with long intervals in cyclists — an effort-matched approach. Scand J Med Sci Sports 25(2):143–151',
	year: 2015,
	locator: null,
}

export const BOSSI_VARIABLE: Citation = {
	author: 'Bossi AH, Mesquida C, Passfield L, Rønnestad BR, Hopker JG',
	work: 'Optimizing interval training through power-output variation within the work intervals. Int J Sports Physiol Perform 15(7):982–989',
	year: 2020,
	locator: null,
}

export const JONES_VANHATALO_CP: Citation = {
	author: 'Jones AM, Vanhatalo A',
	work: "The 'critical power' concept: applications to sports performance with a focus on intermittent high-intensity exercise. Sports Med 47(Suppl 1):65–78",
	year: 2017,
	locator: null,
}

export const BURGOMASTER_SIT: Citation = {
	author: 'Burgomaster KA, Hughes SC, Heigenhauser GJF, Bradwell SN, Gibala MJ',
	work: 'Six sessions of sprint interval training increases muscle oxidative potential and cycle endurance capacity in humans. J Appl Physiol 98(6):1985–1990',
	year: 2005,
	locator: null,
}

export const MILLET_STANDING: Citation = {
	author: 'Millet GP, Tronche C, Fuster N, Candau R',
	work: 'Level ground and uphill cycling efficiency in seated and standing positions. Med Sci Sports Exerc 34(10):1645–1652',
	year: 2002,
	locator: null,
}

// ——— Swimming ————————————————————————————————————————————————————————

export const WAKAYOSHI_1992: Citation = {
	author: 'Wakayoshi K, Ikuta K, Yoshida T, Udo M, Moritani T, et al.',
	work: 'Determination and validity of critical velocity as an index of swimming performance in the competitive swimmer. Eur J Appl Physiol Occup Physiol 64(2):153–157',
	year: 1992,
	locator: 'doi:10.1007/BF00717953',
}

export const MUJIKA_PADILLA_2003: Citation = {
	author: 'Mujika I, Padilla S',
	work: 'Scientific bases for precompetition tapering strategies. Med Sci Sports Exerc 35(7):1182–1187',
	year: 2003,
	locator: 'doi:10.1249/01.MSS.0000074448.73931.11',
}

export const PYNE_2001: Citation = {
	author: 'Pyne DB, Lee H, Swanwick KM',
	work: 'Monitoring the lactate threshold in world-ranked swimmers. Med Sci Sports Exerc 33(2):291–297',
	year: 2001,
	locator: null,
}

export const CRAIG_PENDERGAST_1979: Citation = {
	author: 'Craig AB Jr, Pendergast DR',
	work: 'Relationships of stroke rate, distance per stroke, and velocity in competitive swimming. Med Sci Sports Exerc 11(3):278–283',
	year: 1979,
	locator: null,
}

export const MAGLISCHO: Citation = {
	author: 'Maglischo EW',
	work: 'Swimming Fastest. Human Kinetics',
	year: 2003,
	locator: null,
}

export const SWEETENHAM: Citation = {
	author: 'Sweetenham B, Atkinson J',
	work: 'Championship Swim Training. Human Kinetics',
	year: 2003,
	locator: null,
}

export const SWIM_SMOOTH: Citation = {
	author: 'Newsome P, Young A',
	work: 'Swim Smooth: The Complete Coaching Programme for Swimmers and Triathletes. Wiley',
	year: 2012,
	locator: null,
}

export const FRIEL_TRIATHLETE: Citation = {
	author: 'Friel J',
	work: "The Triathlete's Training Bible, 4th ed. VeloPress",
	year: 2016,
	locator: null,
}

// ——— Strength ————————————————————————————————————————————————————————
//
// `workouts-strength-and-other.md` gives a DOI *and* a PMID for each of these
// and carries no blanket "compiled from recall" caveat of the kind the running
// document does, so the identifiers ship.

export const ACSM_2026: Citation = {
	author: 'Currier BS, et al. (ACSM Position Stand)',
	work: 'Med Sci Sports Exerc 58(4):851–872',
	year: 2026,
	locator: 'doi:10.1249/MSS.0000000000003897',
}

export const RONNESTAD_HEAVY_2010: Citation = {
	author: 'Rønnestad BR, Hansen EA, Raastad T',
	work: 'Effect of heavy strength training on thigh muscle cross-sectional area, performance determinants, and performance in well-trained cyclists. Eur J Appl Physiol 108(5):965–975',
	year: 2010,
	locator: 'doi:10.1007/s00421-009-1307-z',
}

export const RONNESTAD_MAINTENANCE_2010: Citation = {
	author: 'Rønnestad BR, Hansen EA, Raastad T',
	work: "In-season strength maintenance training increases well-trained cyclists' performance. Eur J Appl Physiol 110(6):1269–1282",
	year: 2010,
	locator: 'doi:10.1007/s00421-010-1622-4',
}

export const BLAGROVE_2018: Citation = {
	author: 'Blagrove RC, Howatson G, Hayes PR',
	work: 'Effects of strength training on the physiological determinants of middle- and long-distance running performance: a systematic review. Sports Med 48(5):1117–1149',
	year: 2018,
	locator: 'doi:10.1007/s40279-017-0835-7',
}

export const LOSNEGARD_2011: Citation = {
	author: 'Losnegard T, Mikkelsen K, Rønnestad BR, Hallén J, Rud B, Raastad T',
	work: 'The effect of heavy strength training on muscle mass and physical performance in elite cross country skiers. Scand J Med Sci Sports 21(3):389–401',
	year: 2011,
	locator: 'doi:10.1111/j.1600-0838.2009.01074.x',
}

export const SANCHEZ_MEDINA_2011: Citation = {
	author: 'Sánchez-Medina L, González-Badillo JJ',
	work: 'Velocity loss as an indicator of neuromuscular fatigue during resistance training. Med Sci Sports Exerc 43(9):1725–1734',
	year: 2011,
	locator: 'doi:10.1249/MSS.0b013e318213f880',
}

export const PAAVOLAINEN_1999: Citation = {
	author: 'Paavolainen L, Häkkinen K, Hämäläinen I, Nummela A, Rusko H',
	work: 'Explosive-strength training improves 5-km running time by improving running economy and muscle power. J Appl Physiol 86(5):1527–1533',
	year: 1999,
	locator: 'doi:10.1152/jappl.1999.86.5.1527',
}

export const DENADAI_2017: Citation = {
	author: 'Denadai BS, de Aguiar RA, de Lima LC, Greco CC, Caputo F',
	work: 'Explosive training and heavy weight training are effective for improving running economy in endurance athletes: a systematic review and meta-analysis. Sports Med 47(3):545–554',
	year: 2017,
	locator: 'doi:10.1007/s40279-016-0604-z',
}

export const DOMA_2017: Citation = {
	author: 'Doma K, Deakin GB, Bentley DJ',
	work: 'Implications of impaired endurance performance following single bouts of resistance training: an alternate concurrent training perspective. Sports Med 47(11):2187–2200',
	year: 2017,
	locator: 'doi:10.1007/s40279-017-0758-3',
}
