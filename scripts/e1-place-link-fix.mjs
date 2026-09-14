import fs from "node:fs";

const path = "src/components/explore.tsx";
const before = fs.readFileSync(path, "utf8");
const from = `<Link href={\`/p/${'${selected.place_id}'}\`}>\n                        {selected.place_name} →\n                      </Link>`;
const to = `<Link\n                        href={\`/p/${'${selected.place_id}'}\`}\n                        aria-label={\`Xem địa điểm ${'${selected.place_name}'}\`}\n                      >\n                        {selected.place_name} →\n                      </Link>`;
if (!before.includes(from)) throw new Error("Expected Activity Place link not found");
fs.writeFileSync(path, before.replace(from, to));
