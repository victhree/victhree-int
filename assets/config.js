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

  // Interview defaults (confirmed): ~25 questions, 75s each, ~30 min.
  interview: {
    maxQuestions: 20,
    secondsPerQuestion: 150
  }
};
