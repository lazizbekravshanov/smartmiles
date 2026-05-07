// Minimal landing page. SmartMiles is a Telegram bot — this is just a "yes the host is alive" page.

export default function Page(): JSX.Element {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640, margin: "0 auto" }}>
      <h1>SmartMiles</h1>
      <p>Free truck-routing + load optimization bot for owner-operators and small carriers.</p>
      <p>
        Open it in Telegram — search for the bot or follow the link from the GitHub README.
      </p>
      <ul>
        <li><code>/route</code> — point-to-point</li>
        <li><code>/load</code> — multi-stop optimizer</li>
        <li><code>/fuel</code> — corridor fuel finder</li>
        <li><code>/stops</code> — weigh stations + rest areas</li>
      </ul>
    </main>
  );
}
