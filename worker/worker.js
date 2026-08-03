/* VicThree SSB Interview Trainer — Gemini Worker (Cloudflare)
   ------------------------------------------------------------------
   Holds the Gemini API key as a SECRET so it is never exposed in the
   public website. The site POSTs here; this Worker calls Gemini and
   returns structured JSON.

   MODES
     Psychology battery : WAT | SRT | SDT | TAT | PPDT | GPE
                          -> { summary, olqs_reflected, olqs_to_work_on, items }
     REPORT             : merge all test analyses into one Perception Report
                          -> { summary, olqs_strong, olqs_to_work_on, probe_areas, temperament }
     IV / action:"plan" : build an interview plan from PIQ + report
                          -> { focus_areas, piq_hotspots, notes }
     IV / action:"next" : next adaptive interview question
                          -> { done:false, question, targets:[] }  |  { done:true }
     IV / action:"assess": grade the whole transcript
                          -> { summary, olqs_reflected, olqs_to_work_on, consistency, items }

   SETUP: same as the main site. Create a Worker, paste this code, add a
   Secret GEMINI_API_KEY, and put the Worker URL in assets/config.js.
   Both victhree.github.io sites share one origin, so ALLOWED_ORIGINS
   already covers this repo.
   ------------------------------------------------------------------ */

const ALLOWED_ORIGINS = [
  "https://victhree.github.io",
  "http://localhost:8099",
  "http://127.0.0.1:8099"
];

const MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-3-flash-preview",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite"
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "Use POST" }, 405, cors);
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ error: "Origin not allowed" }, 403, cors);

    let payload;
    try { payload = await request.json(); }
    catch (e) { return json({ error: "Invalid JSON" }, 400, cors); }

    if (!env.GEMINI_API_KEY) return json({ error: "Server not configured (missing GEMINI_API_KEY)" }, 500, cors);

    const mode = payload && payload.mode;

    try {
      if (mode === "REPORT") return await handleReport(payload, env, cors);
      if (mode === "IV")     return await handleInterview(payload, env, cors);
      return await handlePsychology(payload, env, cors);
    } catch (e) {
      return json({ error: "Worker error", detail: String(e && e.message || e) }, 500, cors);
    }
  }
};

/* ================= shared Gemini caller ================= */
async function callGemini(env, contents, temperature) {
  const body = {
    contents: contents,
    generationConfig: { temperature: (temperature == null ? 0.6 : temperature), responseMimeType: "application/json" }
  };
  let text = null, usedModel = null, lastErr = "";
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
    let res;
    try {
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) { lastErr = "fetch failed for " + model; continue; }
    if (!res.ok) { const t = await res.text(); lastErr = model + " -> " + res.status + ": " + t.slice(0, 400); continue; }
    const data = await res.json();
    const t = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
              data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
              data.candidates[0].content.parts[0].text;
    if (t) { text = t; usedModel = model; break; }
    lastErr = "empty response from " + model;
  }
  if (!text) return { error: "All models failed", detail: lastErr };
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { parsed = { summary: text }; }
  if (parsed && typeof parsed === "object") parsed._model = usedModel;
  return { parsed: parsed };
}
function textContents(str) { return [{ role: "user", parts: [{ text: str }] }]; }

/* ================= psychology battery ================= */
async function handlePsychology(payload, env, cors) {
  const mode = (payload && (payload.mode === "SRT" || payload.mode === "SDT" || payload.mode === "TAT" || payload.mode === "PPDT" || payload.mode === "GPE")) ? payload.mode : "WAT";
  const items = Array.isArray(payload && payload.items) ? payload.items.slice(0, 80) : [];
  if (!items.length) return json({ error: "No items" }, 400, cors);
  const out = await callGemini(env, buildContents(mode, items), 0.6);
  if (out.error) return json(out, 502, cors);
  return json(out.parsed, 200, cors);
}

/* ================= REPORT (consolidated Perception Report) ================= */
async function handleReport(payload, env, cors) {
  const analyses = Array.isArray(payload && payload.analyses) ? payload.analyses : [];
  if (!analyses.length) return json({ error: "No analyses" }, 400, cors);
  const out = await callGemini(env, textContents(buildReportPrompt(analyses)), 0.5);
  if (out.error) return json(out, 502, cors);
  return json(out.parsed, 200, cors);
}

