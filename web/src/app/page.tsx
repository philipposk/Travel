const FEATURES = [
  {
    icon: "✈️",
    title: "Smart flight search",
    body: "Compare real prices across multiple sources. Best deal highlighted automatically.",
  },
  {
    icon: "🏨",
    title: "Hotel recommendations",
    body: "AI ranks hotels by your priorities — price, location, vibe, reviews.",
  },
  {
    icon: "🧠",
    title: "Travel intelligence",
    body: "Trip reports from Reddit, YouTube, and travel blogs — summarised, not overwhelming.",
  },
  {
    icon: "📋",
    title: "Itinerary builder",
    body: "Describe your trip. Get a day-by-day plan you can actually follow.",
  },
];

export default function Home() {
  return (
    <div style={{ maxWidth: "60rem", margin: "0 auto", padding: "3rem 1.5rem 6rem" }}>
      {/* Hero */}
      <div style={{ marginBottom: "4rem" }}>
        <p
          style={{
            color: "var(--accent)",
            fontWeight: 600,
            fontSize: "0.875rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: "1rem",
          }}
        >
          AI trip planner
        </p>
        <h1
          style={{
            fontSize: "clamp(2rem, 5vw, 3.5rem)",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            marginBottom: "1.25rem",
          }}
        >
          An AI that actually
          <br />
          <span style={{ color: "var(--accent)" }}>helps you go somewhere.</span>
        </h1>
        <p
          style={{
            color: "var(--fg-muted)",
            fontSize: "1.1rem",
            lineHeight: 1.6,
            maxWidth: "38rem",
            marginBottom: "2rem",
          }}
        >
          Not just links and ads. Travel searches multiple sources, understands your priorities,
          and gives you a concrete plan — flights, hotels, itinerary.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <a href="https://travel.6x7.gr" className="btn btn-primary">
            Plan a trip →
          </a>
          <a href="https://6x7.gr" className="btn btn-ghost">
            More projects
          </a>
        </div>
      </div>

      {/* Features */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
        }}
      >
        {FEATURES.map((f) => (
          <div key={f.title} className="glass" style={{ padding: "1.5rem" }}>
            <div style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>{f.icon}</div>
            <h3 style={{ fontWeight: 700, marginBottom: "0.5rem" }}>{f.title}</h3>
            <p style={{ color: "var(--fg-muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>
              {f.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
