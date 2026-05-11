/**
 * Indian institutional skeleton — the curated list of organizations that any
 * RelGraph deployment should land on Day 1.
 *
 * Scope:
 *   - All Public Sector Banks (PSBs) post-2020 consolidation
 *   - The major private sector banks
 *   - Key financial regulators (RBI, SEBI, IRDAI, PFRDA)
 *   - Government ministries directly relevant to financial markets
 *   - Top development financial institutions and apex bodies
 *   - Major exchanges and depositories
 *
 * What this is NOT:
 *   - Leadership / people. Those come from the ingestion agents that pull
 *     from RBI press releases, MCA21, BSE/NSE filings, etc.
 *   - The full BSE-200. Phase 2 will extend this skeleton.
 *
 * Data sources (verified at compile time, refreshed periodically):
 *   - RBI list of scheduled commercial banks: https://rbi.org.in
 *   - PSB consolidation history (10-bank merger, 2020):
 *     https://pib.gov.in/PressReleasePage.aspx?PRID=1583994
 *   - Top private banks by deposits (FY 2024-25)
 *   - Key regulators per Indian financial system architecture
 *
 * The seed is idempotent: it will create rows that don't exist and update
 * fields on existing rows (matched by `name`). Existing manually-entered
 * orgs are preserved.
 */

import type { OrgType } from "../../shared/enums";

export interface SkeletonOrg {
  name: string;
  shortName: string;
  type: OrgType;
  city: string;
  website: string;
  // Optional notes that surface as a hint in the admin UI / future "About"
  // panel. Kept very short.
  about?: string;
}

// Public sector banks (12 post the 2020 consolidation: 4 mergers reduced 10 → 4
// surviving entities, leaving 12 PSBs nationally).
export const PSU_BANKS: SkeletonOrg[] = [
  {
    name: "State Bank of India",
    shortName: "SBI",
    type: "psu_bank",
    city: "Mumbai",
    website: "https://sbi.co.in",
    about: "Largest Indian bank by assets. Majority-owned by Government of India.",
  },
  {
    name: "Bank of Baroda",
    shortName: "BoB",
    type: "psu_bank",
    city: "Vadodara",
    website: "https://bankofbaroda.in",
    about: "Merged Vijaya Bank + Dena Bank into BoB in 2019.",
  },
  {
    name: "Punjab National Bank",
    shortName: "PNB",
    type: "psu_bank",
    city: "New Delhi",
    website: "https://pnbindia.in",
    about: "Merged OBC + United Bank into PNB in 2020.",
  },
  {
    name: "Canara Bank",
    shortName: "Canara",
    type: "psu_bank",
    city: "Bengaluru",
    website: "https://canarabank.com",
    about: "Merged with Syndicate Bank in 2020.",
  },
  {
    name: "Union Bank of India",
    shortName: "UBI",
    type: "psu_bank",
    city: "Mumbai",
    website: "https://unionbankofindia.co.in",
    about: "Merged Andhra Bank + Corporation Bank into UBI in 2020.",
  },
  {
    name: "Indian Bank",
    shortName: "Indian Bank",
    type: "psu_bank",
    city: "Chennai",
    website: "https://indianbank.in",
    about: "Merged with Allahabad Bank in 2020.",
  },
  {
    name: "Bank of India",
    shortName: "BoI",
    type: "psu_bank",
    city: "Mumbai",
    website: "https://bankofindia.co.in",
  },
  {
    name: "Central Bank of India",
    shortName: "CBI",
    type: "psu_bank",
    city: "Mumbai",
    website: "https://centralbankofindia.co.in",
  },
  {
    name: "Indian Overseas Bank",
    shortName: "IOB",
    type: "psu_bank",
    city: "Chennai",
    website: "https://iob.in",
  },
  {
    name: "Bank of Maharashtra",
    shortName: "BoM",
    type: "psu_bank",
    city: "Pune",
    website: "https://bankofmaharashtra.in",
  },
  {
    name: "UCO Bank",
    shortName: "UCO",
    type: "psu_bank",
    city: "Kolkata",
    website: "https://ucobank.com",
  },
  {
    name: "Punjab & Sind Bank",
    shortName: "PSB",
    type: "psu_bank",
    city: "New Delhi",
    website: "https://punjabandsindbank.co.in",
  },
];