function buildReportPrompt(analyses) {
  const blocks = analyses.map(function (a) {
    const d = a.data || {};
    const lines = [];
    lines.push("### " + (a.test || "Test") + " analysis");
    if (d.summary) lines.push("Summary: " + d.summary);
    if (d.olqs_reflected && d.olqs_reflected.length) lines.push("OLQs reflected: " + d.olqs_reflected.join("; "));
    if (d.olqs_to_work_on && d.olqs_to_work_on.length) lines.push("OLQs to work on: " + d.olqs_to_work_on.join("; "));
    return lines.join("\n");
  });
  return [
    "You are an experienced, fair SSB (Services Selection Board) psychologist writing a consolidated Perception Report on a candidate.",
    "You are given the separate analyses of the candidate's psychology tests (some of PPDT, TAT, WAT, SRT, SDT). Merge them into ONE coherent personality and Officer-Like-Quality (OLQ) profile. Look for patterns that repeat across tests, and note where tests disagree.",
    "There are no official correct answers; judge temperament, emotional stability, consistency and officer potential, not memorised technique.",
    "",
    "The 15 OLQs are: effective intelligence, reasoning ability, organising ability, power of expression, social adaptability, cooperation, sense of responsibility, initiative, self-confidence, speed of decision, ability to influence the group, liveliness, determination, courage, and stamina.",
    "",
    "Return ONLY valid JSON with this exact shape:",
    "{",
    '  "summary": "a 4-6 sentence consolidated personality analysis in the voice of an SSB psychologist: dominant temperament, emotional stability, recurring themes across the tests, and overall officer potential",',
    '  "olqs_strong": ["<OLQ name> — the pattern of evidence across tests"],',
    '  "olqs_to_work_on": ["<OLQ name> — a concise, actionable note"],',
    '  "probe_areas": ["a specific thing an interviewing officer should probe or verify, phrased as a note to the officer"],',
    '  "temperament": "a short phrase capturing the candidate\'s core temperament (e.g. \'calm, practical team-player who avoids confrontation\')"',
    "}",
    "List 3-6 strong OLQs, 2-4 to work on, and 3-6 probe areas. Base everything ONLY on the analyses below; do not invent facts.",
    "",
    "=== Test analyses ===",
    blocks.join("\n\n")
  ].join("\n");
}

/* ================= IV (dynamic interview) ================= */
async function handleInterview(payload, env, cors) {
  const action = payload && payload.action;
  if (action === "plan")      return await ivPlan(payload, env, cors);
  if (action === "questions") return await ivQuestions(payload, env, cors);
  if (action === "followup")  return await ivFollowup(payload, env, cors);
  if (action === "next")      return await ivNext(payload, env, cors);
  if (action === "assess")    return await ivAssess(payload, env, cors);
  return json({ error: "Unknown IV action" }, 400, cors);
}

function piqText(piq) {
  if (!piq || typeof piq !== "object") return "(PIQ not provided)";
  // Compact, human-readable rendering of the PIQ so the model can reason over it.
  const parts = [];
  const push = function (label, val) {
    if (val == null || val === "" || (Array.isArray(val) && !val.length)) return;
    if (Array.isArray(val)) val = val.filter(Boolean).join(", ");
    parts.push(label + ": " + val);
  };
  push("Name", piq.name);
  push("Father's occupation", piq.fatherOccupation);
  push("Mother's occupation", piq.motherOccupation);
  push("Family monthly income", piq.familyIncome);
  push("Siblings", piq.siblings);
  push("Home district/state", [piq.district, piq.state].filter(Boolean).join(", "));
  push("Background", piq.backgroundType);
  push("Date of birth", piq.dob);
  push("Age", piq.age);
  push("Height/Weight", [piq.height, piq.weight].filter(Boolean).join(" / "));
  push("Mother tongue", piq.motherTongue);
  if (Array.isArray(piq.education) && piq.education.length) {
    const edu = piq.education.map(function (e) {
      return [e.level, e.institution, e.board, e.year, (e.percentage != null && e.percentage !== "" ? e.percentage + "%" : ""), e.medium, e.boarderOrDayScholar]
        .filter(Boolean).join(", ");
    });
    push("Education", edu.join(" | "));
  }
  push("Current occupation", piq.currentOccupation);
  push("Current income", piq.currentIncome);
  push("Games/Sports", piq.games);
  push("Hobbies", piq.hobbies);
  push("Extracurricular", piq.extracurricular);
  push("Positions of responsibility", piq.positionsOfResponsibility);
  if (piq.ncc && (piq.ncc.have || piq.ncc.wing || piq.ncc.certificate)) {
    push("NCC", [piq.ncc.have ? "Yes" : "", piq.ncc.wing, piq.ncc.certificate].filter(Boolean).join(", "));
  }
  push("Commissions applied for", piq.commissionsAppliedFor);
  push("Attempts so far", piq.attemptsSoFar);
  push("Service preference", piq.servicesChosenPreference);
  return parts.join("\n");
}

function reportText(report) {
  if (!report || typeof report !== "object") return "(Perception Report not available)";
  const p = [];
  if (report.summary) p.push("Summary: " + report.summary);
  if (report.temperament) p.push("Temperament: " + report.temperament);
  if (report.olqs_strong && report.olqs_strong.length) p.push("Strong OLQs: " + report.olqs_strong.join("; "));
  if (report.olqs_to_work_on && report.olqs_to_work_on.length) p.push("OLQs to work on: " + report.olqs_to_work_on.join("; "));
  if (report.probe_areas && report.probe_areas.length) p.push("Areas to probe: " + report.probe_areas.join("; "));
  return p.join("\n");
}

