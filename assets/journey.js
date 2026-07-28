/* VicThree SSB Interview Trainer — shared journey UI.
   Renders the 5-step progress tracker (Tests -> Report -> PIQ ->
   Interview -> Assessment) and guards pages that need a profile.

   A page opts in with:
     <nav id="journey" class="journey" data-base="../" data-current="report"></nav>
   where data-base is "" at the site root and "../" one level deep,
   and data-current is one of: tests | report | piq | interview | assessment.
*/
(function () {
  "use strict";
  var Store = window.V3Store;

  // The Perception Report is now built silently and is not a candidate-facing
  // step: the psychology analysis is revealed only in the final Report, after
  // the interview. Journey: Tests -> PIQ -> Interview -> Report.
  var STEPS = [
    { key: "tests",     label: "Tests",     href: "tests/index.html" },
    { key: "piq",       label: "PIQ",       href: "piq/index.html" },
    { key: "interview", label: "Interview", href: "interview/index.html" },
    { key: "report",    label: "Report",    href: "report/index.html" }
  ];

  function stateFor(key, p) {
    if (key === "tests")     return p.tests >= p.testsTotal ? "done" : (p.tests > 0 ? "partial" : "");
    if (key === "piq")       return p.piq ? "done" : "";
    if (key === "interview") return p.interview === "done" ? "done" : (p.interview === "in-progress" ? "partial" : "");
    if (key === "report")    return p.assessment ? "done" : "";
    return "";
  }
  function dotFor(key, st, idx) {
    if (st === "done") return "✓"; // check
    return String(idx + 1);
  }

  function renderTracker() {
    var nav = document.getElementById("journey");
    if (!nav || !Store) return;
    var base = nav.getAttribute("data-base") || "";
    var current = nav.getAttribute("data-current") || "";
    var p = Store.progress();
    nav.innerHTML = "";
    STEPS.forEach(function (s, i) {
      var st = stateFor(s.key, p);
      var a = document.createElement("a");
      a.className = "jstep" + (st ? " " + st : "") + (s.key === current ? " active" : "");
      a.href = base + s.href;
      var dot = document.createElement("span");
      dot.className = "jdot";
      dot.textContent = dotFor(s.key, st, i);
      var lab = document.createElement("span");
      lab.className = "jlabel";
      lab.textContent = s.label;
      a.appendChild(dot); a.appendChild(lab);
      nav.appendChild(a);
    });
  }

  // Redirect to the login/dashboard if no profile is active.
  function requireProfile(base) {
    if (!Store || !Store.activeProfile()) {
      window.location.href = (base || "") + "index.html";
      return false;
    }
    return true;
  }

  window.V3Journey = {
    STEPS: STEPS,
    renderTracker: renderTracker,
    requireProfile: requireProfile
  };

  document.addEventListener("DOMContentLoaded", renderTracker);
})();