// Major private sector banks. Selected by deposit base + systemic importance.
export const PRIVATE_BANKS: SkeletonOrg[] = [
  {
    name: "HDFC Bank",
    shortName: "HDFC",
    type: "private_bank",
    city: "Mumbai",
    website: "https://hdfcbank.com",
    about: "Largest private bank by assets following the 2023 HDFC Ltd. merger.",
  },
  {
    name: "ICICI Bank",
    shortName: "ICICI",
    type: "private_bank",
    city: "Mumbai",
    website: "https://icicibank.com",
  },
  {
    name: "Axis Bank",
    shortName: "Axis",
    type: "private_bank",
    city: "Mumbai",
    website: "https://axisbank.com",
  },
  {
    name: "Kotak Mahindra Bank",
    shortName: "Kotak",
    type: "private_bank",
    city: "Mumbai",
    website: "https://kotak.com",
  },
  {
    name: "IndusInd Bank",
    shortName: "IndusInd",
    type: "private_bank",
    city: "Mumbai",
    website: "https://indusind.com",
  },
  {
    name: "Yes Bank",
    shortName: "Yes",
    type: "private_bank",
    city: "Mumbai",
    website: "https://yesbank.in",
  },
  {
    name: "IDFC FIRST Bank",
    shortName: "IDFC FIRST",
    type: "private_bank",
    city: "Mumbai",
    website: "https://idfcfirstbank.com",
  },
  {
    name: "Federal Bank",
    shortName: "Federal",
    type: "private_bank",
    city: "Aluva",
    website: "https://federalbank.co.in",
  },
  {
    name: "RBL Bank",
    shortName: "RBL",
    type: "private_bank",
    city: "Mumbai",
    website: "https://rblbank.com",
  },
  {
    name: "South Indian Bank",
    shortName: "SIB",
    type: "private_bank",
    city: "Thrissur",
    website: "https://southindianbank.com",
  },
  {
    name: "Karur Vysya Bank",
    shortName: "KVB",
    type: "private_bank",
    city: "Karur",
    website: "https://kvb.co.in",
  },
  {
    name: "City Union Bank",
    shortName: "CUB",
    type: "private_bank",
    city: "Kumbakonam",
    website: "https://cityunionbank.com",
  },
  {
    name: "DCB Bank",
    shortName: "DCB",
    type: "private_bank",
    city: "Mumbai",
    website: "https://dcbbank.com",
  },
  {
    name: "Bandhan Bank",
    shortName: "Bandhan",
    type: "private_bank",
    city: "Kolkata",
    website: "https://bandhanbank.com",
  },
  {
    name: "AU Small Finance Bank",
    shortName: "AU SFB",
    type: "private_bank",
    city: "Jaipur",
    website: "https://aubank.in",
  },
  {
    name: "CSB Bank",
    shortName: "CSB",
    type: "private_bank",
    city: "Thrissur",
    website: "https://csb.co.in",
  },
  {
    name: "Dhanlaxmi Bank",
    shortName: "Dhanlaxmi",
    type: "private_bank",
    city: "Thrissur",
    website: "https://dhanbank.com",
  },
  {
    name: "Tamilnad Mercantile Bank",
    shortName: "TMB",
    type: "private_bank",
    city: "Thoothukudi",
    website: "https://tmb.in",
  },
  {
    name: "Jammu & Kashmir Bank",
    shortName: "J&K Bank",
    type: "private_bank",
    city: "Srinagar",
    website: "https://jkbank.com",
    about: "Listed private bank in which J&K UT government holds majority stake.",
  },
  {
    name: "Karnataka Bank",
    shortName: "KBL",
    type: "private_bank",
    city: "Mangaluru",
    website: "https://karnatakabank.com",
  },
];

// Financial regulators with direct authority over RelGraph's coverage areas.
export const REGULATORS: SkeletonOrg[] = [
  {
    name: "Reserve Bank of India",
    shortName: "RBI",
    type: "regulator",
    city: "Mumbai",
    website: "https://rbi.org.in",
    about: "Central bank. Regulates banks, NBFCs, payment systems, foreign exchange.",
  },
  {
    name: "Securities and Exchange Board of India",
    shortName: "SEBI",
    type: "regulator",
    city: "Mumbai",
    website: "https://sebi.gov.in",
    about: "Capital markets regulator. Listed companies, mutual funds, intermediaries.",
  },
  {
    name: "Insurance Regulatory and Development Authority of India",
    shortName: "IRDAI",
    type: "regulator",
    city: "Hyderabad",
    website: "https://irdai.gov.in",
    about: "Insurance regulator.",
  },
  {
    name: "Pension Fund Regulatory and Development Authority",
    shortName: "PFRDA",
    type: "regulator",
    city: "New Delhi",
    website: "https://pfrda.org.in",
    about: "NPS and pension fund regulator.",
  },
  {
    name: "International Financial Services Centres Authority",
    shortName: "IFSCA",
    type: "regulator",
    city: "Gandhinagar",
    website: "https://ifsca.gov.in",
    about: "Unified IFSC regulator at GIFT City.",
  },
];

