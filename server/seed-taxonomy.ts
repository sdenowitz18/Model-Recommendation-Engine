/**
 * Seed taxonomy items from Career Connected Learning Outcomes and Activities PDFs.
 * Run via: npx tsx server/seed-taxonomy.ts
 * Or call POST /api/admin/seed-taxonomy
 */

import { storage } from "./storage";
import { db } from "./db";
import { taxonomyItems } from "@shared/schema";
import { eq, or } from "drizzle-orm";

// Outcomes (Step 2) — from Career Connected Learning Outcomes PDF
const OUTCOMES = [
  // Content & Career Knowledge & Skills
  {
    stepNumber: 2,
    category: "outcome",
    group: "content_career",
    name: "Science, Technology, Engineering & Math (STEM)",
    description:
      "Knowledge, skills, and mindsets critical to recognizing and applying patterns, evidence, models, and computational tools to understand the world, solve problems, and make reasoned decisions across various math and science disciplines and professions.",
    sortOrder: 0,
  },
  {
    stepNumber: 2,
    category: "outcome",
    group: "content_career",
    name: "Humanities",
    description:
      "Knowledge, skills, and mindsets critical to interpreting human experience, using inquiry, evidence, reasoning, and cultural understanding to make meaning, communicating with power, and expressing values across different professional and social contexts.",
    sortOrder: 1,
  },
  {
    stepNumber: 2,
    category: "outcome",
    group: "content_career",
    name: "Arts & Physical Education",
    description:
      "Knowledge, skills, and mindsets critical to engaging the body and senses through artistic, athletic, and movement-based practices that foster health, discipline, collaboration, and personal expression across various settings.",
    sortOrder: 2,
  },
  // Cross-Cutting Competencies
  {
    stepNumber: 2,
    category: "outcome",
    group: "cross_cutting",
    name: "Higher Order Thinking Skills",
    description:
      "Analyzing, evaluating, and creating with evidence and imagination to deepen understanding and assess the strength of ideas and arguments.",
    sortOrder: 10,
  },
  {
    stepNumber: 2,
    category: "outcome",
    group: "cross_cutting",
    name: "Learning Strategies & Habits",
    description:
      "Planning, monitoring, and improving one's learning processes to grow independence, resilience, and effectiveness over time.",
    sortOrder: 11,
  },
  {
    stepNumber: 2,
    category: "outcome",
    group: "cross_cutting",
    name: "Professional Knowledge & Skills",
    description:
      "Operating effectively in workplaces to deliver quality results and build future pathways.",
    sortOrder: 12,
  },
  {
    stepNumber: 2,
    category: "outcome",
    group: "cross_cutting",
    name: "Relationship Skills",
    description:
      "Building and sustaining respectful relationships through empathy, clear collaboration, and constructive repair.",
    sortOrder: 13,
  },
  {
    stepNumber: 2,
    category: "outcome",
    group: "cross_cutting",
    name: "Identity & Purpose",
    description:
      "Knowing yourself and choosing meaningful directions for learning, work, and life.",
    sortOrder: 14,
  },
  // Postsecondary Assets
  {
    stepNumber: 2,
    category: "outcome",
    group: "postsecondary_assets",
    name: "Social Capital",
    description:
      "Supportive connections with peers, mentors, and professionals that expand opportunities, provide guidance, and sustain success.",
    sortOrder: 20,
  },
  {
    stepNumber: 2,
    category: "outcome",
    group: "postsecondary_assets",
    name: "Industry-Recognized Credentials",
    description:
      "Attainment of certifications or credentials valued by employers and higher education as evidence of specific skills and readiness for future opportunities.",
    sortOrder: 21,
  },
  {
    stepNumber: 2,
    category: "outcome",
    group: "postsecondary_assets",
    name: "Postsecondary Plan",
    description:
      "A roadmap that aligns high-school learning, credentials, and experiences with clear post-high-school goals.",
    sortOrder: 22,
  },
  {
    stepNumber: 2,
    category: "outcome",
    group: "postsecondary_assets",
    name: "Job Seeking Resources",
    description:
      "Resume and digital profile, polished applications, and confident interview techniques.",
    sortOrder: 23,
  },
  {
    stepNumber: 2,
    category: "outcome",
    group: "postsecondary_assets",
    name: "Early College Credits",
    description:
      "Successful participation in college-level courses during high school that demonstrates academic readiness and accelerates progress toward postsecondary education.",
    sortOrder: 24,
  },
  // Postsecondary Transition
  {
    stepNumber: 2,
    category: "outcome",
    group: "postsecondary_transition",
    name: "High School Graduation",
    description:
      "Completion of state and school requirements for a diploma.",
    sortOrder: 30,
  },
  {
    stepNumber: 2,
    category: "outcome",
    group: "postsecondary_transition",
    name: "Postsecondary Enrollment",
    description:
      "Enrollment in higher education or training programs that extend learning beyond high school.",
    sortOrder: 31,
  },
  {
    stepNumber: 2,
    category: "outcome",
    group: "postsecondary_transition",
    name: "Successful Career Transition",
    description:
      "Securing and sustaining employment or further training aligned with students' goals, skills, and interests after high school.",
    sortOrder: 32,
  },
];

