import type { AppThirdPartyCredit } from "../../shared/desktopTypes";

export interface LambdaRlmThirdPartyCreditSource {
  commit: string;
  paper: string;
  repository: string;
}

const MIT_PERMISSION_NOTICE =
  "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files " +
  '(the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, ' +
  "distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, " +
  "subject to the following conditions:\n\n" +
  "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.";

const MIT_WARRANTY_NOTICE =
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF ' +
  "MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY " +
  "CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE " +
  "SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.";

function mitLicenseText(copyrightNotice: string): string {
  return ["MIT License", copyrightNotice, MIT_PERMISSION_NOTICE, MIT_WARRANTY_NOTICE].join("\n\n");
}

const APACHE_2_LICENSE_TEXT = [
  "Apache License",
  "Version 2.0, January 2004",
  "https://www.apache.org/licenses/",
  "",
  "Licensed under the Apache License, Version 2.0 (the \"License\"); you may not use this file except in compliance with the License.",
  "You may obtain a copy of the License at https://www.apache.org/licenses/LICENSE-2.0",
  "Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an \"AS IS\" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.",
  "See the License for the specific language governing permissions and limitations under the License.",
].join("\n");

export function thirdPartyCredits(lambdaRlmSource: LambdaRlmThirdPartyCreditSource): AppThirdPartyCredit[] {
  const piCopyrightNotice = "Copyright (c) 2025 Mario Zechner";
  const lambdaRlmCopyrightNotice = "Copyright (c) 2026 Lambda-RLM Contributors";
  const toolHiveCopyrightNotice = "Copyright ToolHive contributors";
  const tencentMemoryCopyrightNotice = "Copyright (C) 2026 Tencent. All rights reserved.";

  return [
    {
      name: "Pi Agent",
      license: "MIT",
      repository: "https://github.com/earendil-works/pi",
      licenseUrl: "https://github.com/earendil-works/pi/blob/main/LICENSE",
      authors: "Mario Zechner and Pi contributors",
      copyrightNotice: piCopyrightNotice,
      licenseText: mitLicenseText(piCopyrightNotice),
      description: "Ambient integrates Pi's coding agent and LLM abstraction packages.",
      notice: "Published packages currently include @mariozechner/pi-ai and @mariozechner/pi-coding-agent.",
    },
    {
      name: "Lambda-RLM",
      license: "MIT",
      repository: lambdaRlmSource.repository,
      paper: lambdaRlmSource.paper,
      licenseUrl: `${lambdaRlmSource.repository}/blob/main/LICENSE`,
      authors: "Lambda-RLM Contributors; Amartya Roy, Rasul Tutunov, Xiaotong Ji, Matthieu Zimmer, Haitham Bou-Ammar",
      copyrightNotice: lambdaRlmCopyrightNotice,
      licenseText: mitLicenseText(lambdaRlmCopyrightNotice),
      description: "TypeScript port/adaptation of the Lambda-RLM long-context reasoning runtime.",
      notice: `Adapted from lambda-calculus-LLM/lambda-RLM at commit ${lambdaRlmSource.commit}.`,
    },
    {
      name: "TencentDB Agent Memory",
      license: "MIT",
      repository: "https://github.com/TencentCloud/TencentDB-Agent-Memory",
      licenseUrl: "https://github.com/TencentCloud/TencentDB-Agent-Memory/blob/main/LICENSE",
      authors: "TencentDB Agent Memory Team and TencentDB Agent Memory contributors",
      copyrightNotice: tencentMemoryCopyrightNotice,
      licenseText: mitLicenseText(tencentMemoryCopyrightNotice),
      description: "Ambient adapts TencentDB Agent Memory for the experimental local agent memory system.",
      notice:
        "Reviewed vendor subtree under vendor/tencentdb-agent-memory, pinned from TencentCloud/TencentDB-Agent-Memory at commit a21ef3f66aebd549dcccc63084c572231b62d245 with Ambient package-boundary patches documented in AMBIENT_PATCHES.md.",
    },
    {
      name: "ToolHive",
      license: "Apache-2.0",
      repository: "https://github.com/stacklok/toolhive",
      licenseUrl: "https://github.com/stacklok/toolhive/blob/main/LICENSE",
      authors: "ToolHive contributors",
      copyrightNotice: toolHiveCopyrightNotice,
      licenseText: APACHE_2_LICENSE_TEXT,
      description: "Ambient bundles ToolHive's thv runtime binary for MCP server containment and lifecycle management.",
      notice: "Bundled under resources/toolhive with license and notice files under resources/third-party-notices/toolhive.",
    },
  ];
}

export function thirdPartyCreditAboutText(credit: AppThirdPartyCredit): string {
  return [
    credit.name,
    credit.description,
    credit.authors ? `Authors: ${credit.authors}` : undefined,
    credit.copyrightNotice,
    `License: ${credit.license}`,
    credit.repository ? `Repository: ${credit.repository}` : undefined,
    credit.paper ? `Paper: ${credit.paper}` : undefined,
    credit.licenseUrl ? `License URL: ${credit.licenseUrl}` : undefined,
    credit.notice,
    credit.licenseText ? `\n${credit.licenseText}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}