// Key government bodies relevant to financial markets and bank governance.
export const GOVERNMENT: SkeletonOrg[] = [
  {
    name: "Ministry of Finance",
    shortName: "MoF",
    type: "government",
    city: "New Delhi",
    website: "https://finmin.nic.in",
    about: "Apex ministry over financial sector. Owns DEA, DFS, DEPP, DIPAM, DoR.",
  },
  {
    name: "Department of Financial Services",
    shortName: "DFS",
    type: "government",
    city: "New Delhi",
    website: "https://financialservices.gov.in",
    about: "Within MoF. Owns PSB and PSU insurer governance + appointments.",
  },
  {
    name: "Department of Economic Affairs",
    shortName: "DEA",
    type: "government",
    city: "New Delhi",
    website: "https://dea.gov.in",
    about: "Within MoF. Currency, market regulator coordination, multilaterals.",
  },
  {
    name: "Department of Investment and Public Asset Management",
    shortName: "DIPAM",
    type: "government",
    city: "New Delhi",
    website: "https://dipam.gov.in",
    about: "Within MoF. Disinvestment and PSU equity management.",
  },
  {
    name: "Ministry of Corporate Affairs",
    shortName: "MCA",
    type: "government",
    city: "New Delhi",
    website: "https://mca.gov.in",
    about: "Companies Act administration, MCA21 filings, NCLT/NCLAT.",
  },
];

// Development financial institutions and apex bodies.
export const DFI_BODIES: SkeletonOrg[] = [
  {
    name: "Life Insurance Corporation of India",
    shortName: "LIC",
    type: "dfi",
    city: "Mumbai",
    website: "https://licindia.in",
    about: "Largest insurer; major institutional investor.",
  },
  {
    name: "National Bank for Agriculture and Rural Development",
    shortName: "NABARD",
    type: "dfi",
    city: "Mumbai",
    website: "https://nabard.org",
    about: "Apex DFI for agriculture and rural development.",
  },
  {
    name: "Small Industries Development Bank of India",
    shortName: "SIDBI",
    type: "dfi",
    city: "Lucknow",
    website: "https://sidbi.in",
    about: "Apex MSME financing institution.",
  },
  {
    name: "National Housing Bank",
    shortName: "NHB",
    type: "dfi",
    city: "New Delhi",
    website: "https://nhb.org.in",
    about: "Apex housing finance regulator/refinancier.",
  },
  {
    name: "Export-Import Bank of India",
    shortName: "EXIM",
    type: "dfi",
    city: "Mumbai",
    website: "https://eximbankindia.in",
  },
  {
    name: "National Bank for Financing Infrastructure and Development",
    shortName: "NaBFID",
    type: "dfi",
    city: "Mumbai",
    website: "https://nabfid.org",
    about: "Set up in 2021 as the new infrastructure DFI.",
  },
  {
    name: "Indian Renewable Energy Development Agency",
    shortName: "IREDA",
    type: "dfi",
    city: "New Delhi",
    website: "https://ireda.in",
  },
];

// Stock exchanges and key market infrastructure institutions.
export const MARKET_INFRA: SkeletonOrg[] = [
  {
    name: "National Stock Exchange of India",
    shortName: "NSE",
    type: "corporate",
    city: "Mumbai",
    website: "https://nseindia.com",
    about: "Largest stock exchange by turnover.",
  },
  {
    name: "BSE Limited",
    shortName: "BSE",
    type: "corporate",
    city: "Mumbai",
    website: "https://bseindia.com",
    about: "Asia's oldest stock exchange.",
  },
  {
    name: "Multi Commodity Exchange of India",
    shortName: "MCX",
    type: "corporate",
    city: "Mumbai",
    website: "https://mcxindia.com",
    about: "Largest commodity derivatives exchange.",
  },
  {
    name: "National Securities Depository Limited",
    shortName: "NSDL",
    type: "corporate",
    city: "Mumbai",
    website: "https://nsdl.co.in",
  },
  {
    name: "Central Depository Services Limited",
    shortName: "CDSL",
    type: "corporate",
    city: "Mumbai",
    website: "https://cdslindia.com",
  },
];