const IV_OFFICER = [
  "You are an experienced, warm-but-rigorous Interviewing Officer conducting an SSB (Services Selection Board) personal interview.",
  "You are NOT a chatbot and must never refer to yourself as an assistant or AI. You are the interviewing officer.",
  "Your job is to understand the REAL candidate: judge honesty, self-awareness, consistency and Officer-Like Qualities (OLQs), not 'right answers'.",
  "You probe. You follow up on thin, vague, evasive or memorised answers. You dig into claimed hobbies, games, achievements and positions of responsibility to see if they are real and lived. You cross-check answers against the PIQ and the psychologist's Perception Report and gently press on any inconsistency.",
  "You are not hostile and never rude, but you are not easily satisfied. Keep questions natural and conversational, the way a real board officer speaks.",
  "The 15 OLQs are: effective intelligence, reasoning ability, organising ability, power of expression, social adaptability, cooperation, sense of responsibility, initiative, self-confidence, speed of decision, ability to influence the group, liveliness, determination, courage, and stamina."
].join("\n");

// Applied to every question the candidate actually hears. The report guides WHAT
// you ask, but the candidate must never learn what is being assessed.
const IV_NO_LEAK = [
  "CRITICAL, how to phrase questions: use the Perception Report only SILENTLY to decide what to probe. NEVER reveal, quote, paraphrase or hint at the psychology/perception report, the candidate's OLQs, or which quality you are testing.",
  "Do NOT say things like 'as per your psychology report', 'your report shows', 'your profile suggests', 'this tests your ...', or name any OLQ or trait in the question. No meta-commentary about assessment. Each question must sound like a natural thing an officer would simply ask a candidate."
].join("\n");

// The client asks these two itself, so the model must not (avoids duplicates).
const IV_RESERVED = [
  "Two topics are RESERVED and asked separately, so you must NOT ask them in ANY form or wording:",
  "(1) the candidate's motivation for joining, in any phrasing, e.g. 'why do you want to join the armed forces', 'what attracts/draws you to the Army/Navy/Air Force', 'why do you want to be an officer', 'why this service', 'what made you choose a defence career';",
  "(2) what the candidate would do if they are NOT recommended or NOT selected, e.g. 'what if you don't clear', 'what is your backup plan if not selected', 'what will you do if you fail'.",
  "Do not ask either topic or any reworded version of it."
].join(" ");

async function ivPlan(payload, env, cors) {
  const prompt = [
    IV_OFFICER,
    "",
    "Before the interview, prepare a private plan. Read the candidate's PIQ and Perception Report and decide what this particular interview should focus on and verify.",
    "",
    "Return ONLY valid JSON with this exact shape:",
    "{",
    '  "focus_areas": ["theme to explore across the interview, e.g. leadership in college, family responsibility"],',
    '  "piq_hotspots": ["a specific PIQ fact worth digging into or verifying, e.g. \'claims district-level football but no position of responsibility in sport\'"],',
    '  "notes": "2-3 sentences to yourself on how to run this interview and what would confirm or break the picture from the Perception Report"',
    "}",
    "List 4-7 focus_areas and 4-8 piq_hotspots. Base everything ONLY on the material below.",
    "",
    "=== PIQ ===",
    piqText(payload.piq),
    "",
    "=== Perception Report ===",
    reportText(payload.report)
  ].join("\n");
  const out = await callGemini(env, textContents(prompt), 0.5);
  if (out.error) return json(out, 502, cors);
  return json(out.parsed, 200, cors);
}

