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

export const RONNESTAD_30_15: Citation = {
	author: 'Rønnestad BR, Hansen J, Nygaard H, Lundby C',
	work: 'Superior performance improvements in elite cyclists following short-interval vs effort-matched long-interval training. Scand J Med Sci Sports',
	year: 2020,
	locator: null,
}

export const RONNESTAD_STRENGTH: Citation = {
	author: 'Rønnestad BR, Mujika I',
	work: 'Optimizing strength training for running and cycling endurance performance: a review. Scand J Med Sci Sports 24(4):603–612',
	year: 2014,
	locator: null,
}

export const COGGAN_ALLEN: Citation = {
	author: 'Allen H, Coggan A, McGregor S',
	work: 'Training and Racing with a Power Meter, 3rd ed. VeloPress',
	year: 2019,
	locator: null,
}

export const FRIEL_CYCLIST: Citation = {
	author: 'Friel J',
	work: "The Cyclist's Training Bible, 5th ed. VeloPress",
	year: 2018,
	locator: null,
}

export const SEILER_POLARIZED: Citation = {
	author: 'Seiler S',
	work: 'What is best practice for training intensity and duration distribution in endurance athletes? Int J Sports Physiol Perform 5(3):276–291',
	year: 2010,
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

export const CSS_WAKAYOSHI: Citation = {
	author: 'Wakayoshi K, Ikuta K, Yoshida T, Udo M, Moritani T, et al.',
	work: 'Determination and validity of critical velocity as an index of swimming performance in the competitive swimmer. Eur J Appl Physiol 64(2):153–157',
	year: 1992,
	locator: null,
}

export const BEATTIE_STRENGTH: Citation = {
	author: 'Beattie K, Kenny IC, Lyons M, Carson BP',
	work: 'The effect of strength training on performance in endurance athletes. Sports Med 44(6):845–865',
	year: 2014,
	locator: null,
}

export const ZOURDOS_RIR: Citation = {
	author: 'Zourdos MC, Klemp A, Dolan C, Quiles JM, Schau KA, et al.',
	work: 'Novel resistance training-specific rating of perceived exertion scale measuring repetitions in reserve. J Strength Cond Res 30(1):267–275',
	year: 2016,
	locator: null,
}
