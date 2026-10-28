import {
  Camera, Cpu, FlaskConical, Package, Presentation, School, Trophy, Users, Volleyball, Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ResourceCategory } from "@/lib/contracts/resource";

export type CoverTone = "sage" | "olive" | "sand" | "sky" | "clay" | "lavender";

export interface CategoryMeta {
  label: string;
  group: CategoryGroup;
  icon: LucideIcon;
  tone: CoverTone;
}

// Discovery chips (PRD 7 "category" filter) group the ten database categories.
export const CATEGORY_GROUPS = ["Spaces", "Labs & machines", "Technology", "Media", "Sports", "Other"] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

export const CATEGORIES: Record<ResourceCategory, CategoryMeta> = {
  classroom: { label: "Classroom", group: "Spaces", icon: School, tone: "sand" },
  seminar_hall: { label: "Seminar hall", group: "Spaces", icon: Presentation, tone: "sand" },
  meeting_room: { label: "Meeting room", group: "Spaces", icon: Users, tone: "sage" },
  sports_ground: { label: "Sports ground", group: "Sports", icon: Trophy, tone: "olive" },
  lab: { label: "Lab", group: "Labs & machines", icon: FlaskConical, tone: "sky" },
  electronics: { label: "Electronics", group: "Technology", icon: Cpu, tone: "sky" },
  media: { label: "Media", group: "Media", icon: Camera, tone: "lavender" },
  sports_equipment: { label: "Sports equipment", group: "Sports", icon: Volleyball, tone: "olive" },
  machine: { label: "Machine", group: "Labs & machines", icon: Wrench, tone: "clay" },
  other: { label: "Other", group: "Other", icon: Package, tone: "sage" },
};

export const COVER_TONES: Record<CoverTone, string> = {
  sage: "from-[#e4eed6] to-[#c9dcb3]",
  olive: "from-[#e8ecd0] to-[#cdd9a6]",
  sand: "from-[#f3ead8] to-[#e2d2b2]",
  sky: "from-[#e1ebf1] to-[#c3d6e2]",
  clay: "from-[#f3e2d6] to-[#e2c4b0]",
  lavender: "from-[#e9e6f5] to-[#d2cdea]",
};