// Major BSE-listed corporates beyond banks and DFIs. Selected by market
// cap + systemic relevance to a senior-executive relationship-intel use case.
// These extend the skeleton with the corporates a Manipal Group-tier user
// most plausibly tracks. Phase 3 could push this to the full BSE-200; this
// list of 30 covers the bulk of strategic relevance.
export const TOP_CORPORATES: SkeletonOrg[] = [
  { name: "Reliance Industries Limited", shortName: "Reliance", type: "corporate", city: "Mumbai", website: "https://ril.com", about: "Largest Indian company by market cap. Energy, retail, telecom (Jio)." },
  { name: "Tata Consultancy Services", shortName: "TCS", type: "corporate", city: "Mumbai", website: "https://tcs.com" },
  { name: "Infosys Limited", shortName: "Infosys", type: "corporate", city: "Bengaluru", website: "https://infosys.com" },
  { name: "Hindustan Unilever Limited", shortName: "HUL", type: "corporate", city: "Mumbai", website: "https://hul.co.in" },
  { name: "ITC Limited", shortName: "ITC", type: "corporate", city: "Kolkata", website: "https://itcportal.com", about: "Diversified — FMCG, hotels, agribusiness, paperboards." },
  { name: "Bharti Airtel Limited", shortName: "Airtel", type: "corporate", city: "New Delhi", website: "https://airtel.in" },
  { name: "Larsen & Toubro Limited", shortName: "L&T", type: "corporate", city: "Mumbai", website: "https://larsentoubro.com" },
  { name: "Asian Paints Limited", shortName: "Asian Paints", type: "corporate", city: "Mumbai", website: "https://asianpaints.com" },
  { name: "Maruti Suzuki India Limited", shortName: "Maruti", type: "corporate", city: "New Delhi", website: "https://marutisuzuki.com" },
  { name: "Mahindra & Mahindra Limited", shortName: "M&M", type: "corporate", city: "Mumbai", website: "https://mahindra.com" },
  { name: "Tata Motors Limited", shortName: "Tata Motors", type: "corporate", city: "Mumbai", website: "https://tatamotors.com" },
  { name: "Bajaj Auto Limited", shortName: "Bajaj Auto", type: "corporate", city: "Pune", website: "https://bajajauto.com" },
  { name: "Hero MotoCorp Limited", shortName: "Hero MotoCorp", type: "corporate", city: "New Delhi", website: "https://heromotocorp.com" },
  { name: "Wipro Limited", shortName: "Wipro", type: "corporate", city: "Bengaluru", website: "https://wipro.com" },
  { name: "HCL Technologies Limited", shortName: "HCL Tech", type: "corporate", city: "Noida", website: "https://hcltech.com" },
  { name: "Sun Pharmaceutical Industries", shortName: "Sun Pharma", type: "corporate", city: "Mumbai", website: "https://sunpharma.com" },
  { name: "Dr. Reddy's Laboratories", shortName: "Dr. Reddy's", type: "corporate", city: "Hyderabad", website: "https://drreddys.com" },
  { name: "Cipla Limited", shortName: "Cipla", type: "corporate", city: "Mumbai", website: "https://cipla.com" },
  { name: "Nestle India Limited", shortName: "Nestle India", type: "corporate", city: "Gurugram", website: "https://nestle.in" },
  { name: "Britannia Industries Limited", shortName: "Britannia", type: "corporate", city: "Bengaluru", website: "https://britannia.co.in" },
  { name: "Tata Steel Limited", shortName: "Tata Steel", type: "corporate", city: "Mumbai", website: "https://tatasteel.com" },
  { name: "JSW Steel Limited", shortName: "JSW Steel", type: "corporate", city: "Mumbai", website: "https://jsw.in/steel" },
  { name: "Hindalco Industries Limited", shortName: "Hindalco", type: "corporate", city: "Mumbai", website: "https://hindalco.com" },
  { name: "UltraTech Cement Limited", shortName: "UltraTech", type: "corporate", city: "Mumbai", website: "https://ultratechcement.com" },
  { name: "Grasim Industries Limited", shortName: "Grasim", type: "corporate", city: "Mumbai", website: "https://grasim.com" },
  { name: "Adani Enterprises Limited", shortName: "Adani", type: "corporate", city: "Ahmedabad", website: "https://adani.com", about: "Diversified — energy, ports, airports, infrastructure." },
  { name: "Power Grid Corporation of India", shortName: "PowerGrid", type: "corporate", city: "Gurugram", website: "https://powergrid.in", about: "Public sector — central transmission utility." },
  { name: "NTPC Limited", shortName: "NTPC", type: "corporate", city: "New Delhi", website: "https://ntpc.co.in", about: "India's largest power generation company. Maharatna PSU." },
  { name: "Oil and Natural Gas Corporation", shortName: "ONGC", type: "corporate", city: "New Delhi", website: "https://ongcindia.com" },
  { name: "Coal India Limited", shortName: "Coal India", type: "corporate", city: "Kolkata", website: "https://coalindia.in", about: "World's largest coal producer. Maharatna PSU." },
];

export const ALL_SKELETON_ORGS: SkeletonOrg[] = [
  ...PSU_BANKS,
  ...PRIVATE_BANKS,
  ...REGULATORS,
  ...GOVERNMENT,
  ...DFI_BODIES,
  ...MARKET_INFRA,
  ...TOP_CORPORATES,
];

/**
 * Total: 12 PSBs + 20 private banks + 5 regulators + 5 govt bodies + 7 DFIs +
 * 5 market infra + 30 top corporates = 84 organizations.
 *
 * The Apify-driven ingestion agents (week 2.3) will populate persons + tenures
 * on top of this skeleton. The seed is the *org backbone*; people are
 * downstream.
 */
