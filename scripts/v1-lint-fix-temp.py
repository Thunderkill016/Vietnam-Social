from pathlib import Path

path = Path("src/components/unified-social-explore.tsx")
text = path.read_text()

old_state = "  const [filter, setFilter] = useState<SocialMapFilter>(initialFilter);"
new_state = '''  const [filter, setFilter] = useState<SocialMapFilter>(() => {
    if (typeof window === "undefined") return initialFilter;
    const requestedLayer = new URLSearchParams(window.location.search).get(
      "layer",
    ) as SocialMapFilter | null;
    return requestedLayer && SOCIAL_MAP_FILTERS.includes(requestedLayer)
      ? requestedLayer
      : initialFilter;
  });'''

old_effect = '''  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedLayer = params.get("layer") as SocialMapFilter | null;
    if (
      requestedLayer &&
      SOCIAL_MAP_FILTERS.includes(requestedLayer as SocialMapFilter)
    ) {
      setFilter(requestedLayer);
    }

    const id = params.get("post");'''
new_effect = '''  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("post");'''

for old, new in ((old_state, new_state), (old_effect, new_effect)):
    if old not in text:
        raise SystemExit(f"Expected source block not found: {old[:120]}")
    text = text.replace(old, new, 1)

path.write_text(text)