// LEAPs (Step 2) — from Career Connected Learning Leaps PDF
const LEAPS = [
  {
    stepNumber: 2,
    category: "leap",
    group: null,
    name: "Whole-Child Focus",
    description:
      "Learners explore careers through movement, reflection, and connection rather than static facts. Classrooms pulse with curiosity and care; guidance weaves purpose with well-being, making the path ahead feel both cognitively ambitious and deeply personal.",
    detailContent:
      "• Students have meaningful time and space to imagine and explore their values, what fulfills them, and how they relate to potential future opportunities.\n• Students learn to identify and honor their emotional and lifestyle needs as they consider future aspirations.\n• Adults support and mentor students through challenges and pivots during career experiences.\n• Dedicated school time is reserved for exploration, reflection, and mentorship so holistic preparation is protected, not squeezed between academic requirements.",
    sortOrder: 0,
  },
  {
    stepNumber: 2,
    category: "leap",
    group: null,
    name: "Connection & Community",
    description:
      "Learners are a part of a vibrant community where every story matters. Counselors help every student craft a path that honors personal ambition and preference. Students feel safe naming doubts and stretching toward audacious goals.",
    detailContent:
      "• Morning circles invite students to share traditions or triumphs, and those threads weave directly into exploration.\n• Practices and activities emphasize self-discovery, encouraging students to explore and affirm their interests and strengths.\n• Professionals that students interact with represent a range of backgrounds and identities across industries.\n• Schools have extensive community partnerships that support career experience activities and practices.\n• Students work together on industry-relevant projects, strengthening peer relationships and cultivating a community-focused learning environment.\n• Students are supported with networking opportunities and guidance to build the social capital to navigate career markets.\n• Regular feedback from local business leaders, educators, and peers is a cornerstone of the student experience.",
    sortOrder: 1,
  },
  {
    stepNumber: 2,
    category: "leap",
    group: null,
    name: "High Expectations with Rigorous Learning",
    description:
      "Every learner is seen as a future scholar, artisan, and innovator, deserving of challenge and limitless possibilities. From the earliest grades, students engage in purposeful, cross-disciplinary learning that demands synthesis, reflection, and real-world application.",
    detailContent:
      "• Students begin career exposure and skill-building in elementary school in purposeful, age-appropriate ways.\n• Every learner is introduced to high-potential career paths and the transferable skills required to pursue them.\n• All students can access internships, dual-credit courses, and pathways without GPA screens, fees, or gatekeeping.\n• Schools eliminate early tracking into narrow career paths, ensuring students keep their options open.\n• Learners engage in cross-disciplinary projects that integrate academic content with real-world problem-solving and professional skills.\n• Assessment emphasizes deep understanding, adaptability, and transferable competencies.\n• Planning and advising guides learners to synthesize insights from coursework, community experiences, and self-assessment tools into coherent, evolving plans.",
    sortOrder: 2,
  },
  {
    stepNumber: 2,
    category: "leap",
    group: null,
    name: "Relevance",
    description:
      "Students explore futures by engaging directly with their interests, communities, and the workforce. Counselors help translate passions into concrete pathways. Leadership and service extend beyond the classroom, reinforcing that our futures can leave the world stronger than we found it.",
    detailContent:
      "• Activities prepare students for real careers in their community and the larger economy.\n• Students participate in hands-on internships, simulations, and projects that apply classroom knowledge to workplace scenarios.\n• Learning is anchored in authentic questions from students' lives and communities.\n• Projects are shaped by feedback from real partners (e.g., entrepreneurs, civic leaders, artists).\n• Courses are regularly refreshed with input from students and local professionals.\n• Postsecondary planning combines interest inventories with labor-market data.\n• Students analyze industries' economic, environmental, and social impact on local and global scales.",
    sortOrder: 3,
  },
  {
    stepNumber: 2,
    category: "leap",
    group: null,
    name: "Customization",
    description:
      "Students move through adaptive rhythms, guided by evolving interests, real-time data, and supportive advising. Sequences flex to fit the learner with pacing, pathways, and resources shifting without stigma. The entire ecosystem becomes a classroom.",
    detailContent:
      "• Career-connected experiences vary in depth, duration, and complexity, offering multiple on-ramps and pacing options.\n• Students co-create pacing and structures with mentors and advisors, regularly revisiting and refining them.\n• Learning extends beyond school walls into workplaces, community spaces, homes, and virtual environments.\n• Online platforms, mobile tools, and digital portfolios expand access to resources, credentials, and personalized support.\n• Targeted supports like translation, paid internships, take-home maker kits, wellness services, and family workshops remove barriers.\n• Ongoing feedback and assessment systems monitor student progress in real time.\n• Capstone projects are offered in diverse formats and modalities.",
    sortOrder: 4,
  },
  {
    stepNumber: 2,
    category: "leap",
    group: null,
    name: "Agency",
    description:
      "Learners are on a self-run expedition. Even elementary students make choices about stations and follow their curiosities. Adults operate as expedition guides—suggesting routes, flagging hazards, and celebrating discoveries—yet the map, pacing, and destination choices remain in learners' hands.",
    detailContent:
      "• Students are empowered to lead their career exploration and experience, choosing opportunities that align with their interests and career goals.\n• School culture encourages and gives students avenues to advocate for themselves.\n• Learners recognize when their career interests or educational needs change and actively seek adjustments.\n• Peer networks organize around shared aspirations; students schedule and facilitate their own workshops, critique circles, and industry interviews.",
    sortOrder: 5,
  },
];

