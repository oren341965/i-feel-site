/* i-feel · AS-MADE · מנוע טופס מילוי אונליין ------------------------------ */
(function () {
  "use strict";
  var C = window.AM_CONFIG;
  if (!C) return;
  var LOCK = 'ימולא ע"י I FEEL';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var blocksEl, blockCount = 0;

  function lang() { return document.documentElement.getAttribute("data-lang") || "he"; }
  function bi(he, ar) {                       // רכיב דו-לשוני: מוצג לפי השפה הפעילה
    var w = document.createDocumentFragment();
    var a = el("span", "he", he), b2 = el("span", "ar", ar);
    w.appendChild(a); w.appendChild(b2);
    return w;
  }

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  /* ---------- בניית בלוק בקר ---------- */
  function addBlock() {
    blockCount++;
    var i = blockCount;
    var blk = el("section", "am-blk");
    blk.dataset.blk = i;

    var h = el("div", "am-blk-h");
    var left = el("div");
    var st = el("strong");
    st.appendChild(bi("בקר P" + i + " · " + C.title, "وحدة P" + i + " · " + C.titleAr));
    left.appendChild(st);
    h.appendChild(left);
    var right = el("div");
    right.style.cssText = "display:flex;gap:14px;align-items:center";
    if (C.dataUrl) {                       // קישור למאמר הבקר — רק אם קיים כזה באתר
      var a = el("a");
      a.appendChild(bi("מפרט " + C.mfn + " ›", "مواصفات " + C.mfn + " ›"));
      a.href = C.dataUrl; a.target = "_blank"; a.rel = "noopener";
      right.appendChild(a);
    }
    var rm = el("button", "btn btn-s no-print am-rm");
    rm.appendChild(bi("הסר בקר", "إزالة الوحدة"));
    rm.type = "button";
    rm.style.cssText = "padding:5px 12px;font-size:13px";
    rm.onclick = function () { blk.remove(); renumber(); };
    right.appendChild(rm);
    h.appendChild(right);
    blk.appendChild(h);

    var sc = el("div", "am-scroll");
    var t = el("table", "am-t");
    var thead = el("thead"), tr = el("tr");
    C.cols.forEach(function (c) {
      var th = el("th");
      th.appendChild(document.createTextNode(c.he));
      var s = el("span", "sub", c.ar);
      th.appendChild(s);
      tr.appendChild(th);
    });
    thead.appendChild(tr); t.appendChild(thead);

    var tb = el("tbody");
    for (var ch = 1; ch <= C.channels; ch++) {
      var row = el("tr");
      row.dataset.ch = ch;
      C.cols.forEach(function (c, ci) {
        var td = el("td");
        if (c.type === "lock") {
          td.className = "lk"; td.textContent = LOCK;
          td.title = "שדה של I FEEL — נקבע בשלב התכנות ב-ETS";
        } else if (c.type === "auto") {
          td.className = "fx";
          td.textContent = c.key === "ch" ? ch : (c.key === "out" ? "A" + ch : "בקר P" + i);
          td.dataset.key = c.key;
        } else if (c.type === "select") {
          var sel = el("select");
          sel.name = c.key; sel.dataset.key = c.key;
          sel.appendChild(new Option("", ""));
          (C.lists[c.list] || []).forEach(function (o) { sel.appendChild(new Option(o, o)); });
          td.appendChild(sel);
        } else {
          var inp = el("input");
          inp.type = c.type === "num" ? "number" : "text";
          if (c.type === "num") { inp.min = "0"; inp.step = "1"; }
          inp.name = c.key; inp.dataset.key = c.key;
          inp.autocomplete = "off";
          inp.dataset.phHe = c.ph || ""; inp.dataset.phAr = c.phAr || c.ph || "";
          inp.placeholder = (lang() === "ar" ? inp.dataset.phAr : inp.dataset.phHe);
          td.appendChild(inp);
        }
        row.appendChild(td);
      });
      tb.appendChild(row);
    }
    t.appendChild(tb); sc.appendChild(t); blk.appendChild(sc);
    blocksEl.appendChild(blk);
    renumber();
  }

  function renumber() {
    var blks = blocksEl.querySelectorAll(".am-blk");
    blockCount = blks.length;
    blks.forEach(function (b, idx) {
      var n = idx + 1;
      b.dataset.blk = n;
      var st = $(".am-blk-h strong", b);
      $(".he", st).textContent = "בקר P" + n + " · " + C.title;
      $(".ar", st).textContent = "وحدة P" + n + " · " + C.titleAr;
      b.querySelectorAll('td.fx[data-key="pnl"]').forEach(function (td) {
        td.textContent = "בקר P" + n;
      });
      var rm = b.querySelector(".am-rm");
      if (rm) rm.style.display = blks.length > 1 ? "" : "none";
    });
    $("#am-blkcount").textContent = blockCount;
  }

  /* ---------- איסוף נתונים ---------- */
  function collect() {
    var head = {};
    document.querySelectorAll("#am-head [data-key]").forEach(function (f) {
      head[f.dataset.key] = f.value.trim();
    });
    var rows = [];
    blocksEl.querySelectorAll(".am-blk").forEach(function (b) {
      var p = b.dataset.blk;
      b.querySelectorAll("tbody tr").forEach(function (tr) {
        var r = { pnl: "בקר P" + p, ch: tr.dataset.ch, out: "A" + tr.dataset.ch };
        var filled = false;
        tr.querySelectorAll("[data-key]").forEach(function (f) {
          if (f.tagName === "TD") return;
          var v = (f.value || "").trim();
          r[f.dataset.key] = v;
          if (v) filled = true;
        });
        r._filled = filled;
        rows.push(r);
      });
    });
    return { code: C.code, title: C.title, channels: C.channels, kind: C.kind,
             cols: C.cols, head: head, rows: rows };
  }

  function validate() {
    var miss = [];
    document.querySelectorAll("#am-head [data-key][required]").forEach(function (f) {
      if (!f.value.trim()) { miss.push(f.dataset.label); f.style.borderColor = "#b42318"; }
      else f.style.borderColor = "";
    });
    var d = collect();
    if (!d.rows.some(function (r) { return r._filled; }))
      miss.push("לפחות ערוץ אחד מלא");
    return miss;
  }

  function msg(kind, text) {
    var m = $("#am-msg");
    m.className = "am-msg " + kind;
    m.textContent = text;
    m.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ---------- טיוטה ---------- */
  function saveDraft() {
    var d = collect();
    var name = "טיוטה_AS-MADE_" + C.code + "_" +
      (d.head.project || "ללא-שם").replace(/[\\/:*?"<>|]/g, "-") + ".json";
    var blob = new Blob([JSON.stringify(d, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
    msg("ok", "הטיוטה נשמרה כקובץ במחשב. אפשר להעלות אותה חזרה בכל רגע בכפתור “טעינת טיוטה”.");
  }

  function loadDraft(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var d = JSON.parse(fr.result);
        if (d.code !== C.code)
          return msg("er", "הטיוטה שייכת לבקר אחר (" + (d.title || d.code) + "). פתח/י את הדף של אותו בקר.");
        document.querySelectorAll("#am-head [data-key]").forEach(function (f) {
          if (d.head && d.head[f.dataset.key] != null) f.value = d.head[f.dataset.key];
        });
        blocksEl.innerHTML = ""; blockCount = 0;
        var need = Math.max(1, new Set(d.rows.map(function (r) { return r.pnl; })).size);
        for (var i = 0; i < need; i++) addBlock();
        var blks = blocksEl.querySelectorAll(".am-blk");
        d.rows.forEach(function (r) {
          var bi = parseInt(String(r.pnl).replace(/\D/g, ""), 10) - 1;
          var b = blks[bi]; if (!b) return;
          var tr = b.querySelector('tbody tr[data-ch="' + r.ch + '"]'); if (!tr) return;
          tr.querySelectorAll("[data-key]").forEach(function (f) {
            if (f.tagName === "TD") return;
            if (r[f.dataset.key] != null) f.value = r[f.dataset.key];
          });
        });
        msg("ok", "הטיוטה נטענה. אפשר להמשיך למלא.");
      } catch (e) { msg("er", "לא הצלחתי לקרוא את קובץ הטיוטה."); }
    };
    fr.readAsText(file);
  }

  /* ---------- שליחה ---------- */
  function submit() {
    var miss = validate();
    if (miss.length) return msg("er", "חסרים שדות חובה: " + miss.join(", "));
    var d = collect();
    d.rows = d.rows.filter(function (r) { return r._filled; });
    d.ts = new Date().toISOString();
    d.hp = $("#am-hp").value;                     // מלכודת ספאם
    var btn = $("#am-send");
    btn.disabled = true; btn.textContent = "שולח…";
    fetch(C.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=utf-8" },
      body: JSON.stringify(d)
    })
      .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
      .then(function (j) {
        if (j && j.ok) {
          var who = "הטופס נשלח ל-I FEEL — שיין, קיריל ואורה קיבלו אותו. עותק נשלח גם אליך במייל";
          who += (j.copies && j.copies >= 3) ? ", וגם ללקוח. תודה!" : ". תודה!";
          msg("ok", who);
          btn.textContent = "נשלח ✓";
        } else {
          btn.disabled = false; btn.textContent = "שליחה ל-I FEEL";
          msg("er", (j && j.error) || "השליחה נכשלה. שמור/י טיוטה ונסה/י שוב, או שלח/י את הקובץ למייל sales@i-feel.co.il");
        }
      })
      .catch(function () {
        btn.disabled = false; btn.textContent = "שליחה ל-I FEEL";
        msg("er", "אין חיבור לשרת. שמור/י טיוטה בכפתור “שמירת טיוטה” ונסה/י שוב מאוחר יותר.");
      });
  }

  /* ---------- אתחול ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    blocksEl = $("#am-blocks");
    addBlock();
    $("#am-add").onclick = function () {
      if (blockCount >= 12) return msg("er", "מקסימום 12 בקרים בטופס אחד.");
      addBlock();
    };
    $("#am-send").onclick = submit;
    $("#am-print").onclick = function () { window.print(); };
    $("#am-save").onclick = saveDraft;
    $("#am-loadbtn").onclick = function () { $("#am-load").click(); };
    $("#am-load").onchange = function () { if (this.files[0]) loadDraft(this.files[0]); };
    document.querySelectorAll(".am-lang button").forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll(".am-lang button").forEach(function (x) {
          x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
        document.documentElement.setAttribute("data-lang", b.dataset.lang);
        document.documentElement.dir = "rtl";
        var ar = b.dataset.lang === "ar";
        document.querySelectorAll("input[data-ph-he]").forEach(function (f) {
          f.placeholder = ar ? f.dataset.phAr : f.dataset.phHe;
        });
      };
    });
    window.addEventListener("beforeunload", function (e) {
      var d = collect();
      if (d.rows.some(function (r) { return r._filled; }) && !$("#am-send").disabled) {
        e.preventDefault(); e.returnValue = "";
      }
    });
  });
})();