// Batch of plan-based questions the officer can ask without waiting on any one
// answer. These give the interview its "no loading between questions" flow.
async function ivQuestions(payload, env, cors) {
  const count = Math.min(20, Math.max(1, payload.count || 10));
  const plan = payload.plan || {};
  const planText = [
    plan.focus_areas && plan.focus_areas.length ? "Focus areas: " + plan.focus_areas.join("; ") : "",
    plan.piq_hotspots && plan.piq_hotspots.length ? "PIQ hotspots: " + plan.piq_hotspots.join("; ") : "",
    plan.notes ? "Notes: " + plan.notes : ""
  ].filter(Boolean).join("\n");
  const avoid = Array.isArray(payload.avoid) ? payload.avoid.filter(Boolean) : [];

  const prompt = [
    IV_OFFICER,
    "",
    IV_NO_LEAK,
    "",
    "Prepare a set of " + count + " interview questions to ask this candidate, drawn from the PIQ, the Perception Report and your plan. These are your opening/base questions; you will add follow-ups live as the candidate answers.",
    "Rules:",
    "- Each item is exactly ONE question in your own spoken words.",
    "- No two questions may be duplicates or light rewordings of each other.",
    "- Do NOT ask anything already listed under 'Already asked' below.",
    "- " + IV_RESERVED,
    "- Cover a MIX and order them naturally: begin with rapport/personal, then PIQ facts (family, education, hobbies, games, positions of responsibility), then situational/judgement, and one or two current-affairs or opinion questions.",
    "- Ground them in this candidate's specific PIQ and profile, not generic filler.",
    "- The 'targets' field is for internal use only and is never shown to the candidate; the 'question' text itself must contain no hint of it.",
    "",
    "Return ONLY valid JSON with this exact shape:",
    '{ "questions": [ { "question": "the question in the officer\'s words", "targets": ["PIQ:hobbies","OLQ:initiative"] } ] }',
    "targets is a short list (1-3) using tags like PIQ:<field>, OLQ:<quality>, CONSISTENCY, RAPPORT, CURRENT-AFFAIRS.",
    "",
    "=== PIQ ===",
    piqText(payload.piq),
    "",
    "=== Perception Report ===",
    reportText(payload.report),
    "",
    "=== Your interview plan ===",
    planText || "(no plan provided)",
    "",
    "=== Already asked (do NOT repeat these) ===",
    avoid.length ? avoid.map(function (q, i) { return (i + 1) + ". " + q; }).join("\n") : "(nothing yet)"
  ].join("\n");

  const out = await callGemini(env, textContents(prompt), 0.8);
  if (out.error) return json(out, 502, cors);
  return json(out.parsed, 200, cors);
}

// Analyse ONE answer and, if it is thin/evasive/inconsistent or opens an
// interesting thread, return a single follow-up to be asked later.
async function ivFollowup(payload, env, cors) {
  const turn = payload.turn || {};
  const history = Array.isArray(payload.history) ? payload.history : [];
  const hist = history.map(function (h, i) {
    return "Q" + (i + 1) + ": " + h.q + "\nA" + (i + 1) + ": " + (h.a && h.a.trim() ? h.a : "[no answer / stayed silent]");
  }).join("\n\n");

  const prompt = [
    IV_OFFICER,
    "",
    IV_NO_LEAK,
    "",
    "You have just heard the candidate's answer below. Silently assess it. Decide whether it is worth ONE follow-up question later in the interview.",
    "Ask a follow-up when the answer was thin, vague, evasive, memorised, or when it is inconsistent with the PIQ, the Perception Report or an earlier answer, or when it opens a genuinely interesting thread worth digging into. If the answer was clear, complete and consistent, do NOT force one.",
    "The follow-up must be a single question in your own words, must not repeat anything already asked, and should probe the specific thing that stood out. " + IV_RESERVED,
    "",
    "Return ONLY valid JSON, exactly one of:",
    '  { "followup": true, "question": "the follow-up question", "targets": ["OLQ:...","CONSISTENCY"] }',
    '  { "followup": false }',
    "",
    "=== PIQ ===",
    piqText(payload.piq),
    "",
    "=== Perception Report ===",
    reportText(payload.report),
    "",
    "=== The answer to assess ===",
    "Officer asked: " + (turn.q || "(unknown)"),
    "Candidate answered (" + (turn.seconds != null ? turn.seconds + "s" : "?") + "): " + (turn.a && turn.a.trim() ? turn.a : "[no answer / stayed silent]"),
    "",
    "=== Interview so far (do not repeat any of these) ===",
    hist || "(this is the first answer)"
  ].join("\n");

  const out = await callGemini(env, textContents(prompt), 0.7);
  if (out.error) return json(out, 502, cors);
  return json(out.parsed, 200, cors);
}

