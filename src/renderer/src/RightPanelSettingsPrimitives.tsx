import { Search, X } from "lucide-react";
import {
  ReactNode,
  RefObject,
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export type SettingsSectionNavItem = {
  id: string;
  label: string;
  status?: string;
};

export type SettingsSearchTarget = {
  id: string;
  sectionId: string;
  terms: Array<string | number | boolean | undefined | null>;
};

export function settingsSearchMatches(tokens: string[], parts: Array<string | number | boolean | undefined | null>): boolean {
  if (!tokens.length) return true;
  const haystack = parts.filter((part): part is string | number | boolean => part !== undefined && part !== null).join(" ").toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function SettingsShell({
  sections,
  searchQuery,
  searchResultCount,
  onSearchQueryChange,
  children,
}: {
  sections: SettingsSectionNavItem[];
  searchQuery: string;
  searchResultCount?: number;
  onSearchQueryChange: (query: string) => void;
  children: ReactNode;
}) {
  const sectionIds = sections.map((section) => section.id);
  const sectionIdsKey = sectionIds.join("|");
  const [activeSectionId, setActiveSectionId] = useState(sectionIds[0] ?? "");

  useEffect(() => {
    if (!sectionIds.includes(activeSectionId)) setActiveSectionId(sectionIds[0] ?? "");
  }, [activeSectionId, sectionIdsKey]);

  useEffect(() => {
    if (!sectionIds.length || typeof IntersectionObserver === "undefined") return;
    const sectionElements = sectionIds
      .map((sectionId) => document.getElementById(`settings-section-${sectionId}`))
      .filter((element): element is HTMLElement => Boolean(element));
    if (!sectionElements.length) return;

    const updateActiveSection = () => {
      const anchorY = 96;
      const visibleSections = sectionElements
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.bottom > anchorY && rect.top < window.innerHeight * 0.65)
        .sort((a, b) => Math.abs(a.rect.top - anchorY) - Math.abs(b.rect.top - anchorY));
      const nextSection = visibleSections[0]?.element.id.replace("settings-section-", "") ?? sectionElements[0].id.replace("settings-section-", "");
      setActiveSectionId(nextSection);
    };

    const observer = new IntersectionObserver(updateActiveSection, {
      root: null,
      rootMargin: "-80px 0px -55% 0px",
      threshold: [0, 0.1, 0.5, 1],
    });
    sectionElements.forEach((element) => observer.observe(element));
    updateActiveSection();
    return () => observer.disconnect();
  }, [sectionIdsKey]);

  function scrollToSection(sectionId: string) {
    const sectionElement = document.getElementById(`settings-section-${sectionId}`);
    setActiveSectionId(sectionId);
    sectionElement?.scrollIntoView({ block: "start", behavior: "smooth" });
    sectionElement?.focus({ preventScroll: true });
  }

  const trimmedSearch = searchQuery.trim();
  const searchResultId = "settings-search-result-count";

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && trimmedSearch) {
      event.preventDefault();
      onSearchQueryChange("");
    }
  }

  return (
    <div className="settings-shell">
      <div className="settings-sidebar">
        <label className="settings-search">
          <span>Search settings</span>
          <div>
            <Search size={13} />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Find provider, permission, API key..."
              aria-describedby={trimmedSearch ? searchResultId : undefined}
            />
            {trimmedSearch && (
              <button type="button" onClick={() => onSearchQueryChange("")} aria-label="Clear settings search">
                <X size={13} />
              </button>
            )}
          </div>
          {trimmedSearch && (
            <small id={searchResultId} aria-live="polite">
              {searchResultCount ?? 0} matching row{searchResultCount === 1 ? "" : "s"}
            </small>
          )}
        </label>
        <nav className="settings-nav" aria-label="Settings categories">
          {sections.map((section) => (
            <button
              type="button"
              key={section.id}
              className={section.id === activeSectionId ? "active" : undefined}
              aria-current={section.id === activeSectionId ? "location" : undefined}
              onClick={() => scrollToSection(section.id)}
            >
              <span>{section.label}</span>
              {section.status && <small>{section.status}</small>}
            </button>
          ))}
        </nav>
      </div>
      <div className="settings-content">{children}</div>
    </div>
  );
}

export function SettingsSection({
  id,
  title,
  description,
  badges,
  focused,
  sectionRef,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  badges?: ReactNode;
  focused?: boolean;
  sectionRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const titleId = `settings-section-${id}-title`;
  return (
    <section
      ref={sectionRef}
      id={`settings-section-${id}`}
      className={`settings-section ${focused ? "focused-setting" : ""}`}
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <div className="settings-section-header">
        <div>
          <h3 id={titleId}>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {badges && <div className="settings-section-badges">{badges}</div>}
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  description,
  value,
  className = "",
  children,
}: {
  label: string;
  description?: ReactNode;
  value?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`settings-row ${className}`}>
      <div className="settings-row-copy">
        <span>{label}</span>
        {description && <small>{description}</small>}
      </div>
      <div className="settings-row-control">
        {value && <strong>{value}</strong>}
        {children}
      </div>
    </div>
  );
}
