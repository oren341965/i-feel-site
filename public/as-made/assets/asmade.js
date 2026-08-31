/* i-feel · AS-MADE · מנוע טופס מילוי אונליין ------------------------------ */
(function () {
  "use strict";
  var C = window.AM_CONFIG;
  if (!C) return;
  var LOCK = 'ימולא ע"י I FEEL';
  var SHUT_LOAD = "תריס / וילון";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var blocksEl, blockCount = 0, uploaded = null;

  function lang() { return document.documentElement.getAttribute("data-lang") || "he"; }
  function bi(he, ar) {
    var f = document.createDocumentFragment();
    f.appendChild(el("span", "he", he)); f.appendChild(el("span", "ar", ar));
    return f;
  }
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function sel(list, val) {
    var s = document.createElement("select");
    s.appendChild(new Option("", ""));
    (list || []).forEach(function (o) { s.appendChild(new Option(o, o)); });
    if (val) s.value = val;
    return s;
  }

  /* ================= בניית בלוק בקר ================= */
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
    right.style.cssText = "display:flex;gap:14px;align-items:center;flex-wrap:wrap";
    var mapBtn = el("button", "btn btn-s no-print am-mapbtn");
    mapBtn.type = "button";
    mapBtn.style.cssText = "padding:5px 12px;font-size:13px";
    mapBtn.appendChild(bi("מפת יציאות", "خريطة المخارج"));
    mapBtn.onclick = function () { toggleMap(blk); };
    right.appendChild(mapBtn);
    if (C.dataUrl) {
      var a = el("a");
      a.appendChild(bi("מפרט " + C.mfn + " ›", "مواصفات " + C.mfn + " ›"));
      a.href = C.dataUrl; a.target = "_blank"; a.rel = "noopener";
      right.appendChild(a);
    }
    var rm = el("button", "btn btn-s no-print am-rm");
    rm.type = "button";
    rm.style.cssText = "padding:5px 12px;font-size:13px";
    rm.appendChild(bi("הסר בקר", "إزالة الوحدة"));
    rm.onclick = function () { blk.remove(); renumber(); };
    right.appendChild(rm);
    h.appendChild(right);
    blk.appendChild(h);

    /* ---- מפת יציאות ---- */
    var map = el("div", "am-map no-print");
    map.hidden = true;
    map.innerHTML =
      '<p class="am-map-note"><span class="he">מה שאתה ממלא בטבלה מופיע כאן לפי סדר המהדקים בבקר. ' +
      'זו מפת יציאות לצורך בקרה — לתרשים החיווט הרשמי ראה את מפרט היצרן.</span>' +
      '<span class="ar">ما تعبّئه في الجدول يظهر هنا حسب ترتيب المشابك. هذه خريطة مخارج للمراجعة — ' +
      'لمخطط التوصيل الرسمي راجع مواصفات الشركة المصنّعة.</span></p>';
    var grid = el("div", "am-map-grid");
    map.appendChild(grid);
    blk.appendChild(map);

    /* ---- טבלה ---- */
    var sc = el("div", "am-scroll");
    var t = el("table", "am-t");
    var thead = el("thead"), tr = el("tr");
    C.cols.forEach(function (c) {
      var th = el("th");
      th.appendChild(document.createTextNode(c.he));
      th.appendChild(el("span", "sub", c.ar));
      tr.appendChild(th);
    });
    thead.appendChild(tr); t.appendChild(thead);

    var tb = el("tbody");
    for (var ch = 1; ch <= C.channels; ch++) tb.appendChild(buildRow(ch, i));
    t.appendChild(tb); sc.appendChild(t); blk.appendChild(sc);

    blocksEl.appendChild(blk);
    if (C.kind === "pair") $$("select[data-key='pmode']", blk).forEach(applyMode);
    renumber(); refreshMap(blk);
    return blk;
  }

  function buildRow(ch, blkNo) {
    var paired = C.kind === "pair";
    var odd = ch % 2 === 1;
    var row = el("tr");
    row.dataset.ch = ch;
    if (paired) { row.dataset.pair = Math.ceil(ch / 2); row.dataset.first = odd ? "1" : "0"; }

    C.cols.forEach(function (c) {
      // בבקר זוגות: התאים המשותפים נבנים רק בשורה הראשונה של הזוג
      if (paired && c.span === "pair" && !odd) return;
      var td = el("td");
      if (paired && c.span === "pair") td.rowSpan = 2;

      if (c.type === "lock") {
        td.className = "lk"; td.textContent = LOCK;
        td.title = "שדה של I FEEL — נקבע בשלב התכנות ב-ETS";
      } else if (c.type === "auto") {
        td.className = "fx";
        td.textContent = c.key === "ch" ? ch
                       : c.key === "out" ? "A" + ch
                       : c.key === "pair" ? "זוג " + Math.ceil(ch / 2)
                       : "בקר P" + blkNo;
        td.dataset.key = c.key;
      } else if (c.type === "select") {
        var s = sel(C.lists[c.list]);
        s.name = c.key; s.dataset.key = c.key;
        if (c.key === "pmode") { s.className = "am-pmode"; s.onchange = function () { applyMode(s); }; }
        td.appendChild(s);
      } else {
        var inp = el("input");
        inp.type = c.type === "num" ? "number" : "text";
        if (c.type === "num") { inp.min = "0"; inp.step = "1"; }
        inp.name = c.key; inp.dataset.key = c.key;
        inp.autocomplete = "off";
        inp.dataset.phHe = c.ph || ""; inp.dataset.phAr = c.phAr || c.ph || "";
        inp.placeholder = lang() === "ar" ? inp.dataset.phAr : inp.dataset.phHe;
        td.appendChild(inp);
      }
      row.appendChild(td);
    });
    return row;
  }

  /* ---------- כלל הזוגות: תאורה או תריס, בלי לערבב ---------- */
  function applyMode(modeSel) {
    var a = modeSel.closest("tr");
    var b = a.nextElementSibling;
    if (!b) return;
    var isShut = /תריס/.test(modeSel.value);
    var on = modeSel.value !== "";

    [a, b].forEach(function (r, idx) {
      var load = $("select[data-key='load']", r);
      var act  = $("select[data-key='action']", r);
      var room = $("input[data-key='room']", r);
      var desc = $("input[data-key='desc']", r);
      if (isShut) {
        if (load) { load.value = SHUT_LOAD; load.disabled = true; load.classList.add("am-auto"); }
        if (act) {
          act.value = idx === 0 ? "עלייה" : "ירידה";
          act.disabled = true; act.classList.add("am-auto");
        }
        if (idx === 1) {                       // הערוץ השני = אותו תריס
          [room, desc].forEach(function (f) {
            if (!f) return;
            f.disabled = true; f.classList.add("am-auto"); f.placeholder = "";
            f.value = (f === room ? $("input[data-key='room']", a) : $("input[data-key='desc']", a)).value;
          });
        }
      } else {
        [load, act].forEach(function (f) {
          if (!f) return;
          if (f.disabled) f.value = "";
          f.disabled = false; f.classList.remove("am-auto");
        });
        [room, desc].forEach(function (f) {
          if (!f) return;
          f.disabled = false; f.classList.remove("am-auto");
          f.placeholder = lang() === "ar" ? f.dataset.phAr : f.dataset.phHe;
        });
      }
    });

    a.classList.toggle("am-pair-shut", isShut);
    b.classList.toggle("am-pair-shut", isShut);
    a.classList.toggle("am-pair-set", on);
    b.classList.toggle("am-pair-set", on);
    refreshMap(a.closest(".am-blk"));
  }

  // שכפול חדר/תיאור לערוץ השני של זוג תריס
  function mirrorPair(input) {
    var r = input.closest("tr");
    if (!r || r.dataset.first !== "1") return;
    var mode = $("select[data-key='pmode']", r);
    if (!mode || !/תריס/.test(mode.value)) return;
    var b = r.nextElementSibling;
    if (!b) return;
    var twin = $("[data-key='" + input.dataset.key + "']", b);
    if (twin) twin.value = input.value;
  }

  /* ================= מפת יציאות ================= */
  function toggleMap(blk) {
    var m = $(".am-map", blk);
    m.hidden = !m.hidden;
    if (!m.hidden) refreshMap(blk);
  }
  function refreshMap(blk) {
    if (!blk) return;
    var grid = $(".am-map-grid", blk);
    if (!grid) return;
    grid.innerHTML = "";
    $$("tbody tr", blk).forEach(function (r) {
      var ch = r.dataset.ch;
      var room = ($("input[data-key='room']", r) || {}).value || "";
      var desc = ($("input[data-key='desc']", r) || {}).value || "";
      var act  = ($("select[data-key='action']", r) || {}).value || "";
      var cell = el("div", "am-map-cell");
      if (r.classList.contains("am-pair-shut")) cell.classList.add("shut");
      if (room || desc) cell.classList.add("filled");
      cell.appendChild(el("span", "t", "A" + ch));
      cell.appendChild(el("span", "r", room || "—"));
      cell.appendChild(el("span", "d", desc || (act ? act : "לא בשימוש")));
      if (act && r.classList.contains("am-pair-shut")) {
        cell.appendChild(el("span", "a", act));
      }
      grid.appendChild(cell);
    });
  }

  function renumber() {
    var blks = $$(".am-blk", blocksEl);
    blockCount = blks.length;
    blks.forEach(function (b, idx) {
      var n = idx + 1;
      b.dataset.blk = n;
      var st = $(".am-blk-h strong", b);
      $(".he", st).textContent = "בקר P" + n + " · " + C.title;
      $(".ar", st).textContent = "وحدة P" + n + " · " + C.titleAr;
      $$('td.fx[data-key="pnl"]', b).forEach(function (td) { td.textContent = "בקר P" + n; });
      var rm = $(".am-rm", b);
      if (rm) rm.style.display = blks.length > 1 ? "" : "none";
    });
    $("#am-blkcount").textContent = blockCount;
  }

  /* ================= איסוף ובדיקה ================= */
  function collect() {
    var head = {};
    $$("#am-head [data-key]").forEach(function (f) { head[f.dataset.key] = f.value.trim(); });
    var rows = [];
    $$(".am-blk", blocksEl).forEach(function (b) {
      var p = b.dataset.blk;
      $$("tbody tr", b).forEach(function (tr) {
        var r = { pnl: "בקר P" + p, ch: tr.dataset.ch, out: "A" + tr.dataset.ch };
        if (tr.dataset.pair) r.pair = "זוג " + tr.dataset.pair;
        var src = tr.dataset.first === "0" ? tr.previousElementSibling : tr;
        var filled = false;
        $$("[data-key]", tr).forEach(function (f) {
          if (f.tagName === "TD") return;
          var v = (f.value || "").trim();
          r[f.dataset.key] = v;
          if (v && f.dataset.key !== "pmode") filled = true;
        });
        // בשורה השנייה של זוג — מושכים את השדות המשותפים מהשורה הראשונה
        if (tr.dataset.first === "0" && src) {
          $$("[data-key]", src).forEach(function (f) {
            if (f.tagName === "TD") return;
            if (r[f.dataset.key] === undefined) r[f.dataset.key] = (f.value || "").trim();
          });
        }
        r._filled = filled;
        rows.push(r);
      });
    });
    return { code: C.code, title: C.title, mfn: C.mfn, order: C.order,
             channels: C.channels, kind: C.kind, cols: C.cols, head: head, rows: rows };
  }

  function validate() {
    var miss = [];
    $$("#am-head [data-key][required]").forEach(function (f) {
      if (!f.value.trim()) { miss.push(f.dataset.label); f.style.borderColor = "#b42318"; }
      else f.style.borderColor = "";
    });
    var d = collect();
    if (!d.rows.some(function (r) { return r._filled; })) miss.push("לפחות ערוץ אחד מלא");
    // כלל הזוגות
    if (C.kind === "pair") {
      $$("tbody tr[data-first='1']", blocksEl).forEach(function (r) {
        var m = $("select[data-key='pmode']", r);
        var any = ["room", "desc", "load", "action"].some(function (k) {
          return ($("[data-key='" + k + "']", r) || {}).value ||
                 ($("[data-key='" + k + "']", r.nextElementSibling) || {}).value;
        });
        if (any && (!m || !m.value)) {
          miss.push("מצב הזוג בערוץ " + r.dataset.ch);
          if (m) m.style.borderColor = "#b42318";
        } else if (m) m.style.borderColor = "";
      });
    }
    return miss;
  }

  function msg(kind, text) {
    var m = $("#am-msg");
    m.className = "am-msg " + kind;
    m.textContent = text;
    m.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /* ================= טיוטה ================= */
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
          return msg("er", "הטיוטה שייכת לבקר אחר (" + (d.title || d.code) + ").");
        $$("#am-head [data-key]").forEach(function (f) {
          if (d.head && d.head[f.dataset.key] != null) f.value = d.head[f.dataset.key];
        });
        blocksEl.innerHTML = ""; blockCount = 0;
        var need = Math.max(1, new Set(d.rows.map(function (r) { return r.pnl; })).size);
        for (var i = 0; i < need; i++) addBlock();
        var blks = $$(".am-blk", blocksEl);
        // קודם מצבי הזוגות, אחר כך שאר השדות
        d.rows.forEach(function (r) { fillRow(blks, r, true); });
        d.rows.forEach(function (r) { fillRow(blks, r, false); });
        blks.forEach(refreshMap);
        msg("ok", "הטיוטה נטענה. אפשר להמשיך למלא.");
      } catch (e) { msg("er", "לא הצלחתי לקרוא את קובץ הטיוטה."); }
    };
    fr.readAsText(file);
  }

  function fillRow(blks, r, modeOnly) {
    var bi2 = parseInt(String(r.pnl).replace(/\D/g, ""), 10) - 1;
    var b = blks[bi2]; if (!b) return;
    var tr = $('tbody tr[data-ch="' + r.ch + '"]', b); if (!tr) return;
    $$("[data-key]", tr).forEach(function (f) {
      if (f.tagName === "TD") return;
      var k = f.dataset.key;
      if (modeOnly !== (k === "pmode")) return;
      if (r[k] == null) return;
      if (f.disabled && k !== "pmode") return;
      f.value = r[k];
      if (k === "pmode") applyMode(f);
    });
  }

  /* ================= קליטת פירוט הפעלות מיצרן הלוחות ================= */
  /* פרסר CSV מקומי — בלי תלות ברשת. מזהה מפריד, מרכאות ו-BOM. */
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    var head = text.split("\n").slice(0, 5).join("\n");
    var counts = { ",": 0, ";": 0, "\t": 0 };
    Object.keys(counts).forEach(function (d) {
      counts[d] = (head.split(d).length - 1);
    });
    var D = Object.keys(counts).reduce(function (a, b) { return counts[b] > counts[a] ? b : a; }, ",");
    var rows = [], cur = [], val = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { val += '"'; i++; } else q = false; }
        else val += c;
      } else if (c === '"') { q = true; }
      else if (c === D) { cur.push(val); val = ""; }
      else if (c === "\n") { cur.push(val); rows.push(cur); cur = []; val = ""; }
      else val += c;
    }
    if (val !== "" || cur.length) { cur.push(val); rows.push(cur); }
    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ""; });
    });
  }

  var SHEETJS = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  function withSheetJS(cb) {
    if (window.XLSX) return cb();
    var s = document.createElement("script");
    s.src = SHEETJS;
    s.onload = cb;
    s.onerror = function () { msg("er", "לא הצלחתי לטעון את מנוע קריאת הקבצים. בדוק חיבור לאינטרנט."); };
    document.head.appendChild(s);
  }

  function handleSchedule(file) {
    if (file.size > 6 * 1024 * 1024) return msg("er", "הקובץ גדול מ-6MB. נא לצמצם או לשלוח במייל.");
    var fr = new FileReader();
    fr.onload = function () {
      var bytes = new Uint8Array(fr.result), bin = "";
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      uploaded = { name: file.name, type: file.type || "application/octet-stream", b64: btoa(bin) };
      $("#am-filename").textContent = file.name + " · " +
        (file.size < 1024 ? file.size + "B" : Math.round(file.size / 1024) + "KB");
      $("#am-filerow").hidden = false;

      if (/\.(csv|txt)$/i.test(file.name)) {           // CSV — פרסר מקומי, בלי רשת
        try {
          var txt = new TextDecoder("utf-8").decode(bytes);
          if (/\uFFFD/.test(txt)) txt = new TextDecoder("windows-1255").decode(bytes);
          var aoa = parseCSV(txt);
          if (!aoa.length) throw new Error("empty");
          return openMapper(aoa);
        } catch (e) {
          return msg("er", "לא הצלחתי לקרוא את קובץ ה-CSV. הוא בכל זאת יצורף ויישלח אלינו.");
        }
      }
      if (!/\.(xlsx|xls)$/i.test(file.name)) {          // PDF / DWG / אחר
        msg("ok", "הקובץ יצורף לטופס וישלח אלינו. פענוח אוטומטי נתמך ל-Excel ו-CSV בלבד — " +
                  "את שמות ההפעלות עדיין צריך למלא בטבלה.");
        return;
      }
      withSheetJS(function () {
        try {
          var wb = XLSX.read(bytes, { type: "array" });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
          if (!aoa.length) throw new Error("empty");
          openMapper(aoa);
        } catch (e) {
          msg("er", "לא הצלחתי לקרוא את קובץ ה-Excel. שמור/י אותו כ-CSV ונסה/י שוב — " +
                    "בכל מקרה הוא יצורף ויישלח אלינו.");
        }
      });
    };
    fr.readAsArrayBuffer(file);
  }

  var FIELDS = [
    { key: "out",   he: "מספר יציאה / ערוץ", hint: /יציאה|ערוץ|מוצא|channel|output|no\.?$|מס/i },
    { key: "room",  he: "חדר / אזור",         hint: /חדר|אזור|מיקום|room|zone/i },
    { key: "desc",  he: "תיאור ההפעלה",       hint: /תיאור|הפעלה|מעגל|שם|desc|circuit|load/i },
    { key: "load",  he: "סוג עומס",           hint: /סוג|עומס|type/i },
    { key: "power", he: "הספק / מאמ\"ת",      hint: /הספק|זרם|מאמ|amp|watt|power/i }
  ];

  function openMapper(aoa) {
    // מזהה את שורת הכותרות: הראשונה עם 2+ תאים לא ריקים
    var hdrIdx = 0;
    for (var i = 0; i < Math.min(aoa.length, 15); i++) {
      var nonEmpty = aoa[i].filter(function (c) { return String(c).trim() !== ""; }).length;
      if (nonEmpty >= 2) { hdrIdx = i; break; }
    }
    var headers = aoa[hdrIdx].map(function (h, i) {
      return String(h).trim() || "עמודה " + (i + 1);
    });
    var body = aoa.slice(hdrIdx + 1).filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ""; });
    });

    var wrap = $("#am-mapper");
    wrap.innerHTML = "";
    wrap.hidden = false;
    var box = el("div", "am-mapper-box");
    box.appendChild(el("h3", null, "נמצאו " + body.length + " שורות בקובץ — לאיזו עמודה כל שדה?"));
    var p = el("p", "sub", "בחר/י את העמודה בקובץ שמתאימה לכל שדה בטופס. מה שלא רלוונטי — השאר/י ריק.");
    box.appendChild(p);

    var tbl = el("div", "am-mapper-fields");
    FIELDS.forEach(function (f) {
      var row = el("label", "am-mapper-f");
      row.appendChild(el("span", null, f.he));
      var s = sel(headers);
      s.dataset.field = f.key;
      var guess = headers.findIndex(function (h) { return f.hint.test(h); });
      if (guess >= 0) s.value = headers[guess];
      row.appendChild(s);
      tbl.appendChild(row);
    });
    box.appendChild(tbl);

    var prev = el("div", "am-mapper-prev");
    prev.appendChild(el("b", null, "תצוגה מקדימה — 3 שורות ראשונות:"));
    var pt = el("table");
    var hr = el("tr");
    headers.forEach(function (h) { hr.appendChild(el("th", null, h)); });
    pt.appendChild(hr);
    body.slice(0, 3).forEach(function (r) {
      var trr = el("tr");
      headers.forEach(function (_, ci) { trr.appendChild(el("td", null, String(r[ci] == null ? "" : r[ci]))); });
      pt.appendChild(trr);
    });
    prev.appendChild(pt);
    box.appendChild(prev);

    var bar = el("div", "am-mapper-bar");
    var ok = el("button", "btn btn-p", "מלא את הטבלה");
    ok.type = "button";
    ok.onclick = function () {
      var map = {};
      $$("select[data-field]", box).forEach(function (s) {
        if (s.value) map[s.dataset.field] = headers.indexOf(s.value);
      });
      applySchedule(headers, body, map);
      wrap.hidden = true;
    };
    var cancel = el("button", "btn btn-s", "ביטול");
    cancel.type = "button";
    cancel.onclick = function () { wrap.hidden = true; };
    bar.appendChild(ok); bar.appendChild(cancel);
    box.appendChild(bar);
    wrap.appendChild(box);
    wrap.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function applySchedule(headers, body, map) {
    if (map.out == null && map.desc == null)
      return msg("er", "צריך לבחור לפחות עמודת תיאור או עמודת מספר יציאה.");
    var blks = $$(".am-blk", blocksEl);
    var need = Math.ceil(body.length / C.channels);
    while (blks.length < need && blks.length < 12) { addBlock(); blks = $$(".am-blk", blocksEl); }

    var filled = 0, skipped = 0;
    body.forEach(function (r, idx) {
      var outRaw = map.out != null ? String(r[map.out]).trim() : "";
      var num = parseInt(String(outRaw).replace(/[^0-9]/g, ""), 10);
      var seq = isNaN(num) ? idx + 1 : num;              // אין מספר יציאה → לפי הסדר
      var bIdx = Math.floor((seq - 1) / C.channels);
      var ch = ((seq - 1) % C.channels) + 1;
      var b = blks[bIdx];
      if (!b) { skipped++; return; }
      var tr = $('tbody tr[data-ch="' + ch + '"]', b);
      if (!tr) { skipped++; return; }
      ["room", "desc", "load", "power"].forEach(function (k) {
        if (map[k] == null) return;
        var f = $("[data-key='" + k + "']", tr);
        var v = String(r[map[k]] == null ? "" : r[map[k]]).trim();
        if (f && !f.disabled && v) { f.value = v; filled++; }
      });
    });
    blks.forEach(refreshMap);
    msg("ok", "מולאו " + filled + " שדות מתוך הקובץ" +
        (skipped ? " (" + skipped + " שורות לא הותאמו)" : "") +
        ". עכשיו עבור/י שורה שורה והשלם/י את שם ההפעלה ואת מה שחסר.");
  }

  /* ================= שליחה ================= */
  function submit() {
    var miss = validate();
    if (miss.length) return msg("er", "חסרים שדות חובה: " + miss.join(", "));
    var d = collect();
    d.rows = d.rows.filter(function (r) { return r._filled; });
    d.ts = new Date().toISOString();
    d.hp = $("#am-hp").value;
    if (uploaded) d.attach = uploaded;
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
          msg("er", (j && j.error) || "השליחה נכשלה. שמור/י טיוטה ונסה/י שוב, או שלח/י למייל sales@i-feel.co.il");
        }
      })
      .catch(function () {
        btn.disabled = false; btn.textContent = "שליחה ל-I FEEL";
        msg("er", "אין חיבור לשרת. שמור/י טיוטה בכפתור “שמירת טיוטה” ונסה/י שוב מאוחר יותר.");
      });
  }

  /* ================= אתחול ================= */
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
    $("#am-schedbtn").onclick = function () { $("#am-sched").click(); };
    $("#am-sched").onchange = function () { if (this.files[0]) handleSchedule(this.files[0]); };
    $("#am-fileclear").onclick = function () {
      uploaded = null; $("#am-filerow").hidden = true; $("#am-sched").value = "";
    };

    document.addEventListener("input", function (e) {
      if (!e.target.dataset || !e.target.dataset.key) return;
      if (C.kind === "pair") mirrorPair(e.target);
      var blk = e.target.closest && e.target.closest(".am-blk");
      if (blk && !$(".am-map", blk).hidden) refreshMap(blk);
    });

    $$(".am-lang button").forEach(function (b) {
      b.onclick = function () {
        $$(".am-lang button").forEach(function (x) {
          x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
        document.documentElement.setAttribute("data-lang", b.dataset.lang);
        document.documentElement.dir = "rtl";
        var ar = b.dataset.lang === "ar";
        $$("input[data-ph-he]").forEach(function (f) {
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