async function ivNext(payload, env, cors) {
  const history = Array.isArray(payload.history) ? payload.history : [];
  const askedCount = (payload.askedCount != null) ? payload.askedCount : history.length;
  const maxQuestions = payload.maxQuestions || 25;

  // Hard stop client-side too, but let the model also decide it is done.
  if (askedCount >= maxQuestions) return json({ done: true }, 200, cors);

  const hist = history.map(function (h, i) {
    return "Q" + (i + 1) + " (officer): " + h.q + "\nA" + (i + 1) + " (candidate, " + (h.seconds != null ? h.seconds + "s" : "?") + "): " + (h.a && h.a.trim() ? h.a : "[no answer / stayed silent]");
  }).join("\n\n");

  const plan = payload.plan || {};
  const planText = [
    plan.focus_areas && plan.focus_areas.length ? "Focus areas: " + plan.focus_areas.join("; ") : "",
    plan.piq_hotspots && plan.piq_hotspots.length ? "PIQ hotspots: " + plan.piq_hotspots.join("; ") : "",
    plan.notes ? "Notes: " + plan.notes : ""
  ].filter(Boolean).join("\n");

  const prompt = [
    IV_OFFICER,
    "",
    IV_NO_LEAK,
    "",
    "Ask the NEXT single question in this ongoing interview. Rules:",
    "- Exactly ONE question. Never ask two things at once. Keep it to what a real officer would say out loud.",
    "- Do NOT repeat or lightly reword any question already asked. Move the interview forward.",
    "- " + IV_RESERVED,
    "- Adapt: if the last answer was thin, vague, evasive or inconsistent, follow up on it. If it was solid, move to a new area from the plan.",
    "- Mix over the whole interview: rapport/personal, PIQ facts (family, education, hobbies, games, positions of responsibility), situational/judgement, and one or two current-affairs or opinion questions.",
    "- Cross-check against the PIQ and the Perception Report; probe any inconsistency between what the candidate just said and those.",
    "- This is question number " + (askedCount + 1) + " of about " + maxQuestions + ". Early questions build rapport; the middle digs into PIQ and OLQs; near the end, tie up loose threads.",
    "",
    "Return ONLY valid JSON. Either:",
    '  { "done": false, "question": "the next question, in the officer\'s own words", "targets": ["PIQ:hobbies", "OLQ:initiative"] }',
    "or, if the plan is well covered and there is nothing useful left to ask:",
    '  { "done": true }',
    "targets is a short list (1-3) of what this question is testing, using tags like PIQ:<field>, OLQ:<quality>, CONSISTENCY, RAPPORT, CURRENT-AFFAIRS.",
    "",
    "=== PIQ ===",
    piqText(payload.piq),
    "",
    "=== Perception Report ===",
    reportText(payload.report),
    "",
    "=== Your interview plan ===",
    planText || "(no plan provided)",
    "",
    "=== Interview so far ===",
    hist || "(no questions asked yet — open the interview)"
  ].join("\n");

  const out = await callGemini(env, textContents(prompt), 0.85);
  if (out.error) return json(out, 502, cors);
  return json(out.parsed, 200, cors);
}

async function ivAssess(payload, env, cors) {
  const history = Array.isArray(payload.history) ? payload.history : [];
  const transcript = history.map(function (h, i) {
    return "#" + (i + 1) + " Officer: " + h.q + "\n   Candidate (" + (h.seconds != null ? h.seconds + "s" : "?") + "): " + (h.a && h.a.trim() ? h.a : "[no answer / stayed silent]");
  }).join("\n\n");

  const prompt = [
    IV_OFFICER,
    "",
    "The interview is over. Write an honest, constructive assessment of the candidate based on the full transcript, the PIQ and the Perception Report.",
    "Judge honesty, consistency and OLQs, not 'right answers'. Reward candour and self-awareness; note evasiveness, contradictions and gaps between what the candidate said and their PIQ or Perception Report.",
    "",
    "Return ONLY valid JSON with this exact shape:",
    "{",
    '  "summary": "a 4-6 sentence assessment in the voice of the interviewing officer: how the candidate came across, emotional stability, honesty, and overall officer potential",',
    '  "olqs_reflected": ["<OLQ name> — brief evidence from the interview"],',
    '  "olqs_to_work_on": ["<OLQ name> — brief, actionable note"],',
    '  "consistency": ["a note on whether a specific answer matched or mismatched the PIQ or the Perception Report"],',
    '  "items": [ { "n": <question number>, "prompt": "the question asked", "comment": "one-sentence assessment of the candidate\'s answer", "suggestion": "one sharper, more honest and officer-like way to have answered, WITHOUT inventing new facts about the candidate\'s life" } ]',
    "}",
    "List 3-6 OLQs reflected, 2-4 to work on, and 3-6 consistency notes. Include an items entry for every question answered. Be honest, concise and constructive.",
    "",
    "=== PIQ ===",
    piqText(payload.piq),
    "",
    "=== Perception Report ===",
    reportText(payload.report),
    "",
    "=== Interview transcript ===",
    transcript || "(empty)"
  ].join("\n");

  const out = await callGemini(env, textContents(prompt), 0.5);
  if (out.error) return json(out, 502, cors);
  return json(out.parsed, 200, cors);
}

