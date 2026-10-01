/* VicThree SSB Interview Trainer — site config.
   ----------------------------------------------------------------
   All AI (psychology analysis, Perception Report, the Interviewing
   Officer, and the final Interview Analysis) runs through a Cloudflare
   Worker that holds the Gemini API key as a secret. The website never
   sees the key.

   THIS SITE USES ITS OWN, SEPARATE WORKER (Option A) so it never touches
   the live victhree-ssb worker. Create a new Worker, paste in
   worker/worker.js from THIS repo, add a GEMINI_API_KEY secret, deploy,
   then paste that new Worker's URL between the quotes below, e.g.
       aiEndpoint: "https://victhree-iv-ai.yourname.workers.dev"

   Until you paste it, aiEndpoint stays "" and AI is OFF: the psychology
   trainers still run, but the Perception Report, interview and analysis
   show a "not configured" note. Set the URL to finish the full journey.
   ---------------------------------------------------------------- */
window.VICTHREE_CONFIG = {
  // Dedicated interview-trainer Worker (Option A).
  aiEndpoint: "https://flat-lab-c707victhree-int.anmolxsharma.workers.dev",

  // Course portal (login wall). Only portal students (tier "course") may use
  // this site. The same signed token works across all VicThree sites.
  portalEndpoint: "https://victhree-portal.anmolxsharma.workers.dev",
  courseUrl: "https://victhreedefence.com",

  // Interview defaults: ~20 questions, 2:30 each (a per-question maximum).
  interview: {
    maxQuestions: 20,
    secondsPerQuestion: 150
  }
};
