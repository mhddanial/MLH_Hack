You are my senior full-stack AI engineer, product designer, and hackathon strategist.

We are building a project for the following hackathon. Read this brief carefully before proposing architecture, writing code, or creating the demo plan.

EVENT: Hacktoberfest Hack Day Kota Batam x Batam Innovation Center
DATE: Saturday, 31 October 2026
TIME: 11:00 AM–4:00 PM WIB
REGISTRATION: 10:00 AM
BUILD START: 11:00 AM
BUILD END: 3:00 PM
DEMOS START: 3:00 PM
EVENT END: 4:00 PM
FORMAT: In-person, one-day hackathon
VENUE: State Polytechnic Batam, Jl. Ahmad Yani, Level 2, Technopreneur Centre, Kota Batam, Kepulauan Riau 29461, Indonesia
ORGANIZERS: Batam Innovation Center, with support from Batam State Polytechnic and Major League Hacking (MLH)

SOURCE: Official MLH event page:
https://events.mlh.com/events/15059-hacktoberfest-hack-day-kota-batam-x-batam-innovation-center

CORE HACKATHON FOCUS

The event asks participants to build with open-source or open-weight AI and submit through OrganizerHQ Challenges.

There are two relevant prize categories:

1. Best Open-Source AI Project
- Build an original project that uses open-source or open-weight AI as an important part of how it works.
- Acceptable approaches include an agent skill, an application powered by an open-weight large or small language model, or building/adapting an open-source model harness.
- Prize: Exclusive Hacktoberfest 2026 Winner DEV Badge and MLH Swag Bag.

2. Best Use of Gemma 4
- Build with Gemma 4, Google’s lightweight open-weights model.
- Gemma 4 is multimodal and can work with text and images.
- It can be accessed through the Gemini API.
- The event encourages focused AI tools for learning, creativity, productivity, or community.
- The event emphasizes rapid prototyping: move from idea to working prototype.

OUR CHOSEN PROJECT

Project name: AOI-Lite Batam

Project type: Human-in-the-loop, AI-assisted SMT/PCB inspection and quality-record system.

Target users:
- QC inspectors at Batam Tier-2/Tier-3 electronics suppliers.
- SMK electronics/manufacturing teachers and students.
- Small PCBA manufacturers that need low-cost inspection assistance.

Core problem:
Manual PCB inspection is slow, inconsistent, and poorly documented. Full AOI systems can be expensive and still generate false calls that require operator verification.

Solution:
Use Gemma 4 multimodal capabilities to analyze a PCB image and generate a structured inspection result. The inspector then confirms, corrects, rejects, or escalates the AI suggestion. The final result is saved as a traceable quality record.

Important positioning:
AOI-Lite Batam is an inspection-assist and quality-documentation tool. It is NOT a replacement for certified AOI, SPI, X-ray, functional testing, or final quality release.

MVP USER FLOW

1. Inspector opens the web app.
2. Inspector selects a sample PCB image or captures/uploads an image.
3. Inspector enters/selects metadata: board ID, board revision, line/station, operator ID, inspection type.
4. App sends the image and metadata to Gemma 4 through the Gemini API.
5. Gemma 4 returns structured JSON containing suspected defects, confidence, location hint, evidence, severity, and recommended action.
6. App displays the AI-suggested result.
7. Inspector confirms, edits, rejects, or escalates each result.
8. App saves the final human-verified record.
9. App allows CSV/JSON export.
10. Simple dashboard shows inspection count, defect distribution, and pending human reviews.

MVP DEFECT TAXONOMY

Use only these six classes:

1. missing_component
2. solder_bridge
3. polarity_error
4. tombstoning
5. component_shift
6. uncertain_or_other

Do not attempt to detect hidden defects such as BGA voids, head-in-pillow, or internal solder defects. Those require X-ray inspection.

REQUIRED JSON OUTPUT SCHEMA

