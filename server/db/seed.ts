import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import bcrypt from "bcrypt";
import {
  users, domains, userDomainAccess, organizations, persons,
  tenures, relationships, interactions, interactionParticipants,
  reflections, personIntel, personNotes, orgHierarchy,
} from "./schema";

const { Pool } = pg;

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log("Seeding RelGraph database...");

  // 1. Users (3 users)
  const passwordHash = await bcrypt.hash("RelGraph2024!", 12);

  const [adminUser, managerUser, contributorUser] = await db.insert(users).values([
    { email: "admin@relgraph.io", name: "Priya Sharma", passwordHash, role: "admin" as const },
    { email: "manager@relgraph.io", name: "Rajesh Kumar", passwordHash, role: "manager" as const },
    { email: "contributor@relgraph.io", name: "Anita Desai", passwordHash, role: "contributor" as const },
  ]).returning();

  console.log("  Created 3 users");

  // 2. Domains (6 domains)
  const [psuBanking, privateBanking, regulators, government, nbfcs, corporates] = await db.insert(domains).values([
    { name: "PSU Banking", description: "Public Sector Unit Banks", color: "#7F77DD" },
    { name: "Private Banking", description: "Private Sector Banks", color: "#1D9E75" },
    { name: "Regulators", description: "RBI, SEBI, NABARD, IRDAI", color: "#D85A30" },
    { name: "Government", description: "Ministry of Finance, DFS, DIPAM", color: "#D4537E" },
    { name: "NBFCs", description: "Non-Banking Financial Companies & DFIs", color: "#378ADD" },
    { name: "Corporates", description: "Large Indian corporates", color: "#BA7517" },
  ]).returning();

  console.log("  Created 6 domains");

  // 3. Domain access
  await db.insert(userDomainAccess).values([
    { userId: adminUser.id, domainId: psuBanking.id },
    { userId: adminUser.id, domainId: privateBanking.id },
    { userId: adminUser.id, domainId: regulators.id },
    { userId: adminUser.id, domainId: government.id },
    { userId: adminUser.id, domainId: nbfcs.id },
    { userId: adminUser.id, domainId: corporates.id },
    { userId: managerUser.id, domainId: psuBanking.id },
    { userId: managerUser.id, domainId: privateBanking.id },
    { userId: managerUser.id, domainId: regulators.id },
    { userId: contributorUser.id, domainId: psuBanking.id },
    { userId: contributorUser.id, domainId: privateBanking.id },
  ]);

  console.log("  Assigned domain access");

  // 4. Organizations (15 orgs)
  const [sbi, pnb, bob, canara, hdfc, icici, axis, kotak, rbi, sebi, nabard, mof, dfs, bajaj, reliance] = await db.insert(organizations).values([
    { name: "State Bank of India", shortName: "SBI", domainId: psuBanking.id, type: "psu_bank" as const, city: "Mumbai" },
    { name: "Punjab National Bank", shortName: "PNB", domainId: psuBanking.id, type: "psu_bank" as const, city: "New Delhi" },
    { name: "Bank of Baroda", shortName: "BOB", domainId: psuBanking.id, type: "psu_bank" as const, city: "Vadodara" },
    { name: "Canara Bank", shortName: "Canara", domainId: psuBanking.id, type: "psu_bank" as const, city: "Bengaluru" },
    { name: "HDFC Bank", shortName: "HDFC", domainId: privateBanking.id, type: "private_bank" as const, city: "Mumbai" },
    { name: "ICICI Bank", shortName: "ICICI", domainId: privateBanking.id, type: "private_bank" as const, city: "Mumbai" },
    { name: "Axis Bank", shortName: "Axis", domainId: privateBanking.id, type: "private_bank" as const, city: "Mumbai" },
    { name: "Kotak Mahindra Bank", shortName: "Kotak", domainId: privateBanking.id, type: "private_bank" as const, city: "Mumbai" },
    { name: "Reserve Bank of India", shortName: "RBI", domainId: regulators.id, type: "regulator" as const, city: "Mumbai" },
    { name: "Securities and Exchange Board of India", shortName: "SEBI", domainId: regulators.id, type: "regulator" as const, city: "Mumbai" },
    { name: "National Bank for Agriculture and Rural Development", shortName: "NABARD", domainId: regulators.id, type: "regulator" as const, city: "Mumbai" },
    { name: "Ministry of Finance", shortName: "MoF", domainId: government.id, type: "government" as const, city: "New Delhi" },
    { name: "Department of Financial Services", shortName: "DFS", domainId: government.id, type: "government" as const, city: "New Delhi" },
    { name: "Bajaj Finance", shortName: "Bajaj Fin", domainId: nbfcs.id, type: "nbfc" as const, city: "Pune" },
    { name: "Reliance Industries", shortName: "RIL", domainId: corporates.id, type: "corporate" as const, city: "Mumbai" },
  ]).returning();

  console.log("  Created 15 organizations");

  // 5. Org hierarchy
  await db.insert(orgHierarchy).values([
    { parentOrgId: mof.id, childOrgId: dfs.id, relationshipType: "department" as const },
  ]);

  // 6. Persons (20 sample persons)
  const personValues = [
    { name: "Dinesh Kumar Khara", currentTitle: "Chairman", currentOrgId: sbi.id, category: "banker" as const, isTracked: true, createdBy: adminUser.id },
    { name: "Atul Kumar Goel", currentTitle: "MD & CEO", currentOrgId: pnb.id, category: "banker" as const, isTracked: true, createdBy: adminUser.id },
    { name: "Debadatta Chand", currentTitle: "MD & CEO", currentOrgId: bob.id, category: "banker" as const, isTracked: true, createdBy: managerUser.id },
    { name: "K Satyanarayana Raju", currentTitle: "MD & CEO", currentOrgId: canara.id, category: "banker" as const, isTracked: true, createdBy: managerUser.id },
    { name: "Sashidhar Jagdishan", currentTitle: "CEO", currentOrgId: hdfc.id, category: "banker" as const, isTracked: true, createdBy: adminUser.id },
    { name: "Sandeep Bakhshi", currentTitle: "MD & CEO", currentOrgId: icici.id, category: "banker" as const, isTracked: true, createdBy: adminUser.id },
    { name: "Amitabh Chaudhry", currentTitle: "MD & CEO", currentOrgId: axis.id, category: "banker" as const, isTracked: true, createdBy: managerUser.id },
    { name: "Ashok Vaswani", currentTitle: "MD & CEO", currentOrgId: kotak.id, category: "banker" as const, isTracked: true, createdBy: managerUser.id },
    { name: "Shaktikanta Das", currentTitle: "Governor", currentOrgId: rbi.id, category: "regulator" as const, isTracked: true, createdBy: adminUser.id },
    { name: "Madhabi Puri Buch", currentTitle: "Chairperson", currentOrgId: sebi.id, category: "regulator" as const, isTracked: true, createdBy: adminUser.id },
    { name: "Shaji K V", currentTitle: "Chairman", currentOrgId: nabard.id, category: "regulator" as const, isTracked: true, createdBy: adminUser.id },
    { name: "Nirmala Sitharaman", currentTitle: "Finance Minister", currentOrgId: mof.id, category: "bureaucrat" as const, isTracked: true, createdBy: adminUser.id },
    { name: "Vivek Joshi", currentTitle: "Secretary", currentOrgId: dfs.id, category: "bureaucrat" as const, isTracked: true, createdBy: adminUser.id },
    { name: "Rajeev Rishi", currentTitle: "Vice Chairman", currentOrgId: bajaj.id, category: "banker" as const, isTracked: true, createdBy: contributorUser.id },
    { name: "Mukesh Ambani", currentTitle: "Chairman", currentOrgId: reliance.id, category: "corporate" as const, isTracked: true, createdBy: adminUser.id },
    { name: "Michael Patra", currentTitle: "Deputy Governor", currentOrgId: rbi.id, category: "regulator" as const, isTracked: true, createdBy: managerUser.id },
    { name: "T Rabi Sankar", currentTitle: "Deputy Governor", currentOrgId: rbi.id, category: "regulator" as const, isTracked: true, createdBy: managerUser.id },
    { name: "Swaminathan J", currentTitle: "Deputy Governor", currentOrgId: rbi.id, category: "regulator" as const, isTracked: true, createdBy: managerUser.id },
    { name: "Ajay Seth", currentTitle: "Secretary DEA", currentOrgId: mof.id, category: "bureaucrat" as const, isTracked: true, createdBy: adminUser.id },
    { name: "Uday Kotak", currentTitle: "Founder", currentOrgId: kotak.id, category: "banker" as const, isTracked: false, createdBy: adminUser.id },
  ];

  const insertedPersons = await db.insert(persons).values(personValues).returning();
  console.log(`  Created ${insertedPersons.length} persons`);

  // 7. Tenures (sample career history)
  await db.insert(tenures).values([
    { personId: insertedPersons[0].id, orgId: sbi.id, title: "Chairman", startDate: "2020-10-01", isCurrent: true, source: "manual" as const, createdBy: adminUser.id },
    { personId: insertedPersons[0].id, orgId: sbi.id, title: "Managing Director", startDate: "2018-08-01", endDate: "2020-09-30", source: "manual" as const, createdBy: adminUser.id },
    { personId: insertedPersons[4].id, orgId: hdfc.id, title: "CEO", startDate: "2020-10-27", isCurrent: true, source: "manual" as const, createdBy: adminUser.id },
    { personId: insertedPersons[5].id, orgId: icici.id, title: "MD & CEO", startDate: "2018-10-15", isCurrent: true, source: "manual" as const, createdBy: adminUser.id },
    { personId: insertedPersons[8].id, orgId: rbi.id, title: "Governor", startDate: "2018-12-12", isCurrent: true, source: "manual" as const, createdBy: adminUser.id },
    { personId: insertedPersons[9].id, orgId: sebi.id, title: "Chairperson", startDate: "2022-03-02", isCurrent: true, source: "manual" as const, createdBy: adminUser.id },
    { personId: insertedPersons[11].id, orgId: mof.id, title: "Finance Minister", startDate: "2019-05-31", isCurrent: true, source: "manual" as const, createdBy: adminUser.id },
    { personId: insertedPersons[14].id, orgId: reliance.id, title: "Chairman & MD", startDate: "2002-07-01", isCurrent: true, source: "manual" as const, createdBy: adminUser.id },
  ]);

  console.log("  Created tenures");

  // 8. Relationships
  await db.insert(relationships).values([
    { sourcePersonId: insertedPersons[0].id, targetPersonId: insertedPersons[8].id, type: "formal" as const, strengthScore: 75, strengthLabel: "strong" as const, declaredBy: adminUser.id, originStory: "Regular RBI-SBI coordination" },
    { sourcePersonId: insertedPersons[4].id, targetPersonId: insertedPersons[5].id, type: "alumni" as const, strengthScore: 60, strengthLabel: "active" as const, declaredBy: managerUser.id, originStory: "IIM batchmates" },
    { sourcePersonId: insertedPersons[8].id, targetPersonId: insertedPersons[11].id, type: "formal" as const, strengthScore: 85, strengthLabel: "champion" as const, declaredBy: adminUser.id, originStory: "FM-RBI Governor relationship" },
    { sourcePersonId: insertedPersons[5].id, targetPersonId: insertedPersons[14].id, type: "informal" as const, strengthScore: 55, strengthLabel: "active" as const, declaredBy: contributorUser.id },
    { sourcePersonId: insertedPersons[9].id, targetPersonId: insertedPersons[8].id, type: "formal" as const, strengthScore: 70, strengthLabel: "strong" as const, declaredBy: adminUser.id },
    { sourcePersonId: insertedPersons[1].id, targetPersonId: insertedPersons[12].id, type: "formal" as const, strengthScore: 45, strengthLabel: "active" as const, declaredBy: managerUser.id },
    { sourcePersonId: insertedPersons[0].id, targetPersonId: insertedPersons[4].id, type: "indirect" as const, strengthScore: 30, strengthLabel: "acquaintance" as const, declaredBy: managerUser.id },
  ]);

  console.log("  Created relationships");

  // 9. Interactions
  const [int1, int2, int3] = await db.insert(interactions).values([
    { type: "one_on_one_meeting" as const, occurredAt: new Date("2024-03-15"), location: "Mumbai - RBI HQ", summary: "Discussed new NBFC lending regulations. Governor mentioned upcoming policy review in April. Seemed positive about digital lending framework.", depthScore: 8, inputMethod: "text" as const, createdBy: adminUser.id },
    { type: "meal" as const, occurredAt: new Date("2024-03-10"), location: "ITC Grand Central, Mumbai", summary: "Dinner with Sandeep. Discussed ICICI's expansion plans in rural markets. Mentioned interest in partnership opportunities.", depthScore: 7, inputMethod: "text" as const, createdBy: managerUser.id },
    { type: "conference" as const, occurredAt: new Date("2024-02-20"), location: "NASSCOM Event, Bengaluru", summary: "Panel discussion on AI in banking. Met multiple banking heads. Good networking opportunity.", depthScore: 4, inputMethod: "form" as const, createdBy: contributorUser.id },
  ]).returning();

  await db.insert(interactionParticipants).values([
    { interactionId: int1.id, personId: insertedPersons[8].id, role: "attendee" as const },
    { interactionId: int2.id, personId: insertedPersons[5].id, role: "attendee" as const },
    { interactionId: int3.id, personId: insertedPersons[0].id, role: "speaker" as const },
    { interactionId: int3.id, personId: insertedPersons[4].id, role: "attendee" as const },
  ]);

  console.log("  Created interactions");

  // 10. Reflections
  await db.insert(reflections).values([
    { personId: insertedPersons[8].id, authorId: adminUser.id, category: "strategic_read" as const, content: "Governor Das appears to be leaning towards a more accommodative monetary policy. His recent speeches suggest rate cuts may be on the horizon. Good time to engage on lending regulation discussions.", confidenceLevel: "high" as const, confidenceBasis: "1:1 meeting + public speeches", visibilityLevel: "manager" as const },
    { personId: insertedPersons[5].id, authorId: managerUser.id, category: "personality" as const, content: "Sandeep is data-driven and prefers structured proposals. Always bring numbers. Values punctuality highly. Prefers evening meetings.", confidenceLevel: "high" as const, confidenceBasis: "Multiple dinners over 2 years", visibilityLevel: "contributor" as const },
    { personId: insertedPersons[11].id, authorId: adminUser.id, category: "network_dynamics" as const, content: "FM's office is closely coordinating with DFS on banking reform agenda. Vivek Joshi is the key gatekeeper. All proposals should route through him first.", confidenceLevel: "medium" as const, confidenceBasis: "Industry contacts", visibilityLevel: "admin" as const },
    { personId: insertedPersons[14].id, authorId: contributorUser.id, category: "opportunity" as const, content: "Reliance is looking to expand into financial services. Potential partnership opportunity for digital payments infrastructure.", confidenceLevel: "medium" as const, confidenceBasis: "Conference conversation", visibilityLevel: "contributor" as const },
  ]);

  console.log("  Created reflections");

  // 11. Person Intel
  await db.insert(personIntel).values([
    { personId: insertedPersons[8].id, fieldName: "Education", fieldValue: "MA (Economics), University of Mumbai", contributedBy: adminUser.id, inputMethod: "text" as const },
    { personId: insertedPersons[8].id, fieldName: "Previous Role", fieldValue: "Revenue Secretary, Govt of India", contributedBy: adminUser.id, inputMethod: "text" as const },
    { personId: insertedPersons[5].id, fieldName: "Education", fieldValue: "MBA, IIM Lucknow", contributedBy: managerUser.id, inputMethod: "text" as const },
    { personId: insertedPersons[5].id, fieldName: "Interests", fieldValue: "Cricket, classical music, fitness", contributedBy: managerUser.id, inputMethod: "text" as const },
    { personId: insertedPersons[4].id, fieldName: "Communication Style", fieldValue: "Direct, metrics-oriented, appreciates concise presentations", contributedBy: adminUser.id, inputMethod: "text" as const },
    { personId: insertedPersons[11].id, fieldName: "Key Priorities", fieldValue: "Financial inclusion, digital payments, NBFC regulation", contributedBy: adminUser.id, inputMethod: "text" as const },
    { personId: insertedPersons[0].id, fieldName: "Board Memberships", fieldValue: "SBI Foundation, SBI Life Insurance (nominee director)", contributedBy: adminUser.id, inputMethod: "text" as const },
  ]);

  console.log("  Created intel fields");

  // 12. Person Notes
  await db.insert(personNotes).values([
    { personId: insertedPersons[8].id, authorId: adminUser.id, content: "Need to follow up on the NBFC regulation discussion from March 15 meeting. Governor mentioned reviewing our proposal by end of April.", inputMethod: "text" as const, visibilityLevel: "manager" as const },
    { personId: insertedPersons[5].id, authorId: managerUser.id, content: "Sandeep's EA is Meera Nair. Best to schedule through her. Prefers Thursday/Friday meetings.", inputMethod: "text" as const, visibilityLevel: "contributor" as const },
  ]);

  console.log("  Created notes");

  console.log("\nSeed completed successfully!");
  console.log("Login credentials: admin@relgraph.io / RelGraph2024!");
  console.log("                   manager@relgraph.io / RelGraph2024!");
  console.log("                   contributor@relgraph.io / RelGraph2024!");

  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
