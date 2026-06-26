import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { vi } from "vitest";
import type { BrowserCredentialSafeStorage, BrowserService } from "../browser/browserAgentRuntimeContract";
import type { WorkflowBrowserAdapter } from "./workflowDesktopTools";

export function fakeBrowser(targetUrl: string, searchResults: Array<{ title: string; url: string; snippet: string }> = []) {
  return {
    search: vi.fn(async () => searchResults),
    navigate: vi.fn(async (input: { url: string }) => ({ url: input.url, title: "Dogfood QA Fixture" })),
    content: vi.fn(async () => ({ url: targetUrl, text: "Dogfood QA Fixture\nStatus: ready", links: [] })),
    evaluate: vi.fn(),
    screenshot: vi.fn(async () => ({ path: join(dirname(targetUrl.replace("file://", "")), "qa-fixture.png") })),
    pick: vi.fn(),
  };
}

export const fakeBrowserCredentialSafeStorage: BrowserCredentialSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(value, "utf8"),
  decryptString: (value: Buffer) => value.toString("utf8"),
};

export function fakeResearchBrowser() {
  const results = [
    {
      title: "PagedAttention and vLLM",
      url: "https://example.test/research/pagedattention",
      snippet:
        "PagedAttention stores KV cache in non-contiguous blocks so serving can reduce memory waste and support more concurrent requests.",
    },
    {
      title: "StreamingLLM attention sinks",
      url: "https://example.test/research/streamingllm",
      snippet:
        "StreamingLLM keeps attention sink tokens and recent tokens so long-context generation can continue with a bounded KV cache.",
    },
  ];
  const pages = new Map(
    results.map((result) => [
      result.url,
      [
        result.title,
        result.snippet,
        "Source evidence: KV cache pressure is a primary serving bottleneck for long-context inference.",
        "Operational implication: deterministic workflows should cite which source supported each optimization claim.",
      ].join("\n"),
    ]),
  );
  return {
    search: vi.fn(async () => results),
    navigate: vi.fn(async (input: { url: string }) => ({
      url: input.url,
      title: results.find((result) => result.url === input.url)?.title ?? "Research source",
    })),
    content: vi.fn(async (input: { url?: string }) => ({
      url: input.url,
      title: results.find((result) => result.url === input.url)?.title ?? "Research source",
      text: pages.get(input.url ?? "") ?? "No page content available.",
      links: [],
    })),
    evaluate: vi.fn(),
    screenshot: vi.fn(async () => ({ path: join(tmpdir(), "research-source.png"), bytes: 0 })),
    pick: vi.fn(),
  };
}

export function fakeScottsdaleEntertainmentBrowser() {
  const results = [
    {
      title: "Scottsdale Couples Movie Listings",
      url: "https://example.test/scottsdale/couples-movies",
      snippet:
        "This week: romantic drama at Harkins Camelview, late comedy at RoadHouse Cinemas, and a quiet weekday matinee option for date-night planning.",
    },
    {
      title: "Scottsdale Live Shows Calendar",
      url: "https://example.test/scottsdale/live-shows",
      snippet:
        "This week: acoustic jazz at Scottsdale Center for the Performing Arts, an intimate magic show, and a dinner-friendly lounge set.",
    },
    {
      title: "Old Town Scottsdale Date Night Guide",
      url: "https://example.test/scottsdale/date-night",
      snippet: "Neighborhood guide with walkable dinner, movie, and live-entertainment pairings near Old Town Scottsdale.",
    },
  ];
  const pages = new Map([
    [
      "https://example.test/scottsdale/couples-movies",
      [
        "Scottsdale Couples Movie Listings",
        "Current week highlights:",
        "- Harkins Camelview: Moonlit Letters, a romantic drama with reserved seating and post-film dining nearby.",
        "- RoadHouse Cinemas Scottsdale: Late Laughs, an easy comedy pick with in-theater dinner service.",
        "- Matinee option: quiet weekday screening for couples who prefer lower crowds.",
        "Evidence note: movie times should be verified before booking.",
      ].join("\n"),
    ],
    [
      "https://example.test/scottsdale/live-shows",
      [
        "Scottsdale Live Shows Calendar",
        "Current week highlights:",
        "- Scottsdale Center for the Performing Arts: Desert Jazz Duo, a seated acoustic show with date-night atmosphere.",
        "- Old Town Lounge: Sunset Standards, a low-volume lounge set suitable for conversation.",
        "- Intimate Magic Room: close-up show near restaurants; ticket availability changes quickly.",
        "Evidence note: live show dates and tickets should be verified before attending.",
      ].join("\n"),
    ],
    [
      "https://example.test/scottsdale/date-night",
      [
        "Old Town Scottsdale Date Night Guide",
        "Pair a movie or acoustic show with walkable dinner options.",
        "Prefer venues where conversation is possible and parking is straightforward.",
      ].join("\n"),
    ],
  ]);
  return {
    search: vi.fn(async () => results),
    navigate: vi.fn(async (input: { url: string }) => ({
      url: input.url,
      title: results.find((result) => result.url === input.url)?.title ?? "Scottsdale source",
    })),
    content: vi.fn(async (input: { url?: string }) => ({
      url: input.url,
      title: results.find((result) => result.url === input.url)?.title ?? "Scottsdale source",
      text: pages.get(input.url ?? "") ?? "No Scottsdale source content available.",
      links: [],
    })),
    evaluate: vi.fn(),
    screenshot: vi.fn(async () => ({ path: join(tmpdir(), "scottsdale-entertainment-source.png"), bytes: 0 })),
    pick: vi.fn(),
  };
}

