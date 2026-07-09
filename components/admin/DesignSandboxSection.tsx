"use client";

/**
 * Embeds the personalization-panel redesign sandbox (docs/avlmc-redesign-sandbox.html, served by
 * the admin-gated /admin/design/redesign-sandbox route) so layout/dial variants can be compared
 * side-by-side right in the portal.
 */
export function DesignSandboxSection() {
  return (
    <section className="admin-design-sandbox">
      <header className="admin-design-sandbox-header">
        <div>
          <h2>Personalization Panel Redesign</h2>
          <p className="admin-meta">
            Interactive mock — flip Layout, Tuning dials, and User state to compare variants. Production
            currently ships the <strong>Two-pane</strong> layout with <strong>Presets + Advanced</strong> dials.
          </p>
        </div>
        <a
          className="admin-live-link"
          href="/admin/design/redesign-sandbox"
          rel="noreferrer"
          target="_blank"
        >
          Open full screen →
        </a>
      </header>
      <iframe
        className="admin-design-sandbox-frame"
        src="/admin/design/redesign-sandbox"
        title="Personalization panel redesign sandbox"
      />
    </section>
  );
}