{
  "board_id": "string",
  "inspection_id": "string",
  "image_quality": "acceptable | poor | unusable",
  "defects": [
    {
      "defect_class": "missing_component | solder_bridge | polarity_error | tombstoning | component_shift | uncertain_or_other",
      "location_hint": "string",
      "confidence": 0.0,
      "severity": "low | medium | high",
      "evidence": "string",
      "recommended_action": "string"
    }
  ],
  "overall_disposition": "pass | requires_human_verification | rework | quarantine | escalate",
  "model": "gemma-4-multimodal",
  "operator_confirmation_required": true
}

AI RULES

- Gemma 4 must be central to the product, not a cosmetic feature.
- Use image input plus a structured inspection prompt.
- Request JSON-only output.
- Validate JSON before saving.
- If JSON parsing fails, retry once; if it still fails, route to manual entry.
- Never allow the AI alone to issue a final pass/fail disposition.
- Always label AI output as “AI-suggested” until a human confirms it.
- Route low-confidence results to human verification.
- Do not invent defect classes outside the six allowed categories.
- Do not claim production-grade AOI accuracy.

HUMAN-IN-THE-LOOP RULES

- The inspector must be able to accept, edit, reject, or escalate every AI suggestion.
- Store both the original AI output and the final human decision.
- Record whether the human agreed or disagreed with the AI.
- Use rejected AI flags as feedback for improving prompts, thresholds, and reference examples.
- Final quality disposition must always be human-confirmed.

HACKATHON RULES WE MUST FOLLOW

1. Team size:
- Minimum 1 person, maximum 2 people.
- Each team member must register individually.
- One team member submits the project.

2. Work period:
- All project work must be done during the hackathon period.
- We may use an idea conceived before the event.
- We may work on an idea that has been done before.
- We may use libraries, frameworks, and open-source code.
- We may work on a prior idea, but we must not reuse code or other project materials from prior work.
- Pre-building a project and open-sourcing it solely to use it during the event is not allowed.

3. AI tools:
- AI coding assistants are allowed.
- We must honestly and transparently disclose AI tools used in the project submission.
- We should be prepared to answer questions about which AI tools were used.

4. Code and submission:
- Code must be publicly available, ideally in a Git repository.
- Code must remain public after the event to remain eligible for prizes.
- If the repository and video are not public, new winners may be selected.

5. Demo video:
- For MLH digital-event submission rules, teams must submit a demo video of 2 minutes or less.
- The video must be created during the hackathon weekend.
- The video must remain public after the event.
- The video must state the hackathon name at the beginning.
- Example opening: “Hi, I’m [name], and this is my demo for Hacktoberfest Hack Day Kota Batam x Batam Innovation Center.”

6. Demos:
- Live demos are strongly encouraged at physical events.
- Pitches and presentations are discouraged.
- Judges focus on what was built, not presentation quality.
- We should demo even if the project is incomplete or partially broken.
- Completion is only one part of judging.

7. Time limit:
- We must stop hacking at 3:00 PM.
- After time ends, only debugging and small fixes are allowed.
- Large changes or new features after time ends are not allowed.

JUDGING CRITERIA

Judges weigh four criteria equally:

1. Technology
- How technically impressive is the hack?
- Was the technical problem difficult?
- Did it use a clever technique or multiple components?
- Did the technology create a “wow” factor?

2. Design
- Did the team consider user experience?
- Is the interface well designed?
- Is human-computer interaction easy and useful?

3. Completion
- Does the hack work?
- Did the team achieve what it intended?

4. Learning
- Did the team stretch itself?
- Did it try something new?
- Did it learn new skills or explore a new type of project?

Judging does NOT primarily reward:
- Clean or production-ready code.
- Pitching quality.
- Originality of the idea.
- How well the project solves a problem.

Therefore, our priority is:
- A working, visible demo.
- Strong use of Gemma 4 multimodal image understanding.
- A clean and practical inspector workflow.
- A clear explanation of what we learned.
- Honest disclosure of AI tools used.

HACKATHON-ALIGNED PRODUCT SCOPE

Build only this for the live demo:

- Web-based inspection assistant.
- Image upload and camera capture.
- Sample-image gallery for reliable demonstration.
- PCB metadata form.
- Gemma 4 multimodal API integration.
- Strict JSON validation.
- AI result display with confidence and evidence.
- Human confirmation workflow.
- Final inspection record storage.
- CSV/JSON export.
- Minimal dashboard.
- Public GitHub repository.
- README with setup instructions, architecture, model information, prompt version, and license.
- MIT or Apache-2.0 license.
- Backup recorded demo.

DO NOT BUILD UNLESS CORE DEMO IS COMPLETE

- Authentication system.
- Complex database.
- MES/ERP integration.
- Real-time factory-line integration.
- Multi-camera hardware integration.
- Model fine-tuning.
- Advanced analytics.
- Production deployment infrastructure.
- Autonomous pass/fail release decisions.

TECH STACK PREFERENCE

Use the fastest reliable stack:

- Frontend & Backend (SPA): Unified Next.js (App Router, React, TypeScript, Tailwind CSS, Serverless API Routes).
- Deployment: Vercel (unified Next.js frontend + API backend).
- AI: Gemma 4 through Gemini API.
- Storage: Supabase (PostgreSQL) with local JSON fallback for offline resilience.
- Export: CSV and JSON.
- Demo: localhost or simple cloud deployment.

Prioritize reliability, demo completeness, and clear Gemma 4 integration over complex architecture.

FOUR-HOUR BUILD PLAN

11:00 AM–11:30 AM:
- Initialize repository.
- Create README, license, folder structure, and environment variables.
- Finalize UI wireframe and sample-image set.

11:30 AM–12:30 PM:
- Build image upload/camera UI.
- Build sample-image selector.
- Build metadata form.
- Create result and review screens.

12:30 PM–1:30 PM:
- Integrate Gemma 4 through Gemini API.
- Implement strict inspection prompt.
- Implement JSON parsing and validation.
- Implement confidence threshold and human-review routing.

1:30 PM–2:30 PM:
- Implement human confirmation.
- Save final inspection record.
- Add CSV/JSON export.
- Add minimal dashboard.

2:30 PM–3:00 PM:
- Test with sample images.
- Fix critical bugs only.
- Record backup demo video.
- Finalize README and repository.
- Rehearse a 90-second live demo.

DEMO SCRIPT

Use this 90-second structure:

1. Problem: “PCB inspection in smaller Batam suppliers and SMK labs is manual, slow, and hard to document.”
2. Solution: “AOI-Lite Batam uses Gemma 4 to turn a PCB photo into a structured inspection record.”
3. Live demo: Select sample PCB image → run Gemma 4 → show suspected defect → human confirms or rejects → export record.
4. Safety: “This assists inspectors; it does not replace certified AOI, X-ray, or functional testing.”
5. Technology: Explain Gemma 4 multimodal image analysis, JSON output, confidence threshold, and human-in-the-loop design.
6. Learning: Explain prompt engineering, structured output validation, and inspection-workflow design.

IMPORTANT DISCLOSURES FOR SUBMISSION

In the project submission, clearly list:
- Project name: AOI-Lite Batam.
- Hackathon: Hacktoberfest Hack Day Kota Batam x Batam Innovation Center.
- Prize categories entered: Best Open-Source AI Project and Best Use of Gemma 4.
- AI model: Gemma 4 via Gemini API.
- AI coding tools used, such as ChatGPT, Claude, Cursor, GitHub Copilot, Perplexity, or other agents.
- Public GitHub repository URL.
- Public demo video URL.
- License type.
- Sample-data source and confirmation that no confidential production data were used.

BEFORE CODING, DO THE FOLLOWING

1. Summarize this hackathon brief in 10 concise bullets.
2. Confirm the two prize categories we should target.
3. Propose a minimum viable architecture for a two-person, four-hour build.
4. Propose the final folder structure.
5. Propose the exact Gemma 4 prompt for PCB inspection.
6. Propose fallback behavior if the Gemini API, internet, or camera fails.
7. Identify the highest-risk features that could prevent a working demo.
8. Then begin building the MVP in the order specified above.