export function fakeScottsdaleEntertainmentBrowserWithIntervention() {
  const result = {
    title: "Scottsdale Family Shows Calendar",
    url: "https://example.test/scottsdale/family-shows",
    snippet:
      "Next week: puppet theater, family-friendly magic matinee, and an outdoor kids concert. The source requires browser verification before content loads.",
  };
  const userAction = {
    id: "browser-action-family-shows",
    active: true,
    status: "waiting",
    kind: "captcha",
    provider: "recaptcha",
    toolName: "browser_nav",
    runtime: "chrome",
    profileMode: "copied",
    url: result.url,
    title: "Scottsdale Family Shows - Verify",
    origin: "https://example.test",
    pageExcerpt: "Scottsdale Family Shows Calendar. Complete the CAPTCHA in the managed browser before the source content loads.",
    screenshot: {
      path: join(tmpdir(), "scottsdale-family-shows-verification.png"),
      artifactPath: ".ambient-codex/browser/screenshots/scottsdale-family-shows-verification.png",
      mimeType: "image/png",
      bytes: 14321,
      width: 1200,
      height: 800,
      title: "Scottsdale Family Shows - Verify",
      url: result.url,
    },
    message: "Complete the CAPTCHA in the managed browser, then return to Ambient and continue.",
    startedAt: "2026-05-12T00:00:00.000Z",
    lastCheckedAt: "2026-05-12T00:00:00.000Z",
    canAutoResume: true,
  };
  return {
    search: vi.fn(async () => [result]),
    navigate: vi.fn(async (input: { url: string; userActionId?: string }) => {
      if (input.url === result.url && input.userActionId !== userAction.id) return userAction;
      return { url: input.url, title: result.title };
    }),
    content: vi.fn(async (input: { url?: string }) => ({
      url: input.url,
      title: result.title,
      text: [
        "Scottsdale Family Shows Calendar",
        "Next-week child-friendly highlights:",
        "- Puppet Adventures: a 45-minute puppet theater show recommended for ages 3-7.",
        "- Magic Matinee: family-friendly close-up magic with early afternoon seating.",
        "- Kids Concert in the Park: outdoor sing-along with shaded seating and food trucks.",
        "Evidence note: dates and tickets should be verified before attending.",
      ].join("\n"),
      links: [],
    })),
    evaluate: vi.fn(),
    screenshot: vi.fn(async () => userAction.screenshot),
    pick: vi.fn(),
  };
}

export function recordingWorkflowBrowser(browserService: BrowserService): {
  browser: WorkflowBrowserAdapter;
  calls: Record<string, unknown[]>;
} {
  const calls: Record<string, unknown[]> = {
    search: [],
    navigate: [],
    content: [],
    evaluate: [],
    screenshot: [],
    pick: [],
  };
  return {
    calls,
    browser: {
      search: async (input) => {
        calls.search.push(input);
        return browserService.search(input);
      },
      navigate: async (input) => {
        calls.navigate.push(input);
        return browserService.navigate(input);
      },
      content: async (input) => {
        calls.content.push(input);
        return browserService.content(input);
      },
      evaluate: async (input) => {
        calls.evaluate.push(input);
        return browserService.evaluate(input);
      },
      screenshot: async (input) => {
        calls.screenshot.push(input);
        return browserService.screenshot(input);
      },
      pick: async (input) => {
        calls.pick.push(input);
        return browserService.pick(input);
      },
    },
  };
}

export async function createManagedBrowserChallengeServer(): Promise<{
  url: string;
  hits: { shows: number };
  close: () => Promise<void>;
}> {
  const hits = { shows: 0 };
  const server: Server = createServer((request, response) => {
    const path = request.url?.split("?")[0] ?? "/";
    if (path !== "/shows") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }
    hits.shows += 1;
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Verify you are human</title>
    <script>
      function whenBodyReady(fn) {
        if (document.body) {
          fn();
          return;
        }
        window.addEventListener("DOMContentLoaded", fn, { once: true });
      }
      function renderReady() {
        document.title = "Scottsdale Managed Browser Shows Ready";
        document.body.innerHTML = [
          "<main>",
          "<h1>Scottsdale family-friendly live shows next week</h1>",
          "<p>This page is the unlocked managed-browser dogfood source.</p>",
          "<article><h2>Puppet Adventures</h2><p>Recommended ages 3-7. A 45-minute puppet theater matinee with reserved seating.</p></article>",
          "<article><h2>Magic Matinee</h2><p>Family-friendly close-up magic in early afternoon time slots.</p></article>",
          "<article><h2>Kids Concert in the Park</h2><p>Outdoor sing-along with shaded seating and food trucks.</p></article>",
          "<p>Evidence note: dates and tickets should be verified before attending.</p>",
          "</main>"
        ].join("");
      }
      if (window.localStorage.getItem("ambientDogfoodHuman") === "1") {
        whenBodyReady(renderReady);
      } else {
        window.addEventListener("DOMContentLoaded", function () {
          setTimeout(function () {
            window.localStorage.setItem("ambientDogfoodHuman", "1");
            renderReady();
          }, 2200);
        });
      }
    </script>
  </head>
  <body>
    <main>
      <h1>Verify you are human</h1>
      <p>Complete the CAPTCHA-style human verification in the managed browser to continue.</p>
      <p>This is a deterministic human-verification interstitial for Ambient workflow dogfooding.</p>
    </main>
  </body>
</html>`);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/shows`,
    hits,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