// Practice group parent nodes — inserted first so leaf items can reference their IDs
const PRACTICE_GROUPS_SEED = [
  { name: "Academic Integration",                     group: "academic_integration", sortOrder: 0 },
  { name: "Advising",                                 group: "advising",             sortOrder: 10 },
  { name: "Work-Based Learning",                      group: "work_based_learning",  sortOrder: 20 },
  { name: "Career & College Preparation Coursework",  group: "career_college_prep",  sortOrder: 30 },
];

// Practices (Step 3) — from Career Connected Learning Activities Overview PDF
const PRACTICES = [
  // Academic Integration
  {
    stepNumber: 3,
    category: "practice",
    group: "academic_integration",
    name: "Early Exposure to College & Career",
    description:
      "Young learners are introduced to work and college through proximity and imaginative, play-based experiences that spark curiosity and expand possibilities.",
    examples: "Books, games, role plays, college posters, themed group categories, and more.",
    sortOrder: 0,
  },
  {
    stepNumber: 3,
    category: "practice",
    group: "academic_integration",
    name: "Experiential Learning",
    description:
      "Students deepen understanding through hands-on, real-world learning opportunities that allow them to test ideas, practice problem-solving, and reflect, making learning more relevant and transferable.",
    examples: "Field trips, service learning, project-based learning, labs, makerspaces, and more.",
    sortOrder: 1,
  },
  {
    stepNumber: 3,
    category: "practice",
    group: "academic_integration",
    name: "Guided Inquiry",
    description:
      "Students investigate curiosity-sparking prompts connected to careers through questions, images, or data sets they analyze, interpret, and problem-solve while building career awareness.",
    examples: "Thought-provoking question, career research, image or dataset to interpret, and more.",
    sortOrder: 2,
  },
  {
    stepNumber: 3,
    category: "practice",
    group: "academic_integration",
    name: "Entrepreneurial Experiences",
    description:
      "Hands-on ventures that let students ideate and launch short-term entrepreneurial solutions or enterprises.",
    examples: "freshINCedu, mxINCedu, INCubatoredu, pop-up markets, and more.",
    sortOrder: 3,
  },
  {
    stepNumber: 3,
    category: "practice",
    group: "academic_integration",
    name: "Collaborative Discourse",
    description:
      "Structured conversations that allow students to explore ideas, debate perspectives, and refine their reasoning while working together.",
    examples: "Think-Pair-Share, Four Corners, Online Discussion Boards, and more.",
    sortOrder: 4,
  },
  {
    stepNumber: 3,
    category: "practice",
    group: "academic_integration",
    name: "Disciplinary Literacy",
    description:
      "Students engage with real-world, subject-specific ways of analyzing information, solving problems, and expressing ideas.",
    examples: "Budgets, lab reports, business plans, code review commentary, and more.",
    sortOrder: 5,
  },
  // Advising
  {
    stepNumber: 3,
    category: "practice",
    group: "advising",
    name: "Self Exploration",
    description:
      "Students engage in assessments that surface passions, strengths, and work styles, giving them and trusted adults clear insights to align plans with evolving interests.",
    examples: "Card sorts, digital inventories, questionnaires, and more.",
    sortOrder: 10,
  },
  {
    stepNumber: 3,
    category: "practice",
    group: "advising",
    name: "Transition Planning",
    description:
      "Students receive milestone-based guidance and personalized coaching to navigate key shifts, such as moving into middle or high school, pathway selection, planning postsecondary launches, and the pivots along the way.",
    examples: "Individualized plans, college application support, 8th/9th-grade bridge programs, shared academic advising, pathway selection, navigating pivots, and more.",
    sortOrder: 11,
  },
  {
    stepNumber: 3,
    category: "practice",
    group: "advising",
    name: "Mentorship",
    description:
      "A trust-based partnership where a learner gains guidance, feedback, and support from an experienced mentor—whether through standalone programs or embedded in internships, pathways, or advisory.",
    examples: "Mentoring by older peers, alumni, community volunteers, assigned staff, internship supervisors, and more.",
    sortOrder: 12,
  },
  {
    stepNumber: 3,
    category: "practice",
    group: "advising",
    name: "College Events",
    description:
      "Structured encounters that immerse students in the possibilities of postsecondary education, from large convention-style fairs to on-campus tours, so they can compare programs, understand admissions, and envision college life.",
    examples: "College fairs, college visits, and more.",
    sortOrder: 13,
  },
  {
    stepNumber: 3,
    category: "practice",
    group: "advising",
    name: "Networking",
    description:
      "Purposeful events and relationship-building activities that connect students with professionals and alumni, expanding their social capital from K-12 through early career.",
    examples: "Industry-specific pre-professional conferences, on-campus career networking nights, virtual networking, and more.",
    sortOrder: 14,
  },
  // Work-Based Learning
  {
    stepNumber: 3,
    category: "practice",
    group: "work_based_learning",
    name: "Classroom Jobs",
    description:
      "Responsibility-anchored micro-roles that weave learners into the fabric of classroom life, each job with a clear checklist and accountability.",
    examples: "Line leader, botanist-of-the-week, materials collector, and more.",
    sortOrder: 20,
  },
  {
    stepNumber: 3,
    category: "practice",
    group: "work_based_learning",
    name: "Client Projects",
    description:
      "Standards-aligned, career-connected learning experiences in which students create authentic deliverables for professional partners.",
    examples: "Short-term projects, long-term projects, and more.",
    sortOrder: 21,
  },
  {
    stepNumber: 3,
    category: "practice",
    group: "work_based_learning",
    name: "Job Shadowing",
    description:
      "Students observe professionals in real workplace settings to gain firsthand insight into career roles, workplace expectations, and pathways.",
    examples: "Half day, full day, meetings, professional events, and more.",
    sortOrder: 22,
  },
  {
    stepNumber: 3,
    category: "practice",
    group: "work_based_learning",
    name: "Internships",
    description:
      "Students participate in sustained workplace experiences, taking on defined responsibilities, practicing professional habits, and contributing to daily operations. These opportunities provide deeper exposure and a clearer sense of long-term pathways.",
    examples: "Local, remote (e.g., NASA OSTEM Internship), summer (e.g., Bank of America Student Leaders), and more.",
    sortOrder: 23,
  },
  {
    stepNumber: 3,
    category: "practice",
    group: "work_based_learning",
    name: "Apprenticeships",
    description:
      "Pairing learners with professionals to build skills through guided practice. For younger students, micro apprenticeships offer short experiences that spark curiosity and early career awareness. For older students, paid apprenticeships provide extended training in a field.",
    examples: "Micro apprenticeships, National Park Service Junior Ranger Program, AJAC Youth Apprenticeships, and more.",
    sortOrder: 24,
  },
  // Career & College Preparation Coursework
  {
    stepNumber: 3,
    category: "practice",
    group: "career_college_prep",
    name: "Dual Enrollment & AP Courses",
    description:
      "College-level courses in high school that prepare students for postsecondary success. Dual credit allows students to earn high school and college credit at once, while AP offers rigorous coursework with the chance to earn credit through exams.",
    examples: "Dual Credit, AP, OnRamps, P-TECH, and more.",
    sortOrder: 30,
  },
  {
    stepNumber: 3,
    category: "practice",
    group: "career_college_prep",
    name: "CTE Courses",
    description:
      "Standalone courses and sequenced pathways help students explore broad career fields and build the knowledge and skills needed for college and the workforce.",
    examples: "Computer Science, Health Sciences, Energy & Sustainable Resources, Graphic Design & Interactive Media, Aerospace Engineering, Construction, and more.",
    sortOrder: 31,
  },
  {
    stepNumber: 3,
    category: "practice",
    group: "career_college_prep",
    name: "Credentialing",
    description:
      "Industry-recognized certifications or micro-credentials that verify specific technical and professional competencies valued by employers and postsecondary programs.",
    examples: "OSHA 10 General Industry Safety, CPR/First Aid, ServSafe Food Handler, Adobe Certified Professional, CompTIA A+ or IT Fundamentals, ASE Entry-Level Automotive Service Technician, and more.",
    sortOrder: 32,
  },
];