/* ================= psychology prompt builders (from the main site) ================= */
function buildPrompt(mode, items) {
  if (mode === "SDT") return buildSdtPrompt(items);
  if (mode === "TAT") return buildTatPrompt(items);
  if (mode === "PPDT") return buildPpdtPrompt(items);
  if (mode === "GPE") return buildGpePrompt(items);
  const testName = mode === "SRT" ? "Situation Reaction Test (SRT)" : "Word Association Test (WAT)";
  const lines = items.map(function (it) {
    const label = mode === "SRT" ? `Situation: ${it.prompt}` : `Word: ${it.prompt}`;
    const tag = it.tag ? ` [${it.tag}]` : "";
    return `#${it.n}${tag} — ${label}\n   Response (${it.seconds}s): ${it.response || "[left blank]"}`;
  });
  return [
    `You are an experienced, fair SSB (Services Selection Board) psychologist analysing a candidate's ${testName} responses for Officer-Like Qualities (OLQs).`,
    `Remember: there are NO official "correct" answers. Judge the mindset — positivity, realism, and whether the response protects the mission and group over the self. Do not reward manufactured heroics or artificial positivity.`,
    ``,
    `The 15 OLQs include: effective intelligence, reasoning ability, organising ability, power of expression, social adaptability, cooperation, sense of responsibility, initiative, self-confidence, speed of decision, ability to influence the group, liveliness, determination, courage, and stamina.`,
    ``,
    `Return ONLY valid JSON with this exact shape:`,
    `{`,
    `  "summary": "a 3-5 sentence personality analysis of the candidate in the voice of an SSB psychologist, describing overall temperament, emotional stability and officer potential based on these responses",`,
    `  "olqs_reflected": ["<OLQ name> — brief evidence seen in the responses"],`,
    `  "olqs_to_work_on": ["<OLQ name> — brief, actionable note"],`,
    `  "items": [ { "n": <number>, "prompt": "<the word/situation>", "comment": "one-sentence assessment of this response", "suggestion": "one better alternative response" } ]`,
    `}`,
    `List 3-6 OLQs reflected and 2-4 OLQs to work on, naming actual OLQs from the list. Include an items entry for every response. Be honest, concise and constructive.`,
    ``,
    `=== Candidate's ${mode} responses ===`,
    ...lines
  ].join("\n");
}

function buildSdtPrompt(items) {
  const parts = items.map(function (it) { return `#${it.n} — Prompt: ${it.prompt}\n   Answer: ${it.response || "[left blank]"}`; });
  return [
    `You are an experienced, fair SSB (Services Selection Board) psychologist assessing a candidate's Self-Description Test (SDT), the written self-appraisal from the Day-2 psychology battery.`,
    `In the SDT the candidate describes themselves from up to five viewpoints: (1) their parents, (2) their teachers, superiors or employers, (3) their friends, (4) their own honest opinion, and (5) the kind of person they want to become.`,
    ``,
    `The SDT is a cross-check on the rest of the candidate's personality. Judge it on:`,
    `- Self-awareness and honesty: real, specific evidence rather than stacked adjectives.`,
    `- Balance: genuine strengths paired with at least one moderate, owned, fixable weakness. A flawless self-portrait signals low self-awareness, not strength.`,
    `- Internal consistency: the four outside views and the candidate's own opinion should add up to one coherent person.`,
    `- A forward-looking, actionable fifth part that names concrete steps and, ideally, closes the loop with the weakness the candidate owned.`,
    `- Brevity and clear structure.`,
    `Watch for red flags: manufactured positivity or only-strengths answers, memorised or clichéd template language, self-contradiction between the parts, over-confession, and any disqualifying trait (aggression or short temper, dishonesty, substance use, a habit of quitting). Do not reward pretence, and do not punish an honest, moderate weakness.`,
    ``,
    `The 15 Officer-Like Qualities (OLQs) are: effective intelligence, reasoning ability, organising ability, power of expression, social adaptability, cooperation, sense of responsibility, initiative, self-confidence, speed of decision, ability to influence the group, liveliness, determination, courage, and stamina.`,
    ``,
    `Return ONLY valid JSON with this exact shape:`,
    `{`,
    `  "summary": "a 3-5 sentence personality analysis in the voice of an SSB psychologist: the candidate's self-awareness, emotional maturity, how consistent the five parts are with one another, and overall officer potential",`,
    `  "olqs_reflected": ["<OLQ name> — brief evidence seen in the self-description"],`,
    `  "olqs_to_work_on": ["<OLQ name> — brief, actionable note"],`,
    `  "items": [ { "n": <number>, "prompt": "<short label for the viewpoint, e.g. Parents' opinion>", "comment": "one-sentence assessment of this part: honesty, evidence, balance and consistency", "suggestion": "one sharper, more authentic way to express this part, WITHOUT inventing new facts about the candidate's life" } ]`,
    `}`,
    `List 3-6 OLQs reflected and 2-4 to work on, naming actual OLQs from the list. Include an items entry for every prompt answered. Be honest, concise and constructive.`,
    ``,
    `=== Candidate's Self-Description responses ===`,
    ...parts
  ].join("\n");
}

