import fs from "node:fs";

function replaceOnce(path, from, to) {
  const before = fs.readFileSync(path, "utf8");
  if (!before.includes(from)) {
    throw new Error(`Expected text not found in ${path}: ${from.slice(0, 120)}`);
  }
  fs.writeFileSync(path, before.replace(from, to));
}

const unified = "src/components/unified-social-explore.tsx";
replaceOnce(
  unified,
  'import Link from "next/link";\nimport {',
  'import Link from "next/link";\nimport * as Dialog from "@radix-ui/react-dialog";\nimport {',
);
replaceOnce(
  unified,
  '  const [selected, setSelected] = useState<SocialMapEntity | null>(null);\n  const [loading, setLoading] = useState(true);',
  '  const [selected, setSelected] = useState<SocialMapEntity | null>(null);\n  const [deepLinkedPost, setDeepLinkedPost] = useState<LocalPost | null>(null);\n  const [loading, setLoading] = useState(true);',
);
replaceOnce(
  unified,
  '  const loadMap = useCallback(\n',
  `  useEffect(() => {\n    const id = new URLSearchParams(window.location.search).get("post");\n    if (!id) return;\n    let active = true;\n    void api<{ post: LocalPost }>(\`/api/posts/\${id}\`)\n      .then((result) => {\n        if (active) setDeepLinkedPost(result.post);\n      })\n      .catch(() => undefined);\n    return () => {\n      active = false;\n    };\n  }, []);\n\n  const loadMap = useCallback(\n`,
);
replaceOnce(
  unified,
  '        </aside>\n      </section>\n    </main>\n  );\n}',
  `        </aside>\n      </section>\n\n      <Dialog.Root\n        open={Boolean(deepLinkedPost)}\n        onOpenChange={(open) => {\n          if (open) return;\n          setDeepLinkedPost(null);\n          const url = new URL(window.location.href);\n          url.searchParams.delete("post");\n          window.history.replaceState({}, "", url);\n        }}\n      >\n        <Dialog.Portal>\n          <Dialog.Overlay className={styles.overlay} />\n          <Dialog.Content className={\`\${styles.modal} \${styles.detailModal}\`}>\n            <Dialog.Close className={styles.close} aria-label="Đóng">\n              <X />\n            </Dialog.Close>\n            {deepLinkedPost && (\n              <>\n                <Dialog.Title className={styles.modalTitle}>\n                  {LOCAL_POST_TYPES[deepLinkedPost.post_type].label}\n                </Dialog.Title>\n                <Dialog.Description className={styles.postMeta}>\n                  {deepLinkedPost.author.display_name} · {deepLinkedPost.area}\n                </Dialog.Description>\n                <p>{deepLinkedPost.body}</p>\n                {deepLinkedPost.place_id && (\n                  <Link\n                    className={styles.navLink}\n                    href={\`/p/\${deepLinkedPost.place_id}\`}\n                  >\n                    <MapPin size={15} /> Xem địa điểm {deepLinkedPost.place_name}\n                  </Link>\n                )}\n                <Link\n                  className={styles.primaryButton}\n                  href={\`/contribute?post=\${deepLinkedPost.id}\`}\n                >\n                  <MessageCircle size={16} /> Mở thảo luận\n                </Link>\n              </>\n            )}\n          </Dialog.Content>\n        </Dialog.Portal>\n      </Dialog.Root>\n    </main>\n  );\n}`,
);

const live = "tests/e2e/live.spec.ts";
replaceOnce(
  live,
  '  const run = randomUUID().slice(0, 8),\n    password = `Local-only-${randomUUID()}`;',
  '  const run = randomUUID().slice(0, 8),\n    password = `Local-only-${randomUUID()}`,\n    placeId = randomUUID();',
);
replaceOnce(
  live,
  '  const hostId = host.data.user.id;\n  if (!/^[a-f0-9-]{36}$/.test(hostId)) throw new Error("Unexpected user ID");\n  localSql(\n    `update app_private.profiles set role=\'host\',display_name=\'Host local E2E\' where id=\'${hostId}\'; insert into app_private.host_venue_memberships(host_id,place_id,granted_by) values(\'${hostId}\',\'10000000-0000-4000-8000-000000000001\',\'${hostId}\') on conflict do nothing;`,\n  );',
  '  const hostId = host.data.user.id;\n  const memberId = member.data.user.id;\n  if (!/^[a-f0-9-]{36}$/.test(hostId) || !/^[a-f0-9-]{36}$/.test(memberId))\n    throw new Error("Unexpected user ID");\n  localSql(\n    `insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent,enabled,data_origin) values(\'${placeId}\',\'hcm\',\'E2E public place ${run}\',\'E2E Area ${run}\',106.68,10.82,\'8665b5647ffffff\',true,\'real\'); update app_private.profiles set role=\'host\',display_name=\'Host local E2E\' where id=\'${hostId}\'; insert into app_private.analytics_test_actors(actor_id,reason) values(\'${hostId}\',\'live E2E host\'),(\'${memberId}\',\'live E2E member\') on conflict (actor_id) do nothing; insert into app_private.host_venue_memberships(host_id,place_id,granted_by) values(\'${hostId}\',\'${placeId}\',\'${hostId}\') on conflict do nothing;`,\n  );',
);
replaceOnce(
  live,
  '      .selectOption("10000000-0000-4000-8000-000000000001");',
  '      .selectOption(placeId);',
);
replaceOnce(
  live,
  '    const placeId = "10000000-0000-4000-8000-000000000001";\n    const headers = { Authorization: `Bearer ${access}` };',
  '    const headers = { Authorization: `Bearer ${access}` };',
);

console.log("Applied E1 final compatibility fixes.");