/**
 * Upsert a batch of rows: update name/description/examples/group/sortOrder if the row
 * already exists (matched by stepNumber + category + name), otherwise insert it.
 * Returns the final rows (with stable IDs).
 */
async function upsertTaxonomyItems(
  rows: Array<{
    stepNumber: number; category: string; group: string | null; parentId: number | null;
    name: string; description: string | null; examples: string | null; detailContent: string | null; sortOrder: number;
  }>
) {
  const results = [];
  for (const row of rows) {
    const existing = await db.select().from(taxonomyItems)
      .where(
        eq(taxonomyItems.stepNumber, row.stepNumber) &&
        eq(taxonomyItems.category, row.category) &&
        eq(taxonomyItems.name, row.name) as any
      );
    if (existing.length > 0) {
      const [updated] = await db.update(taxonomyItems)
        .set({
          description: row.description,
          examples: row.examples,
          group: row.group,
          sortOrder: row.sortOrder,
          detailContent: row.detailContent,
          // parentId only updated if it was previously null (avoid breaking manually-set hierarchies)
          ...(existing[0].parentId === null && row.parentId !== null ? { parentId: row.parentId } : {}),
        })
        .where(eq(taxonomyItems.id, existing[0].id))
        .returning();
      results.push(updated);
    } else {
      const [inserted] = await db.insert(taxonomyItems).values(row).returning();
      results.push(inserted);
    }
  }
  return results;
}