function tatCriteria() {
  return [
    `You are an experienced, fair SSB (Services Selection Board) psychologist assessing a candidate's Thematic Apperception Test (TAT) stories from the Day-2 psychology battery.`,
    `For each item you are shown the same hazy picture the candidate saw (when a picture is provided) and the short story they wrote around a central "hero". The hero is a projection of the candidate.`,
    ``,
    `IMPORTANT about the picture: TAT pictures are deliberately hazy, blurred and ambiguous, and there is NO correct interpretation. Use the picture ONLY to (a) check the story is plausibly connected to the scene rather than ignoring it entirely, and (b) make your comments and suggestions more grounded and specific. NEVER lower your assessment because the candidate read the picture differently than you would; a creative but plausible reading is fully valid. If no picture is provided for an item, judge the story text alone.`,
    ``,
    `Judge each story on:`,
    `- A clear central hero who takes initiative and actively solves the problem using realistic, available resources (not luck, not rescue by others, not passivity).`,
    `- A positive, believable, action-oriented theme and outcome. Reward realism; do not reward superhuman heroics or manufactured positivity.`,
    `- Complete structure: what led to the situation (past), what is happening now (present), what the hero thinks and feels, and a constructive outcome (result).`,
    `- Officer-Like Qualities shown through the hero's ACTION, not through adjectives.`,
    `Watch for red flags: negative, tragic or hopeless endings; a helpless-victim or passive hero; violence, revenge or aggression; unrealistic heroics; no identifiable hero; purely describing the scene with no story; incomplete stories. Do not punish an honest, ordinary story that is positive and realistic.`,
    ``,
    `The 15 Officer-Like Qualities (OLQs) are: effective intelligence, reasoning ability, organising ability, power of expression, social adaptability, cooperation, sense of responsibility, initiative, self-confidence, speed of decision, ability to influence the group, liveliness, determination, courage, and stamina.`,
    ``,
    `Return ONLY valid JSON with this exact shape:`,
    `{`,
    `  "summary": "a 3-5 sentence personality analysis in the voice of an SSB psychologist: the recurring themes across the stories, the kind of hero the candidate projects, emotional tone, realism, and overall officer potential",`,
    `  "olqs_reflected": ["<OLQ name> — brief evidence seen in the stories"],`,
    `  "olqs_to_work_on": ["<OLQ name> — brief, actionable note"],`,
    `  "items": [ { "n": <number>, "prompt": "<the slide label, e.g. Picture 1>", "comment": "one-sentence assessment of this story: hero, initiative, structure, tone and realism", "suggestion": "one concrete way to make this story stronger and more officer-like, grounded in the picture and what the candidate wrote" } ]`,
    `}`,
    `List 3-6 OLQs reflected and 2-4 to work on, naming actual OLQs from the list. Include an items entry for every story written. Be honest, concise and constructive.`
  ].join("\n");
}
function buildTatPrompt(items) {
  const lines = items.map(function (it) { return `#${it.n} — ${it.prompt}\n   Story: ${it.response || "[left blank]"}`; });
  return tatCriteria() + "\n\n=== Candidate's TAT stories ===\n" + lines.join("\n");
}

function ppdtCriteria() {
  return [
    `You are an experienced, fair SSB (Services Selection Board) assessor evaluating a candidate's Picture Perception and Description Test (PPDT), the Day-1 screening test.`,
    `For each item you are shown the same hazy picture the candidate saw (when a picture is provided), followed by the candidate's typed "Perception" line (number of characters, and the main character's age, sex and mood) and their short hero "Story".`,
    ``,
    `IMPORTANT about the picture: PPDT pictures are deliberately hazy, blurred and ambiguous, and there is NO single correct interpretation. Use the picture ONLY to (a) sanity-check that the perception and story are plausibly connected to the scene, and (b) make your comments and suggestions more grounded. NEVER lower your assessment merely because the candidate perceived the picture differently than you would; a plausible reading is fully valid. If no picture is provided, judge the text alone.`,
    ``,
    `Judge each response on:`,
    `- Perception quality: a clear character count and the main character's age/sex/mood, leaning positive, coherent with the story that follows.`,
    `- One clear, positive, proactive hero who corresponds to the main perceived character (not a group, not a passive victim, not a bystander).`,
    `- A complete cause -> action -> positive, realistic outcome structure, ideally around 80-100 words, with the hero taking initiative and using believable resources.`,
    `- Officer-Like Qualities shown through the hero's ACTION, not adjectives.`,
    `Watch for red flags: negative, violent or tragic themes; a perception-story mismatch (characters or hero that do not match the noted count/details); no single hero or a group story; a passive or rescued hero; unrealistic or superhuman heroics; merely describing the scene; an incomplete story. Do not punish an honest, ordinary story that is positive and realistic.`,
    ``,
    `The 15 Officer-Like Qualities (OLQs) are: effective intelligence, reasoning ability, organising ability, power of expression, social adaptability, cooperation, sense of responsibility, initiative, self-confidence, speed of decision, ability to influence the group, liveliness, determination, courage, and stamina.`,
    ``,
    `Return ONLY valid JSON with this exact shape:`,
    `{`,
    `  "summary": "a 3-5 sentence assessment in the voice of an SSB screening assessor: the candidate's perception positivity, the kind of hero they project, story structure and realism, and whether this reads as screen-in material",`,
    `  "olqs_reflected": ["<OLQ name> — brief evidence seen in the responses"],`,
    `  "olqs_to_work_on": ["<OLQ name> — brief, actionable note"],`,
    `  "items": [ { "n": <number>, "prompt": "<the slide label, e.g. Picture 1>", "comment": "one-sentence assessment: perception coherence, hero, structure, tone and realism", "suggestion": "one concrete way to make this response stronger and more officer-like, grounded in the picture and what the candidate wrote" } ]`,
    `}`,
    `List 3-6 OLQs reflected and 2-4 to work on, naming actual OLQs from the list. Include an items entry for every response. Be honest, concise and constructive.`
  ].join("\n");
}
function buildPpdtPrompt(items) {
  const lines = items.map(function (it) { return `#${it.n} — ${it.prompt}\n   ${it.response || "[left blank]"}`; });
  return ppdtCriteria() + "\n\n=== Candidate's PPDT responses ===\n" + lines.join("\n");
}

