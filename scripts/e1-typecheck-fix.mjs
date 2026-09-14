import fs from "node:fs";

const path = "src/components/unified-social-explore.tsx";
let text = fs.readFileSync(path, "utf8");
const fromImport = 'import { COMMUNITY_CATEGORIES, type Community } from "@/lib/community";';
const toImport = 'import { type Community } from "@/lib/community";';
if (!text.includes(fromImport)) throw new Error("Expected Community import not found");
text = text.replace(fromImport, toImport);
const fromType = '{LOCAL_POST_TYPES[deepLinkedPost.post_type].label}';
const toType = '{LOCAL_POST_TYPES[deepLinkedPost.post_type]}';
if (!text.includes(fromType)) throw new Error("Expected Local Post type label not found");
text = text.replace(fromType, toType);
fs.writeFileSync(path, text);
