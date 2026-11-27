import type { Source } from "./types";

export interface Platform {
  id: Exclude<Source, "gcal" | "hub">;
  name: string;
  /** Where "Open" takes the user. */
  url: string;
  description: string;
  /** "sync": the hub pulls its data. "link": launcher only, for now. */
  integration: "sync" | "link";
}

/** Every CEDT platform the hub knows about, in launcher order. */
export const PLATFORMS: readonly Platform[] = [
  {
    id: "mcv",
    name: "MyCourseVille",
    url: "https://www.mycourseville.com/?q=courseville&type=course&role=all",
    description: "Courses, assignments, announcements",
    integration: "sync",
  },
  {
    id: "grader",
    name: "CEDT Grader",
    url: "https://cedt-grader.nattee.net/main/list",
    description: "Programming problems and scores",
    integration: "link",
  },
  {
    id: "talent",
    name: "Talent Journey",
    url: "https://talent.cedt.community/",
    description: "Skills and career journey",
    integration: "link",
  },
  {
    id: "intern",
    name: "CEDT Intern Portal",
    url: "https://cedtintern.cp.eng.chula.ac.th/",
    description: "Internship applications",
    integration: "link",
  },
  {
    id: "nisitez",
    name: "Nisitez",
    url: "https://nisitez.siamcodex.com/login",
    description: "Student services",
    integration: "link",
  },
  {
    id: "ices",
    name: "CEDT-ICES",
    url: "https://cedt-ices.com/login",
    description: "Course and instructor evaluations",
    integration: "link",
  },
];