function buildGpePrompt(items) {
  const parts = items.map(function (it) {
    const label = it.title ? it.title : ("Scenario " + it.n);
    return `#${it.n} — ${label}\n   Scenario: ${it.prompt}\n   Candidate's plan: ${it.response || "[left blank]"}`;
  });
  return [
    `You are an experienced, fair SSB (Services Selection Board) Group Testing Officer (GTO) assessing a candidate's individual written plan for a Group Planning Exercise (GPE, also called the Military Planning Exercise).`,
    `In the GPE the candidate is given a scenario with several simultaneous problems and limited resources, and about ten minutes to write their own plan before the group discussion. For each item you are given the full scenario and the candidate's plan.`,
    `IMPORTANT: there is no single correct plan. Judge the plan on sound judgement, not on matching one ideal answer. A different but well-justified priority order is fully acceptable.`,
    ``,
    `Judge each plan on:`,
    `- Completeness: did the plan address EVERY problem in the scenario? Missing a problem is a major fault.`,
    `- Prioritisation: is the order sensible (human life in immediate danger first, then a threat to many lives or security, then a single life with some time, then property, then the trivial), and is it justified?`,
    `- Delegation: is the group split into named parties acting in parallel, rather than one hero doing everything?`,
    `- Realism and time: are actions time-bound and physically possible using the stated distances, speeds and deadlines, using ONLY the resources given (no invented phone, vehicle, helicopter or help)?`,
    `- Use of authorities: are the police, hospital, telephone or other given help used where appropriate?`,
    `- Structure and clarity: problems listed, prioritised, party-wise time-bound tasks, and a regroup point.`,
    `Watch for red flags: missing a problem, property before life, no delegation (a solo hero), ignoring time and distance, inventing resources, unrealistic or filmi solutions, illogical group-splitting, contradicting the scenario's facts.`,
    ``,
    `The relevant Officer-Like Qualities (OLQs) include: effective intelligence, reasoning ability, organising ability, power of expression, initiative, self-confidence, speed of decision, determination, and cooperation.`,
    ``,
    `Return ONLY valid JSON with this exact shape:`,
    `{`,
    `  "summary": "a 3-5 sentence assessment in the voice of a GTO: how well the candidate grasped the situation, prioritised human life, delegated and used resources, kept the plan time-bound and realistic, and their overall planning ability",`,
    `  "olqs_reflected": ["<OLQ name> — brief evidence seen in the plan"],`,
    `  "olqs_to_work_on": ["<OLQ name> — brief, actionable note"],`,
    `  "items": [ { "n": <number>, "prompt": "<the scenario title>", "comment": "one-sentence assessment: completeness, prioritisation, delegation, realism and structure", "suggestion": "one concrete way to make this plan stronger and more officer-like, grounded in the scenario" } ]`,
    `}`,
    `List 3-6 OLQs reflected and 2-4 to work on, naming actual OLQs. Include an items entry for every scenario. Be honest, concise and constructive.`,
    ``,
    `=== Candidate's GPE plans ===`,
    ...parts
  ].join("\n");
}

function buildContents(mode, items) {
  const hasImg = Array.isArray(items) && items.some(function (it) { return it && it.image; });
  if ((mode === "TAT" || mode === "PPDT") && hasImg) {
    const parts = [{ text: mode === "PPDT" ? ppdtCriteria() : tatCriteria() }];
    parts.push({ text: mode === "PPDT" ? "\n=== Candidate's PPDT responses ===" : "\n=== Candidate's TAT stories ===" });
    for (const it of items) {
      parts.push({ text: `\n#${it.n} — ${it.prompt}` });
      if (it.image) parts.push({ inline_data: { mime_type: it.mimeType || "image/jpeg", data: it.image } });
      else parts.push({ text: "(no picture available for this item)" });
      parts.push({ text: mode === "PPDT" ? (it.response || "[left blank]") : ("Story: " + (it.response || "[left blank]")) });
    }
    return [{ role: "user", parts }];
  }
  return [{ role: "user", parts: [{ text: buildPrompt(mode, items) }] }];
}

/* ================= http helpers ================= */
function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, cors || {})
  });
}