export async function seedTaxonomy() {
  // Upsert outcomes (step 2) — preserves existing IDs
  const outcomeRows = OUTCOMES.map((o) => ({
    stepNumber: o.stepNumber,
    category: o.category,
    group: o.group,
    parentId: null,
    name: o.name,
    description: o.description,
    examples: null,
    detailContent: null,
    sortOrder: o.sortOrder,
  }));

  // Upsert leaps (step 2)
  const leapRows = LEAPS.map((l) => ({
    stepNumber: l.stepNumber,
    category: l.category,
    group: null,
    parentId: null,
    name: l.name,
    description: l.description,
    examples: null,
    detailContent: (l as any).detailContent ?? null,
    sortOrder: l.sortOrder,
  }));

  await upsertTaxonomyItems([...outcomeRows, ...leapRows]);

  // Upsert practice group parent nodes first so we get stable IDs
  const upsertedGroups = await upsertTaxonomyItems(
    PRACTICE_GROUPS_SEED.map((g) => ({
      stepNumber: 3,
      category: "practice_group",
      group: g.group,
      parentId: null,
      name: g.name,
      description: null,
      examples: null,
      detailContent: null,
      sortOrder: g.sortOrder,
    }))
  );

  // Build a map from group key → stable parent ID
  const groupIdMap: Record<string, number> = Object.fromEntries(
    upsertedGroups.map((g) => [g.group as string, g.id])
  );

  // Upsert practice leaf rows with parentId from the stable group IDs
  await upsertTaxonomyItems(
    PRACTICES.map((p) => ({
      stepNumber: p.stepNumber,
      category: p.category,
      group: p.group,
      parentId: groupIdMap[p.group] ?? null,
      name: p.name,
      description: p.description,
      examples: (p as any).examples ?? null,
      detailContent: null,
      sortOrder: p.sortOrder,
    }))
  );

  // Remove any taxonomy items for steps 2–3 that are no longer in the seed data
  // (handles renames / deletions without touching user-added items from the admin UI)
  const allSeedNames = new Set([
    ...OUTCOMES.map((o) => o.name),
    ...LEAPS.map((l) => l.name),
    ...PRACTICES.map((p) => p.name),
    ...PRACTICE_GROUPS_SEED.map((g) => g.name),
  ]);
  const existing = await db.select().from(taxonomyItems)
    .where(or(eq(taxonomyItems.stepNumber, 2), eq(taxonomyItems.stepNumber, 3)));
  const stale = existing.filter((r) => !allSeedNames.has(r.name));
  for (const item of stale) {
    await db.delete(taxonomyItems).where(eq(taxonomyItems.id, item.id));
  }

  return { outcomes: OUTCOMES.length, leaps: LEAPS.length, practices: PRACTICES.length, practiceGroups: PRACTICE_GROUPS_SEED.length };
}

// Run directly: npm run db:seed
const isMain = process.argv[1]?.includes("seed-taxonomy");
if (isMain) {
  seedTaxonomy()
    .then((r) => {
      console.log("Taxonomy seeded:", r);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
