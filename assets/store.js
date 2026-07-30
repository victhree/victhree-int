/* VicThree SSB Interview Trainer — storage layer.
   ------------------------------------------------------------------
   Everything the candidate produces (psychology analyses, Perception
   Report, PIQ, interview plan, transcript and final assessment) lives
   in localStorage, namespaced by a local "profile" (a name).

   This is deliberately the ONLY module that touches storage, so the
   whole app can later be moved to Firebase / Supabase by re-implementing
   this same surface (createProfile / data / save / the get-set helpers)
   against a real backend. Nothing else in the app calls localStorage.
   ------------------------------------------------------------------ */
(function () {
  "use strict";

  var PROFILES_KEY = "v3iv_profiles";   // JSON array of profile names
  var ACTIVE_KEY   = "v3iv_active";     // active profile name
  var DATA_PREFIX  = "v3iv_data_";      // + slug -> JSON blob

  function slug(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "profile";
  }
  function readJSON(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }
  function nowISO() { return new Date().toISOString(); }

  function emptyData(name) {
    return {
      name: name,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      analyses: {},     // AI analysis per test { WAT:{...}, ... } (may lag or fail)
      responses: {},    // raw responses per test { WAT:{items,savedAt}, ... } — the source of truth for "test taken"
      report: null,     // consolidated Perception Report
      piq: null,        // PIQ form JSON
      plan: null,       // interview plan
      interview: {      // dynamic interview state
        history: [],    // [{q,a,seconds,targets}]
        done: false,
        started: false
      },
      assessment: null  // final Interview Analysis
    };
  }

  var Store = {
    /* ---------- profiles ---------- */
    listProfiles: function () { return readJSON(PROFILES_KEY, []); },
    activeProfile: function () { try { return localStorage.getItem(ACTIVE_KEY) || null; } catch (e) { return null; } },
    setActiveProfile: function (name) { try { localStorage.setItem(ACTIVE_KEY, name); } catch (e) {} return name; },

    createProfile: function (name) {
      name = String(name || "").trim();
      if (!name) return null;
      var list = Store.listProfiles();
      var existing = null;
      for (var i = 0; i < list.length; i++) { if (list[i].toLowerCase() === name.toLowerCase()) { existing = list[i]; break; } }
      if (!existing) {
        list.push(name);
        writeJSON(PROFILES_KEY, list);
        writeJSON(DATA_PREFIX + slug(name), emptyData(name));
      }
      Store.setActiveProfile(existing || name);
      return existing || name;
    },

    deleteProfile: function (name) {
      var list = Store.listProfiles().filter(function (n) { return n !== name; });
      writeJSON(PROFILES_KEY, list);
      try { localStorage.removeItem(DATA_PREFIX + slug(name)); } catch (e) {}
      if (Store.activeProfile() === name) {
        try { localStorage.removeItem(ACTIVE_KEY); } catch (e) {}
      }
    },

    /* ---------- the active profile's data blob ---------- */
    data: function () {
      var name = Store.activeProfile();
      if (!name) return null;
      var d = readJSON(DATA_PREFIX + slug(name), null);
      if (!d) { d = emptyData(name); writeJSON(DATA_PREFIX + slug(name), d); }
      // migrate older/partial blobs so every field exists
      var base = emptyData(name);
      for (var k in base) { if (!(k in d)) d[k] = base[k]; }
      if (!d.interview) d.interview = base.interview;
      return d;
    },
    save: function (d) {
      var name = Store.activeProfile(); if (!name || !d) return false;
      d.updatedAt = nowISO();
      return writeJSON(DATA_PREFIX + slug(name), d);
    },

    /* ---------- generic get/set on the active profile ---------- */
    get: function (key) { var d = Store.data(); return d ? d[key] : undefined; },
    set: function (key, val) { var d = Store.data(); if (!d) return false; d[key] = val; return Store.save(d); },

    /* ---------- psychology analyses ---------- */
    saveAnalysis: function (test, data) {
      var d = Store.data(); if (!d) return false;
      d.analyses[test] = data;
      return Store.save(d);
    },
    getAnalyses: function () { var d = Store.data(); return d ? (d.analyses || {}) : {}; },
    // shape the worker's REPORT mode expects: [{test:"TAT", data:{...}}, ...]
    analysesList: function () {
      var a = Store.getAnalyses(), out = [];
      for (var t in a) { if (a[t]) out.push({ test: t, data: a[t] }); }
      return out;
    },

    /* ---------- raw responses (saved the instant a test finishes) ---------- */
    saveResponses: function (test, items) {
      var d = Store.data(); if (!d) return false;
      if (!d.responses) d.responses = {};
      d.responses[test] = { items: items, savedAt: nowISO() };
      return Store.save(d);
    },
    getResponses: function () { var d = Store.data(); return d ? (d.responses || {}) : {}; },
    // A test counts as "taken" if it has EITHER saved responses OR an analysis.
    testsTaken: function () {
      var d = Store.data(); if (!d) return [];
      var a = d.analyses || {}, r = d.responses || {}, out = [];
      ["PPDT", "TAT", "WAT", "SRT", "SDT"].forEach(function (k) { if (a[k] || r[k]) out.push(k); });
      return out;
    },
    // Tests that were taken but whose AI analysis never saved (slow/failed fetch),
    // so the report builder can backfill them from the saved responses.
    missingAnalyses: function () {
      var d = Store.data(); if (!d) return [];
      var a = d.analyses || {}, r = d.responses || {}, out = [];
      for (var k in r) { if (r[k] && r[k].items && r[k].items.length && !a[k]) out.push({ test: k, items: r[k].items }); }
      return out;
    },

    /* ---------- Perception Report ---------- */
    setReport: function (r) { return Store.set("report", r); },
    getReport: function () { return Store.get("report"); },

    /* ---------- PIQ ---------- */
    setPiq: function (p) { return Store.set("piq", p); },
    getPiq: function () { return Store.get("piq"); },

    /* ---------- interview plan ---------- */
    setPlan: function (p) { return Store.set("plan", p); },
    getPlan: function () { return Store.get("plan"); },

    /* ---------- interview transcript ---------- */
    getInterview: function () { var d = Store.data(); return d ? d.interview : null; },
    setInterview: function (iv) { return Store.set("interview", iv); },
    pushTurn: function (turn) {
      var d = Store.data(); if (!d) return false;
      d.interview.history.push(turn);
      d.interview.started = true;
      return Store.save(d);
    },
    resetInterview: function () {
      var d = Store.data(); if (!d) return false;
      d.interview = { history: [], done: false, started: false };
      d.assessment = null;
      return Store.save(d);
    },

    /* ---------- final assessment ---------- */
    setAssessment: function (a) { return Store.set("assessment", a); },
    getAssessment: function () { return Store.get("assessment"); },

    /* ---------- journey progress (drives the tracker) ---------- */
    progress: function () {
      var d = Store.data();
      var TESTS = ["PPDT", "TAT", "WAT", "SRT", "SDT"];
      if (!d) return { tests: 0, testsTotal: TESTS.length, report: false, piq: false, interview: "none", assessment: false };
      var done = Store.testsTaken().length;
      var iv = "none";
      if (d.assessment) iv = "done";
      else if (d.interview && d.interview.history && d.interview.history.length) iv = "in-progress";
      return {
        tests: done,
        testsTotal: TESTS.length,
        report: !!d.report,
        piq: !!d.piq,
        interview: iv,
        assessment: !!d.assessment
      };
    }
  };

  window.V3Store = Store;
})();
